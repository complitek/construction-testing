import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { sampleSets, pourEvents } from '@/lib/db/schema'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { eq, and, gte, lte } from 'drizzle-orm'
import { renderReportPdf } from '@/lib/pdf/render-report'
import { mergeReportWithTicket } from '@/lib/pdf/merge'
import { createZipFromPdfs } from '@/lib/utils/zip'
import type { PourEvent, SampleSet, BreakAge, BreakResults } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'

export const maxDuration = 300

function toSampleSet(row: typeof sampleSets.$inferSelect): SampleSet {
  const breaks: BreakResults = {}
  const map: Record<BreakAge, number | null> = {
    '1day': row.break1day, '3day': row.break3day, '4day': row.break4day,
    '5day': row.break5day, '7day': row.break7day, '14day': row.break14day,
    '21day': row.break21day, '28day': row.break28day, '56day': row.break56day, '90day': row.break90day,
    '120day': row.break120day,
  }
  for (const age of BREAK_AGES) { if (map[age] != null) breaks[age] = map[age]! }
  return {
    id: row.id, pourEventId: row.pourEventId, batchTicketNumber: row.batchTicketNumber,
    ticketFileUrl: row.ticketFileUrl, matchStatus: row.matchStatus, breaks,
    reportStatus: row.reportStatus,
    temperature: row.temperature ?? null,
    slump: row.slump ?? null,
    unitWeight: row.unitWeight ?? null,
    airContent: row.airContent ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  }
}

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'bulk_download')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const pourId = url.searchParams.get('pourId')
  const dateFrom = url.searchParams.get('dateFrom')
  const dateTo = url.searchParams.get('dateTo')

  let samples: typeof sampleSets.$inferSelect[] = []

  if (pourId) {
    samples = await db.select().from(sampleSets).where(eq(sampleSets.pourEventId, pourId))
  } else if (dateFrom && dateTo) {
    const pours = await db.select().from(pourEvents)
      .where(and(gte(pourEvents.date, dateFrom), lte(pourEvents.date, dateTo)))
    for (const pour of pours) {
      const s = await db.select().from(sampleSets).where(eq(sampleSets.pourEventId, pour.id))
      samples.push(...s)
    }
  } else {
    return NextResponse.json({ error: 'pourId or dateFrom+dateTo required' }, { status: 400 })
  }

  const files: Array<{ name: string; data: Uint8Array }> = []

  for (const sampleRow of samples) {
    const [pourRow] = await db.select().from(pourEvents).where(eq(pourEvents.id, sampleRow.pourEventId))
    if (!pourRow) continue

    const pour: PourEvent = {
      id: pourRow.id, date: pourRow.date, shift: pourRow.shift, spec: pourRow.spec,
      location: pourRow.location, description: pourRow.description, supplier: pourRow.supplier,
      mixId: pourRow.mixId, createdBy: pourRow.createdBy,
      createdAt: pourRow.createdAt.toISOString(), updatedAt: pourRow.updatedAt.toISOString(),
    }
    const sample = toSampleSet(sampleRow)
    const reportBuffer = await renderReportPdf(pour, sample)

    let finalPdf: Uint8Array = reportBuffer as unknown as Uint8Array
    if (sampleRow.ticketFileUrl) {
      const res = await fetch(sampleRow.ticketFileUrl)
      if (res.ok) {
        const ticketBytes = new Uint8Array(await res.arrayBuffer())
        finalPdf = await mergeReportWithTicket(reportBuffer as unknown as Uint8Array, ticketBytes)
      }
    }

    files.push({ name: `report-${pourRow.date}-${sampleRow.batchTicketNumber}.pdf`, data: finalPdf })
  }

  const zipBytes = await createZipFromPdfs(files)

  return new NextResponse(Buffer.from(zipBytes), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="compression-reports-${Date.now()}.zip"`,
    },
  })
}
