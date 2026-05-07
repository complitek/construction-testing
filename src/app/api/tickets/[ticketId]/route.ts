import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { ticketRecords, sampleSets, pourEvents } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'


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
