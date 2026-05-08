import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { ticketRecords, sampleSets, pourEvents, summaryRecords } from '@/lib/db/schema'
import { eq, isNotNull } from 'drizzle-orm'


function buildTicketFilename(
  pourDate: string | null,
  ticketDate: string | null,
  location: string | null,
  batchTicketNumber: string | null
): string {
  const date = pourDate ?? ticketDate
  const dateStr = date ? date.replace(/-/g, '') : 'UNKNOWN'
  const locStr = (location ?? 'Unknown')
    .replace(/[^a-zA-Z0-9#\-']/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  const ticketStr = (batchTicketNumber ?? 'Unknown').replace(/[^a-zA-Z0-9\-]/g, '_')
  return `${dateStr}_${locStr}_Batch_Ticket_${ticketStr}.pdf`
}

export async function GET(_: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { userId } = await auth()
  if (!userId) return new NextResponse('Unauthorized', { status: 401 })

  const { ticketId } = await params

  const rows = await db.select({
    fileUrl: ticketRecords.fileUrl,
    batchTicketNumber: ticketRecords.batchTicketNumber,
    ticketDate: ticketRecords.ticketDate,
    pourDate: pourEvents.date,
    pourLocation: pourEvents.location,
  })
    .from(ticketRecords)
    .leftJoin(pourEvents, eq(ticketRecords.pourEventId, pourEvents.id))
    .where(eq(ticketRecords.id, ticketId))

  if (!rows.length) return new NextResponse('Not found', { status: 404 })
  const rec = rows[0]

  const res = await fetch(rec.fileUrl, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  })
  if (!res.ok) return new NextResponse('File not found in storage', { status: 404 })

  const filename = buildTicketFilename(rec.pourDate, rec.ticketDate, rec.pourLocation, rec.batchTicketNumber)

  return new NextResponse(res.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

// Manual edit of a ticket's batch # and/or date. After updating the record,
// re-runs the match against sampleSets and summaryRecords using the new batch #
// — clears the old link if the batch changed and there's no new match, or
// re-points to a different sample / DD5 record if there is.
export async function PATCH(req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ticketId } = await params
  const body = await req.json().catch(() => ({})) as { batchTicketNumber?: string | null; ticketDate?: string | null }

  const [existing] = await db.select().from(ticketRecords).where(eq(ticketRecords.id, ticketId))
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const newBatch = body.batchTicketNumber === undefined
    ? existing.batchTicketNumber
    : (body.batchTicketNumber === null || body.batchTicketNumber.trim() === '' ? null : body.batchTicketNumber.trim())
  const newDate = body.ticketDate === undefined
    ? existing.ticketDate
    : (body.ticketDate === null || body.ticketDate.trim() === '' ? null : body.ticketDate.trim())

  // If the batch # changed, detach the previous links.
  const batchChanged = (existing.batchTicketNumber ?? null) !== (newBatch ?? null)

  if (batchChanged && existing.sampleSetId) {
    // Old sample set — only clear if no other ticket is still pointed at it.
    const others = await db.select({ id: ticketRecords.id })
      .from(ticketRecords)
      .where(eq(ticketRecords.sampleSetId, existing.sampleSetId))
    if (others.length <= 1) {
      await db.update(sampleSets)
        .set({ ticketFileUrl: null, matchStatus: 'unmatched', updatedAt: new Date() })
        .where(eq(sampleSets.id, existing.sampleSetId))
    }
  }

  // Re-match if we have a batch #.
  const norm = (s: string | null) => (s ?? '').replace(/\s/g, '').replace(/^0+/, '')
  let newSampleSetId: string | null = null
  let newPourEventId: string | null = null
  let newSummaryId: string | null = null

  if (newBatch) {
    const k = norm(newBatch)
    const samples = await db.select({ id: sampleSets.id, batch: sampleSets.batchTicketNumber, pourEventId: sampleSets.pourEventId }).from(sampleSets)
    const sample = samples.find(s => norm(s.batch) === k)
    if (sample) { newSampleSetId = sample.id; newPourEventId = sample.pourEventId }

    const summaries = await db.select({ id: summaryRecords.id, batch: summaryRecords.batchTicketNumber }).from(summaryRecords).where(isNotNull(summaryRecords.batchTicketNumber))
    const summary = summaries.find(s => norm(s.batch as string) === k)
    if (summary) newSummaryId = summary.id
  }

  await db.update(ticketRecords)
    .set({
      batchTicketNumber: newBatch,
      ticketDate: newDate,
      sampleSetId: batchChanged ? newSampleSetId : existing.sampleSetId,
      pourEventId: batchChanged ? newPourEventId : existing.pourEventId,
    })
    .where(eq(ticketRecords.id, ticketId))

  // Link the new sample set / summary record if we found one.
  if (batchChanged && newSampleSetId) {
    await db.update(sampleSets)
      .set({ ticketFileUrl: existing.fileUrl, matchStatus: 'manually_confirmed', updatedAt: new Date() })
      .where(eq(sampleSets.id, newSampleSetId))
  }
  if (batchChanged && newSummaryId) {
    await db.update(summaryRecords)
      .set({ ticketFileUrl: existing.fileUrl, matchStatus: 'manually_confirmed' })
      .where(eq(summaryRecords.id, newSummaryId))
  }

  return NextResponse.json({
    success: true,
    matched: { sampleSetId: newSampleSetId, summaryRecordId: newSummaryId },
  })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ticketId } = await params

  const [record] = await db.select().from(ticketRecords).where(eq(ticketRecords.id, ticketId))
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Clear ticketFileUrl on linked sample set if the file URL matches
  if (record.sampleSetId) {
    await db.update(sampleSets)
      .set({ ticketFileUrl: null, matchStatus: 'unmatched', updatedAt: new Date() })
      .where(eq(sampleSets.id, record.sampleSetId))
  }

  await db.delete(ticketRecords).where(eq(ticketRecords.id, ticketId))

  return NextResponse.json({ success: true })
}
