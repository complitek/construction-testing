import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { summaryRecords } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'

export interface SummaryRow {
  id: string
  shiftDate: string
  locationDescription: string | null
  dfow: string | null
  spec: string | null
  area: string | null
  structure: string | null
  element: string | null
  supplier: string | null
  mixId: string | null
  batchTicketNumber: string | null
  sampledBy: string | null
  slump: string | null
  flow: number | null
  airContent: number | null
  temperature: number | null
  unitWeight: number | null
  break1day: number | null
  break2day: number | null
  break3day: number | null
  break4day: number | null
  break7day: number | null
  break10day: number | null
  break14day: number | null
  break28day: number | null
  break56day: number | null
  break90day: number | null
  break120day: number | null
  break150day: number | null
  requiredStrength: number | null
  c1202_1: string | null
  c1202_2: string | null
  c1202_3: string | null
  c1202_4: string | null
  c1202_5: string | null
  complianceStrength: string | null
  complianceDurability: string | null
  complianceOther: string | null
  comments: string | null
  ticketFileUrl: string | null
  matchStatus: 'auto_matched' | 'manually_confirmed' | 'flagged' | 'unmatched'
  reportGenerated: boolean
  durabilityReport: boolean
  importedAt: string
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db.select().from(summaryRecords).orderBy(desc(summaryRecords.shiftDate))

  const result: SummaryRow[] = rows.map(r => ({
    id: r.id,
    shiftDate: r.shiftDate,
    locationDescription: r.locationDescription,
    dfow: r.dfow,
    spec: r.spec,
    area: r.area,
    structure: r.structure,
    element: r.element,
    supplier: r.supplier,
    mixId: r.mixId,
    batchTicketNumber: r.batchTicketNumber,
    sampledBy: r.sampledBy,
    slump: r.slump,
    flow: r.flow,
    airContent: r.airContent,
    temperature: r.temperature,
    unitWeight: r.unitWeight,
    break1day: r.break1day,
    break2day: r.break2day,
    break3day: r.break3day,
    break4day: r.break4day,
    break7day: r.break7day,
    break10day: r.break10day,
    break14day: r.break14day,
    break28day: r.break28day,
    break56day: r.break56day,
    break90day: r.break90day,
    break120day: r.break120day,
    break150day: r.break150day,
    requiredStrength: r.requiredStrength,
    c1202_1: r.c1202_1,
    c1202_2: r.c1202_2,
    c1202_3: r.c1202_3,
    c1202_4: r.c1202_4,
    c1202_5: r.c1202_5,
    complianceStrength: r.complianceStrength,
    complianceDurability: r.complianceDurability,
    complianceOther: r.complianceOther,
    comments: r.comments,
    ticketFileUrl: r.ticketFileUrl,
    matchStatus: (r.matchStatus ?? 'unmatched') as SummaryRow['matchStatus'],
    reportGenerated: r.reportGenerated ?? false,
    durabilityReport: r.durabilityReport ?? false,
    importedAt: r.importedAt.toISOString(),
  }))

  return NextResponse.json(result)
}
