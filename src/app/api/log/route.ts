import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { pourEvents, sampleSets } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import type { BreakAge } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'

export interface LogRow {
  // Pour event fields
  pourId: string
  date: string
  shift: string
  spec: string
  location: string
  description: string
  supplier: string
  mixId: string
  // Sample set fields
  sampleId: string
  batchTicketNumber: string
  matchStatus: string
  reportStatus: string
  ticketFileUrl: string | null
  // Field tests
  temperature?: number | null
  slump?: string | null
  unitWeight?: number | null
  airContent?: number | null
  // Break results
  breaks: Partial<Record<BreakAge, number>>
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pours = await db.select().from(pourEvents).orderBy(desc(pourEvents.date))
  const rows: LogRow[] = []

  for (const pour of pours) {
    const samples = await db.select().from(sampleSets).where(eq(sampleSets.pourEventId, pour.id))

    for (const s of samples) {
      const breaks: Partial<Record<BreakAge, number>> = {}
      const ageMap: Record<BreakAge, number | null> = {
        '1day': s.break1day, '3day': s.break3day, '4day': s.break4day,
        '5day': s.break5day, '7day': s.break7day, '14day': s.break14day,
        '28day': s.break28day, '56day': s.break56day, '90day': s.break90day,
        '120day': s.break120day,
      }
      for (const age of BREAK_AGES) {
        if (ageMap[age] != null) breaks[age] = ageMap[age]!
      }

      rows.push({
        pourId: pour.id,
        date: pour.date,
        shift: pour.shift,
        spec: pour.spec,
        location: pour.location,
        description: pour.description,
        supplier: pour.supplier,
        mixId: pour.mixId,
        sampleId: s.id,
        batchTicketNumber: s.batchTicketNumber,
        matchStatus: s.matchStatus,
        reportStatus: s.reportStatus,
        ticketFileUrl: s.ticketFileUrl,
        temperature: s.temperature,
        slump: s.slump,
        unitWeight: s.unitWeight,
        airContent: s.airContent,
        breaks,
      })
    }
  }

  return NextResponse.json(rows)
}
