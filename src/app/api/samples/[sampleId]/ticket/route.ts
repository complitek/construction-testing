import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { sampleSets, ticketRecords, pourEvents } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'


export async function GET(_: Request, { params }: { params: Promise<{ sampleId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sampleId } = await params

  // Get sample + pour info for filename
  const rows = await db.select({
    ticketFileUrl: sampleSets.ticketFileUrl,
    batchTicketNumber: sampleSets.batchTicketNumber,
    pourDate: pourEvents.date,
    pourLocation: pourEvents.location,
  })
    .from(sampleSets)
    .leftJoin(pourEvents, eq(sampleSets.pourEventId, pourEvents.id))
    .where(eq(sampleSets.id, sampleId))

  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const sample = rows[0]

  // Primary: ticketFileUrl on the sample set
  // Fallback: first ticketRecord linked to this sampleSetId
  let fileUrl = sample.ticketFileUrl
  if (!fileUrl) {
    const [rec] = await db.select({ fileUrl: ticketRecords.fileUrl })
      .from(ticketRecords)
      .where(eq(ticketRecords.sampleSetId, sampleId))
    fileUrl = rec?.fileUrl ?? null
  }

  if (!fileUrl) return NextResponse.json({ error: 'No ticket attached' }, { status: 404 })

  const res = await fetch(fileUrl, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  })
  if (!res.ok) return NextResponse.json({ error: 'Ticket file not accessible' }, { status: 502 })

  const dateStr = (sample.pourDate ?? '').replace(/-/g, '') || 'UNKNOWN'
  const locStr = (sample.pourLocation ?? 'Unknown')
    .replace(/[^a-zA-Z0-9#\-']/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  const ticketStr = (sample.batchTicketNumber ?? 'Unknown').replace(/[^a-zA-Z0-9\-]/g, '_')
  const filename = `${dateStr}_${locStr}_Batch_Ticket_${ticketStr}.pdf`

  return new NextResponse(res.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
