import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { ticketRecords, sampleSets, summaryRecords } from '@/lib/db/schema'
import { put } from '@vercel/blob'
import { splitToSinglePages, mergePdfPages } from '@/lib/pdf/split'
import { extractTicketDataFromPdf } from '@/lib/vision/extract-ticket'
import { eq, isNotNull } from 'drizzle-orm'

export const maxDuration = 300

export interface BulkUploadResult {
  totalPages: number
  totalTickets: number
  matched: number
  unmatched: number
  flagged: number
  results: Array<{
    pageStart: number
    pageEnd: number
    batchTicketNumber: string | null
    matchedSampleId: string | null
    matchedSummaryId: string | null
    matchedBatchTicket: string | null
    status: 'matched' | 'unmatched' | 'flagged'
    confidence: string
  }>
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN === 'vercel_blob_replace_me') {
    return NextResponse.json({ error: 'File storage (Vercel Blob) is not configured.' }, { status: 503 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const month = (formData.get('month') as string | null) ?? 'bulk'
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

  const pdfBytes = Buffer.from(await file.arrayBuffer())

  // Split source PDF into one-page PDFs in a single pass — was loading the
  // source N times before, which dominated wall time on big uploads.
  const tSplit = Date.now()
  const pageBytesList = await splitToSinglePages(pdfBytes)
  const totalPages = pageBytesList.length
  console.log(`[bulk-upload] split ${totalPages} pages in ${Date.now() - tSplit}ms`)

  // Bounded-concurrency runner — caps simultaneous outbound calls so we don't
  // hit Anthropic rate limits or Vercel Blob ECONNRESETs.
  async function pool<T, R>(items: T[], size: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length)
    let cursor = 0
    async function worker() {
      while (cursor < items.length) {
        const i = cursor++
        out[i] = await fn(items[i], i)
      }
    }
    await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
    return out
  }

  // Extract all pages with bounded concurrency (Anthropic Haiku ~ 8 in flight is safe).
  const tExtract = Date.now()
  const pageResults = await pool(pageBytesList, 8, async (pageBytes, idx) => {
    const extracted = await extractTicketDataFromPdf(pageBytes)
    return { pageIndex: idx, bytes: pageBytes, extracted }
  })
  console.log(`[bulk-upload] extracted ${totalPages} pages in ${((Date.now() - tExtract) / 1000).toFixed(1)}s`)

  // Group consecutive pages into ticket groups (handles 2-page tickets)
  type TicketGroup = {
    pageStart: number
    pageEnd: number
    bytes: Uint8Array
    extracted: (typeof pageResults)[0]['extracted']
  }

  const groups: TicketGroup[] = []
  let i = 0
  while (i < pageResults.length) {
    const current = pageResults[i]
    const next = pageResults[i + 1]
    const currentNum = current.extracted.batchTicketNumber?.trim()
    const nextNum = next?.extracted.batchTicketNumber?.trim()

    const shouldMerge = next && currentNum && (!nextNum || nextNum === currentNum)

    if (shouldMerge) {
      // Merge the two already-extracted page byte arrays instead of re-reading the full PDF
      const twoPageBytes = await mergePdfPages([current.bytes, next.bytes])
      groups.push({ pageStart: i, pageEnd: i + 1, bytes: twoPageBytes, extracted: current.extracted })
      i += 2
    } else {
      groups.push({ pageStart: i, pageEnd: i, bytes: current.bytes, extracted: current.extracted })
      i += 1
    }
  }

  // Load all sample sets and summary records once for matching
  const [allSamples, allSummary] = await Promise.all([
    db.select({
      id: sampleSets.id,
      batchTicketNumber: sampleSets.batchTicketNumber,
      pourEventId: sampleSets.pourEventId,
    }).from(sampleSets),
    db.select({
      id: summaryRecords.id,
      batchTicketNumber: summaryRecords.batchTicketNumber,
    }).from(summaryRecords).where(isNotNull(summaryRecords.batchTicketNumber)),
  ])

  type SummarySel = typeof allSummary[0]

  // Match all groups — check sampleSets first, then summaryRecords
  const matchedSamples: Array<{ group: TicketGroup; sample: typeof allSamples[0]; confidence: string }> = []
  const matchedSummaries: Array<{ group: TicketGroup; summary: SummarySel; confidence: string }> = []

  const results: BulkUploadResult['results'] = []

  function findSample(batchNum: string) {
    const exact = allSamples.find(s => s.batchTicketNumber.trim() === batchNum.trim())
    if (exact) return exact
    const normalized = batchNum.replace(/\s/g, '').replace(/^0+/, '')
    return allSamples.find(s => s.batchTicketNumber.replace(/\s/g, '').replace(/^0+/, '') === normalized)
  }

  function findSummary(batchNum: string) {
    const exact = allSummary.find(s => s.batchTicketNumber!.trim() === batchNum.trim())
    if (exact) return exact
    const normalized = batchNum.replace(/\s/g, '').replace(/^0+/, '')
    return allSummary.find(s => s.batchTicketNumber!.replace(/\s/g, '').replace(/^0+/, '') === normalized)
  }

  for (const group of groups) {
    const { extracted, pageStart, pageEnd } = group
    const { batchTicketNumber, confidence } = extracted

    let matchedSample: typeof allSamples[0] | undefined
    let matchedSummary: SummarySel | undefined

    if (batchTicketNumber) {
      // Look up both — same batch # can appear in PW sampleSets AND DD5 summaryRecords,
      // and both should get a link to the ticket so each report attaches the scan.
      matchedSample = findSample(batchTicketNumber)
      matchedSummary = findSummary(batchTicketNumber)
    }

    const status = !batchTicketNumber ? 'flagged'
      : (!matchedSample && !matchedSummary) ? 'unmatched'
      : confidence === 'low' ? 'flagged'
      : 'matched'

    if (status === 'matched' && matchedSample) matchedSamples.push({ group, sample: matchedSample, confidence })
    if (status === 'matched' && matchedSummary) matchedSummaries.push({ group, summary: matchedSummary, confidence })

    results.push({
      pageStart, pageEnd,
      batchTicketNumber: batchTicketNumber ?? null,
      matchedSampleId: matchedSample?.id ?? null,
      matchedSummaryId: matchedSummary?.id ?? null,
      matchedBatchTicket: matchedSample?.batchTicketNumber ?? matchedSummary?.batchTicketNumber ?? null,
      status, confidence,
    })
  }

  // Upload all tickets to Blob with bounded concurrency + retry — Vercel Blob
  // drops connections (ECONNRESET) when too many parallel writes hit at once.
  const ts = Date.now()
  const tUpload = Date.now()
  async function putWithRetry(path: string, bytes: Buffer, attempts = 3) {
    for (let i = 0; i < attempts; i++) {
      try {
        // allowOverwrite handles the case where attempt N-1 succeeded server-
        // side but the response never made it back — we'd otherwise 500 with
        // "blob already exists" on retry over a flaky network.
        return await put(path, bytes, { access: 'private', contentType: 'application/pdf', allowOverwrite: true })
      } catch (e) {
        if (i === attempts - 1) throw e
        await new Promise(r => setTimeout(r, 300 * (i + 1)))
      }
    }
    throw new Error('unreachable')
  }
  const allUploads = await pool(groups, 8, async (group, idx) => {
    const result = results[idx]
    const prefix = result.matchedSampleId ? 'pw' : result.matchedSummaryId ? 'dd5' : 'unmatched'
    const blob = await putWithRetry(
      `tickets/bulk/${month}/${prefix}-p${group.pageStart}-${group.pageEnd}-${ts}.pdf`,
      Buffer.from(group.bytes),
    )
    return { blob, group, result }
  })
  console.log(`[bulk-upload] uploaded ${groups.length} blobs in ${((Date.now() - tUpload) / 1000).toFixed(1)}s`)

  // Build ticketRecord rows for every ticket
  const ticketRows = allUploads.map(({ blob, group, result }) => ({
    pourEventId: matchedSamples.find(m => m.group === group)?.sample.pourEventId ?? null,
    batchTicketNumber: group.extracted.batchTicketNumber ?? null,
    ticketDate: group.extracted.date ?? null,
    pageStart: group.pageStart,
    pageEnd: group.pageEnd,
    fileUrl: blob.url,
    sampleSetId: result.matchedSampleId ?? null,
  }))

  if (ticketRows.length > 0) {
    await db.insert(ticketRecords).values(ticketRows)
  }

  // Update sampleSets for matched samples
  const sampleUploadMap = new Map(
    allUploads
      .filter(u => u.result.matchedSampleId)
      .map(u => [u.result.matchedSampleId!, u.blob.url])
  )
  if (sampleUploadMap.size > 0) {
    await Promise.all(
      [...sampleUploadMap.entries()].map(([sampleId, url]) =>
        db.update(sampleSets)
          .set({ ticketFileUrl: url, matchStatus: 'auto_matched', updatedAt: new Date() })
          .where(eq(sampleSets.id, sampleId))
      )
    )
  }

  // Update summaryRecords for DD5 matches
  const summaryUploadMap = new Map(
    allUploads
      .filter(u => u.result.matchedSummaryId)
      .map(u => [u.result.matchedSummaryId!, u.blob.url])
  )
  if (summaryUploadMap.size > 0) {
    await Promise.all(
      [...summaryUploadMap.entries()].map(([summaryId, url]) =>
        db.update(summaryRecords)
          .set({ ticketFileUrl: url, matchStatus: 'auto_matched' })
          .where(eq(summaryRecords.id, summaryId))
      )
    )
  }

  return NextResponse.json({
    totalPages,
    totalTickets: groups.length,
    matched: results.filter(r => r.status === 'matched').length,
    unmatched: results.filter(r => r.status === 'unmatched').length,
    flagged: results.filter(r => r.status === 'flagged').length,
    results,
  } satisfies BulkUploadResult)
}
