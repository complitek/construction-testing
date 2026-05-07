import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { ticketRecords, pourEvents, sampleSets } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export interface TicketListItem {
  id: string
  batchTicketNumber: string | null
  ticketDate: string | null
  pageStart: number
  pageEnd: number
  sampleSetId: string | null
  matchStatus: 'auto_matched' | 'manually_confirmed' | 'unmatched' | null
  createdAt: string
  pourDate: string | null
  pourLocation: string | null
  pourDescription: string | null
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db
    .select({
      id: ticketRecords.id,
      batchTicketNumber: ticketRecords.batchTicketNumber,
      ticketDate: ticketRecords.ticketDate,
      pageStart: ticketRecords.pageStart,
      pageEnd: ticketRecords.pageEnd,
      sampleSetId: ticketRecords.sampleSetId,
      createdAt: ticketRecords.createdAt,
      pourDate: pourEvents.date,
      pourLocation: pourEvents.location,
      pourDescription: pourEvents.description,
      matchStatus: sampleSets.matchStatus,
    })
    .from(ticketRecords)
    .leftJoin(pourEvents, eq(ticketRecords.pourEventId, pourEvents.id))
    .leftJoin(sampleSets, eq(ticketRecords.sampleSetId, sampleSets.id))

  const items: TicketListItem[] = rows.map(r => ({
    id: r.id,
    batchTicketNumber: r.batchTicketNumber,
    ticketDate: r.ticketDate ?? null,
    pageStart: r.pageStart,
    pageEnd: r.pageEnd,
    sampleSetId: r.sampleSetId ?? null,
    matchStatus: (r.matchStatus ?? null) as TicketListItem['matchStatus'],
    createdAt: r.createdAt.toISOString(),
    pourDate: r.pourDate ?? null,
    pourLocation: r.pourLocation ?? null,
    pourDescription: r.pourDescription ?? null,
  }))

  items.sort((a, b) => {
    const da = a.pourDate ?? a.ticketDate ?? a.createdAt
    const db2 = b.pourDate ?? b.ticketDate ?? b.createdAt
    return db2.localeCompare(da)
  })

  return NextResponse.json(items)
}
