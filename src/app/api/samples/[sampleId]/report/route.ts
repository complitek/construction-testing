import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { sampleSets, pourEvents } from '@/lib/db/schema'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { eq } from 'drizzle-orm'
import { renderReportPdf } from '@/lib/pdf/render-report'
import { mergeReportWithTicket } from '@/lib/pdf/merge'
import type { PourEvent, SampleSet, BreakAge, BreakResults } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'

export const maxDuration = 60

function dbRowToSampleSet(row: typeof sampleSets.$inferSelect): SampleSet {
  const breaks: BreakResults = {}
  const ageMap: Record<BreakAge, number | null> = {
    '1day': row.break1day, '3day': row.break3day, '4day': row.break4day,
    '5day': row.break5day, '7day': row.break7day, '14day': row.break14day,
    '28day': row.break28day, '56day': row.break56day, '90day': row.break90day,
    '120day': row.break120day,
  }
  for (const age of BREAK_AGES) {
    if (ageMap[age] != null) breaks[age] = ageMap[age]!
  }
  return {
    id: row.id,
    pourEventId: row.pourEventId,
    batchTicketNumber: row.batchTicketNumber,
    ticketFileUrl: row.ticketFileUrl,
    matchStatus: row.matchStatus,
    breaks,
    reportStatus: row.reportStatus,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function GET(_: Request, { params }: { params: Promise<{ sampleId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'download_report')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { sampleId } = await params
  const [sampleRow] = await db.select().from(sampleSets).where(eq(sampleSets.id, sampleId))
  if (!sampleRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [pourRow] = await db.select().from(pourEvents).where(eq(pourEvents.id, sampleRow.pourEventId))
  if (!pourRow) return NextResponse.json({ error: 'Pour event not found' }, { status: 404 })

  const pour: PourEvent = {
    id: pourRow.id,
    date: pourRow.date,
    shift: pourRow.shift,
    spec: pourRow.spec,
    location: pourRow.location,
    description: pourRow.description,
    supplier: pourRow.supplier,
    mixId: pourRow.mixId,
    createdBy: pourRow.createdBy,
    createdAt: pourRow.createdAt.toISOString(),
    updatedAt: pourRow.updatedAt.toISOString(),
  }

  const sample = dbRowToSampleSet(sampleRow)
  const reportBuffer = await renderReportPdf(pour, sample)

  let finalPdf: Uint8Array = reportBuffer

  if (sampleRow.ticketFileUrl) {
    const ticketResponse = await fetch(sampleRow.ticketFileUrl)
    if (ticketResponse.ok) {
      const ticketBytes = new Uint8Array(await ticketResponse.arrayBuffer())
      finalPdf = await mergeReportWithTicket(reportBuffer, ticketBytes)
    }
  }

  return new NextResponse(finalPdf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="report-${sampleRow.batchTicketNumber}.pdf"`,
    },
  })
}
