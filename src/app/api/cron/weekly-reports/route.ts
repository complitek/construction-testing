import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sampleSets, pourEvents } from '@/lib/db/schema'
import { put } from '@vercel/blob'
import { renderReportPdf } from '@/lib/pdf/render-report'
import { mergeReportWithTicket } from '@/lib/pdf/merge'
import { ne, eq } from 'drizzle-orm'
import type { BreakAge, BreakResults } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'

export const maxDuration = 300

function toSampleSet(row: typeof sampleSets.$inferSelect) {
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

  if (!process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN === 'vercel_blob_replace_me') {
    return NextResponse.json({ error: 'File storage is not configured yet.' }, { status: 503 })
  }

  for (const sampleRow of allSamples) {
    try {
      const [pourRow] = await db.select().from(pourEvents)
        .where(eq(pourEvents.id, sampleRow.pourEventId))
      if (!pourRow) { skipped++; continue }

      const breaks: BreakResults = {}
      const ageMap: Record<BreakAge, number | null> = {
        '1day': sampleRow.break1day, '3day': sampleRow.break3day, '4day': sampleRow.break4day,
        '5day': sampleRow.break5day, '7day': sampleRow.break7day, '14day': sampleRow.break14day,
        '21day': sampleRow.break21day, '28day': sampleRow.break28day, '56day': sampleRow.break56day,
        '90day': sampleRow.break90day, '120day': sampleRow.break120day,
      }
      for (const age of BREAK_AGES) { if (ageMap[age] != null) breaks[age] = ageMap[age]! }

      const reportBuffer = await renderReportPdf({
        date: pourRow.date, shift: pourRow.shift, spec: pourRow.spec,
        location: pourRow.location, description: pourRow.description,
        supplier: pourRow.supplier, mixId: pourRow.mixId,
        definableFeature: pourRow.definableFeature ?? null,
        batchTicketNumber: sampleRow.batchTicketNumber,
        sampleIdRange: sampleRow.sampleIdRange ?? null,
        quantitySize: sampleRow.quantitySize ?? null,
        area: sampleRow.area ?? null, pfuLocation: sampleRow.pfuLocation ?? null,
        wallPanelControlNo: sampleRow.wallPanelControlNo ?? null,
        structure: sampleRow.structure ?? null, element: sampleRow.element ?? null,
        sampledBy: sampleRow.sampledBy ?? null, sampleType: sampleRow.sampleType ?? null,
        testedBy: sampleRow.testedBy ?? null,
        slump: sampleRow.slump ?? null, astmC1611Flow: sampleRow.astmC1611Flow ?? null,
        airContent: sampleRow.airContent ?? null, temperature: sampleRow.temperature ?? null,
        unitWeight: sampleRow.unitWeight ?? null, wcRatio: sampleRow.wcRatio ?? null,
        vsi: sampleRow.vsi ?? null, ambientTemp: sampleRow.ambientTemp ?? null,
        volumeCy: sampleRow.volumeCy ?? null,
        marineConcreteCumulative: sampleRow.marineConcreteCumulative ?? null,
        marineConcreteLoNumber: sampleRow.marineConcreteLoNumber ?? null,
        requiredCompStrength: sampleRow.requiredCompStrength ?? null,
        compliance: sampleRow.compliance ?? null, breaks,
      })

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
        { access: 'private', contentType: 'application/pdf', allowOverwrite: true }
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
