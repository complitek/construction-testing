import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { ticketRecords } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(_: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ticketId } = await params

  const [record] = await db.select().from(ticketRecords).where(eq(ticketRecords.id, ticketId))
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const res = await fetch(record.fileUrl, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  })

  if (!res.ok) return NextResponse.json({ error: 'Ticket not accessible' }, { status: 502 })

  const bytes = await res.arrayBuffer()

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="ticket-${record.batchTicketNumber ?? ticketId}.pdf"`,
    },
  })
}
