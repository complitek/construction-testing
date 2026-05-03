import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { ticketRecords, ticketUploads, sampleSets } from '@/lib/db/schema'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { put } from '@vercel/blob'
import { extractPageRange, getPageCount } from '@/lib/pdf/split'
import { extractTicketDataFromPdf } from '@/lib/vision/extract-ticket'
import { matchTicketsToSampleSets } from '@/lib/vision/match-tickets'
import { eq } from 'drizzle-orm'

export const maxDuration = 300

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'upload_combined_pdf')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const pourId = formData.get('pourId') as string | null

  if (!file || !pourId) {
    return NextResponse.json({ error: 'file and pourId required' }, { status: 400 })
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN === 'vercel_blob_replace_me') {
    return NextResponse.json({ error: 'File storage is not configured yet.' }, { status: 503 })
  }

  const pdfBytes = Buffer.from(await file.arrayBuffer())

  const originalBlob = await put(`tickets/combined/${pourId}-${Date.now()}.pdf`, pdfBytes, {
    access: 'public', contentType: 'application/pdf',
  })

  const [upload] = await db.insert(ticketUploads).values({
    pourEventId: pourId,
    originalFileUrl: originalBlob.url,
    processingStatus: 'processing',
    createdBy: userId,
  }).returning()

  const totalPages = await getPageCount(pdfBytes)

  type PageResult = { pageIndex: number; bytes: Uint8Array; extracted: Awaited<ReturnType<typeof extractTicketDataFromPdf>> }
  const pageResults: PageResult[] = []

  for (let i = 0; i < totalPages; i++) {
    const pageBytes = await extractPageRange(pdfBytes, i, i)
    const extracted = await extractTicketDataFromPdf(pageBytes)
    pageResults.push({ pageIndex: i, bytes: pageBytes, extracted })
  }

  const ticketGroups: Array<{ pageStart: number; pageEnd: number; bytes: Uint8Array; extracted: typeof pageResults[0]['extracted'] }> = []
  let i = 0
  while (i < pageResults.length) {
    const current = pageResults[i]
    const next = pageResults[i + 1]

    if (next && !next.extracted.batchTicketNumber && current.extracted.batchTicketNumber) {
      const twoPageBytes = await extractPageRange(pdfBytes, i, i + 1)
      ticketGroups.push({ pageStart: i, pageEnd: i + 1, bytes: twoPageBytes, extracted: current.extracted })
      i += 2
    } else {
      ticketGroups.push({ pageStart: i, pageEnd: i, bytes: current.bytes, extracted: current.extracted })
      i += 1
    }
  }

  const pourSamples = await db.select({ id: sampleSets.id, batchTicketNumber: sampleSets.batchTicketNumber })
    .from(sampleSets).where(eq(sampleSets.pourEventId, pourId))

  const matchResults = matchTicketsToSampleSets(
    ticketGroups.map(g => ({ extractedData: g.extracted, pageStart: g.pageStart, pageEnd: g.pageEnd })),
    pourSamples
  )

  const savedRecords = []
  for (let j = 0; j < matchResults.length; j++) {
    const match = matchResults[j]
    const group = ticketGroups[j]

    const blob = await put(
      `tickets/extracted/${pourId}-p${match.pageStart}-${match.pageEnd}-${Date.now()}.pdf`,
      Buffer.from(group.bytes),
      { access: 'public', contentType: 'application/pdf' }
    )

    const [record] = await db.insert(ticketRecords).values({
      pourEventId: pourId,
      batchTicketNumber: match.extractedData.batchTicketNumber,
      pageStart: match.pageStart,
      pageEnd: match.pageEnd,
      fileUrl: blob.url,
      sampleSetId: match.matchedSampleSetId,
    }).returning()

    if (match.matchedSampleSetId) {
      await db.update(sampleSets)
        .set({ ticketFileUrl: blob.url, matchStatus: match.matchStatus, updatedAt: new Date() })
        .where(eq(sampleSets.id, match.matchedSampleSetId))
    }

    savedRecords.push({ ...record, matchStatus: match.matchStatus })
  }

  await db.update(ticketUploads)
    .set({ processingStatus: 'complete' })
    .where(eq(ticketUploads.id, upload.id))

  return NextResponse.json({
    uploadId: upload.id,
    totalTickets: ticketGroups.length,
    autoMatched: matchResults.filter(m => m.matchStatus === 'auto_matched').length,
    flagged: matchResults.filter(m => m.matchStatus === 'flagged').length,
    unmatched: matchResults.filter(m => m.matchStatus === 'unmatched').length,
    records: savedRecords,
  })
}
