import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { ticketRecords, sampleSets, summaryRecords } from '@/lib/db/schema'
import { eq, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { extractTicketDataFromPdf } from '@/lib/vision/extract-ticket'

// Re-runs AI extraction against tickets matching a selection mode and updates
// each ticketRecord in place. Modes:
//   - "unreadable" (default): batch is null/empty
//   - "p209":                 batch matches the P-209 project code (AI grabbed
//                             the project header instead of the real ticket #)
// Pulls the existing blob (no new uploads), re-runs extraction, and re-links
// to PW sampleSets / DD5 summaryRecords if the recovered batch # matches.
export const maxDuration = 300

const norm = (s: string | null) => (s ?? '').replace(/\s/g, '').replace(/^0+/, '')

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { mode?: 'unreadable' | 'p209' }
  const mode = body.mode ?? 'unreadable'

  const whereClause = mode === 'p209'
    ? sql`${ticketRecords.batchTicketNumber} ~* '^p[[:space:]\\-_]?209$'`
    : or(
        isNull(ticketRecords.batchTicketNumber),
        eq(ticketRecords.batchTicketNumber, ''),
        eq(ticketRecords.batchTicketNumber, 'null'),
      )

  const all = await db.select({
    id: ticketRecords.id,
    batch: ticketRecords.batchTicketNumber,
    fileUrl: ticketRecords.fileUrl,
    sampleSetId: ticketRecords.sampleSetId,
  })
  .from(ticketRecords)
  .where(whereClause)

  const total = all.length
  if (total === 0) {
    return NextResponse.json({ total: 0, recovered: 0, stillNull: 0, matched: 0, fetchFailed: 0 })
  }

  const [allSamples, allSummary] = await Promise.all([
    db.select({ id: sampleSets.id, batch: sampleSets.batchTicketNumber, pourEventId: sampleSets.pourEventId }).from(sampleSets),
    db.select({ id: summaryRecords.id, batch: summaryRecords.batchTicketNumber }).from(summaryRecords).where(isNotNull(summaryRecords.batchTicketNumber)),
  ])
  const sampleByBatch = new Map(allSamples.map(s => [norm(s.batch), s]))
  const summaryByBatch = new Map(allSummary.map(s => [norm(s.batch as string), s]))

  let recovered = 0
  let stillNull = 0
  let matched = 0
  let fetchFailed = 0

  // Bounded concurrency so we don't slam Anthropic with 100+ parallel calls.
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

  await pool(all, 6, async (t) => {
    let bytes: Uint8Array
    try {
      const res = await fetch(t.fileUrl, {
        headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
      })
      if (!res.ok) { fetchFailed++; return }
      bytes = new Uint8Array(await res.arrayBuffer())
    } catch {
      fetchFailed++
      return
    }

    const ex = await extractTicketDataFromPdf(bytes)

    // Detach any pre-existing match if we're re-extracting (the old batch # was wrong).
    // We restore it below if the new batch # produces a real match.
    if (t.sampleSetId) {
      await db.update(sampleSets)
        .set({ ticketFileUrl: null, matchStatus: 'unmatched', updatedAt: new Date() })
        .where(eq(sampleSets.id, t.sampleSetId))
    }

    if (!ex.batchTicketNumber) {
      // Still couldn't read it — clear out the stale wrong batch # so it
      // shows up as unreadable for manual editing.
      await db.update(ticketRecords)
        .set({ batchTicketNumber: null, ticketDate: ex.date ?? null, sampleSetId: null, pourEventId: null })
        .where(eq(ticketRecords.id, t.id))
      stillNull++
      return
    }

    recovered++
    const k = norm(ex.batchTicketNumber)
    const sample = sampleByBatch.get(k)
    const summary = summaryByBatch.get(k)

    await db.update(ticketRecords)
      .set({
        batchTicketNumber: ex.batchTicketNumber,
        ticketDate: ex.date ?? null,
        sampleSetId: sample?.id ?? null,
        pourEventId: sample?.pourEventId ?? null,
      })
      .where(eq(ticketRecords.id, t.id))

    if (sample) {
      await db.update(sampleSets)
        .set({ ticketFileUrl: t.fileUrl, matchStatus: 'auto_matched', updatedAt: new Date() })
        .where(eq(sampleSets.id, sample.id))
      matched++
    }
    if (summary) {
      await db.update(summaryRecords)
        .set({ ticketFileUrl: t.fileUrl, matchStatus: 'auto_matched' })
        .where(eq(summaryRecords.id, summary.id))
      if (!sample) matched++  // count match exactly once per ticket
    }
  })

  return NextResponse.json({ total, recovered, stillNull, matched, fetchFailed })
}
