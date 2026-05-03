import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sampleSets, pourEvents } from '@/lib/db/schema'
import { put } from '@vercel/blob'
import { renderReportPdf } from '@/lib/pdf/render-report'
import { mergeReportWithTicket } from '@/lib/pdf/merge'
import { ne, eq } from 'drizzle-orm'
import type { PourEvent, SampleSet, BreakAge, BreakResults } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'

export const maxDuration = 300

function toSampleSet(row: typeof sampleSets.$inferSelect): SampleSet {
  const breaks: BreakResults = {}
  const map: Record<BreakAge, number | null> = {
    '1day': row.break1day, '3day': row.break3day, '4day': row.break4day,
    '5day': row.break5day, '7day': row.break7day, '14day': row.break14day,
    '21day': row.break21day, '28day': row.break28day, '56day': row.break56day,
    '90day': row.break90day, '120day': row.break120day,
  }
  for (const age of BREAK_AGES) { if (map[age] != null) breaks[age] = map[age]! }
  return {
    id: row.id, pourEventId: row.pourEventId, batchTicketNumber: row.batchTicketNumber,
    ticketFileUrl: row.ticketFileUrl, matchStatus: row.matchStatus, breaks,
    reportStatus: row.reportStatus, reportFileUrl: row.reportFileUrl ?? null,
    createdBy: row.createdBy, createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    temperature: row.temperature ?? null, slump: row.slump ?? null,
    unitWeight: row.unitWeight ?? null, airContent: row.airContent ?? null,
  }
}

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get all sample sets that have at least one break result
  const allSamples = await db.select().from(sampleSets)
    .where(ne(sampleSets.reportStatus, 'pending_breaks'))

  let processed = 0
  let skipped = 0
  const errors: string[] = []

  for (const sampleRow of allSamples) {
    try {
      const [pourRow] = await db.select().from(pourEvents)
        .where(eq(pourEvents.id, sampleRow.pourEventId))
      if (!pourRow) { skipped++; continue }

      const pour: PourEvent = {
        id: pourRow.id, date: pourRow.date, shift: pourRow.shift,
        spec: pourRow.spec, location: pourRow.location,
        description: pourRow.description, supplier: pourRow.supplier,
        mixId: pourRow.mixId, createdBy: pourRow.createdBy,
        createdAt: pourRow.createdAt.toISOString(),
        updatedAt: pourRow.updatedAt.toISOString(),
      }

      const sample = toSampleSet(sampleRow)
      const reportBuffer = await renderReportPdf(pour, sample)

      let finalPdf: Uint8Array = reportBuffer
      if (sampleRow.ticketFileUrl) {
        const res = await fetch(sampleRow.ticketFileUrl)
        if (res.ok) {
          const ticketBytes = new Uint8Array(await res.arrayBuffer())
          finalPdf = await mergeReportWithTicket(reportBuffer, ticketBytes)
        }
      }

      // Store with deterministic filename so each run overwrites the previous
      const blob = await put(
        `reports/${sampleRow.id}.pdf`,
        Buffer.from(finalPdf),
        { access: 'public', contentType: 'application/pdf', allowOverwrite: true }
      )

      await db.update(sampleSets)
        .set({ reportFileUrl: blob.url, reportStatus: 'exported', updatedAt: new Date() })
        .where(eq(sampleSets.id, sampleRow.id))

      processed++
    } catch (err) {
      errors.push(`${sampleRow.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json({
    success: true,
    processed,
    skipped,
    errors,
    runAt: new Date().toISOString(),
  })
}
