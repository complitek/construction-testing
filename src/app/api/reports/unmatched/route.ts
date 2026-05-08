import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { sampleSets, pourEvents, summaryRecords } from '@/lib/db/schema'
import { eq, and, isNull, gte } from 'drizzle-orm'

export interface UnmatchedReport {
  kind: 'PW' | 'DD5'
  id: string
  date: string                 // pour date (PW) or shift date (DD5)
  location: string | null      // location / description
  batchTicketNumber: string | null
  mixId: string | null
}

export interface UnmatchedReportsResponse {
  pw: UnmatchedReport[]
  dd5: UnmatchedReport[]
}

// Lists every compression report (PW + DD5) that has no batch ticket scan
// attached. Used by /reports/unmatched (printable list of remaining work).
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // PW: sampleSets joined to pourEvents, only rows where ticketFileUrl is null
  const pwRows = await db
    .select({
      id: sampleSets.id,
      date: pourEvents.date,
      location: pourEvents.location,
      description: pourEvents.description,
      batchTicketNumber: sampleSets.batchTicketNumber,
      mixId: pourEvents.mixId,
    })
    .from(sampleSets)
    .innerJoin(pourEvents, eq(sampleSets.pourEventId, pourEvents.id))
    .where(isNull(sampleSets.ticketFileUrl))

  // DD5: only HD5KMDD1 mix and only after the project's DD5 start date
  const dd5Rows = await db
    .select({
      id: summaryRecords.id,
      date: summaryRecords.shiftDate,
      location: summaryRecords.locationDescription,
      batchTicketNumber: summaryRecords.batchTicketNumber,
      mixId: summaryRecords.mixId,
    })
    .from(summaryRecords)
    .where(and(
      isNull(summaryRecords.ticketFileUrl),
      eq(summaryRecords.mixId, 'HD5KMDD1'),
      gte(summaryRecords.shiftDate, '2025-11-10'),
    ))

  const pw: UnmatchedReport[] = pwRows.map(r => ({
    kind: 'PW' as const,
    id: r.id,
    date: r.date,
    location: r.description ?? r.location,
    batchTicketNumber: r.batchTicketNumber,
    mixId: r.mixId,
  })).sort((a, b) => a.date.localeCompare(b.date))

  const dd5: UnmatchedReport[] = dd5Rows.map(r => ({
    kind: 'DD5' as const,
    id: r.id,
    date: r.date,
    location: r.location,
    batchTicketNumber: r.batchTicketNumber,
    mixId: r.mixId,
  })).sort((a, b) => a.date.localeCompare(b.date))

  return NextResponse.json({ pw, dd5 } satisfies UnmatchedReportsResponse)
}
