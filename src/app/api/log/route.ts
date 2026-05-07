import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { pourEvents, sampleSets, ticketRecords } from '@/lib/db/schema'
import { desc, eq, isNotNull } from 'drizzle-orm'
import type { BreakAge } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'

export interface LogRow {
  pourId: string
  date: string
  shift: string
  spec: string
  location: string
  description: string
  supplier: string
  mixId: string
  definableFeature: string | null
  sampleId: string
  batchTicketNumber: string
  matchStatus: string
  reportStatus: string
  reportFileUrl: string | null
  ticketFileUrl: string | null
  sampleIdRange: string | null
  quantitySize: string | null
  area: string | null
  pfuLocation: string | null
  wallPanelControlNo: string | null
  structure: string | null
  element: string | null
  sampledBy: string | null
  sampleType: string | null
  testedBy: string | null
  temperature: number | null
  slump: string | null
  unitWeight: number | null
  airContent: number | null
  astmC1611Flow: number | null
  wcRatio: number | null
  vsi: number | null
  ambientTemp: number | null
  volumeCy: string | null
  totalDailyVol: number | null
  marineConcreteCumulative: number | null
  marineConcreteLoNumber: string | null
  requiredCompStrength: number | null
  compliance: string | null
  retested: boolean
  ncrIssued: boolean
  dateSubmittedToGovt: string | null
  comments: string | null
  breaks: Partial<Record<BreakAge, number>>
  holdActive: boolean
  holdPlacedDate: string | null
  holdReleasedDate: string | null
  holdBrokenDate: string | null
  holdBrokenBy: string | null
  holdBrokenReason: string | null
  holdRequiredBreakAge: string | null
  holdNotes: string | null
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Single join — no N+1
  const joined = await db
    .select()
    .from(sampleSets)
    .innerJoin(pourEvents, eq(sampleSets.pourEventId, pourEvents.id))
    .orderBy(desc(pourEvents.date))

  // Build a set of sampleSetIds that have at least one ticket record
  const ticketedSamples = await db
    .select({ sampleSetId: ticketRecords.sampleSetId })
    .from(ticketRecords)
    .where(isNotNull(ticketRecords.sampleSetId))
  const ticketedSet = new Set(ticketedSamples.map(r => r.sampleSetId!))

  const rows: LogRow[] = joined.map(({ pour_events: p, sample_sets: s }) => {
    const breaks: Partial<Record<BreakAge, number>> = {}
    const ageMap: Record<BreakAge, number | null> = {
      '1day': s.break1day, '3day': s.break3day, '4day': s.break4day,
      '5day': s.break5day, '7day': s.break7day, '14day': s.break14day,
      '21day': s.break21day, '28day': s.break28day, '56day': s.break56day,
      '90day': s.break90day, '120day': s.break120day,
    }
    for (const age of BREAK_AGES) {
      if (ageMap[age] != null) breaks[age] = ageMap[age]!
    }
    return {
      pourId: p.id,
      date: p.date,
      shift: p.shift,
      spec: p.spec,
      location: p.location,
      description: p.description,
      supplier: p.supplier,
      mixId: p.mixId,
      definableFeature: p.definableFeature ?? null,
      sampleId: s.id,
      batchTicketNumber: s.batchTicketNumber,
      matchStatus: s.matchStatus,
      reportStatus: s.reportStatus,
      reportFileUrl: s.reportFileUrl ?? null,
      ticketFileUrl: s.ticketFileUrl ?? (ticketedSet.has(s.id) ? 'linked' : null),
      sampleIdRange: s.sampleIdRange ?? null,
      quantitySize: s.quantitySize ?? null,
      area: s.area ?? null,
      pfuLocation: s.pfuLocation ?? null,
      wallPanelControlNo: s.wallPanelControlNo ?? null,
      structure: s.structure ?? null,
      element: s.element ?? null,
      sampledBy: s.sampledBy ?? null,
      sampleType: s.sampleType ?? null,
      testedBy: s.testedBy ?? null,
      temperature: s.temperature ?? null,
      slump: s.slump ?? null,
      unitWeight: s.unitWeight ?? null,
      airContent: s.airContent ?? null,
      astmC1611Flow: s.astmC1611Flow ?? null,
      wcRatio: s.wcRatio ?? null,
      vsi: s.vsi ?? null,
      ambientTemp: s.ambientTemp ?? null,
      volumeCy: s.volumeCy ?? null,
      totalDailyVol: s.totalDailyVol ?? null,
      marineConcreteCumulative: s.marineConcreteCumulative ?? null,
      marineConcreteLoNumber: s.marineConcreteLoNumber ?? null,
      requiredCompStrength: s.requiredCompStrength ?? null,
      compliance: s.compliance ?? null,
      retested: s.retested ?? false,
      ncrIssued: s.ncrIssued ?? false,
      dateSubmittedToGovt: s.dateSubmittedToGovt ?? null,
      comments: s.comments ?? null,
      breaks,
      holdActive: s.holdActive ?? false,
      holdPlacedDate: s.holdPlacedDate ?? null,
      holdReleasedDate: s.holdReleasedDate ?? null,
      holdBrokenDate: s.holdBrokenDate ?? null,
      holdBrokenBy: s.holdBrokenBy ?? null,
      holdBrokenReason: s.holdBrokenReason ?? null,
      holdRequiredBreakAge: s.holdRequiredBreakAge ?? null,
      holdNotes: s.holdNotes ?? null,
    }
  })

  return NextResponse.json(rows)
}
