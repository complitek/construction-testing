import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { sampleSets, pourEvents, ticketRecords, appSettings } from '@/lib/db/schema'
import { eq, and, gte, lte, inArray } from 'drizzle-orm'
import { renderReportPdf } from '@/lib/pdf/render-report'
import { mergeReportWithTicket } from '@/lib/pdf/merge'
import { PDFDocument } from 'pdf-lib'
import type { BreakAge, BreakResults } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'

export const maxDuration = 300

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const dateFrom = url.searchParams.get('dateFrom')
  const dateTo = url.searchParams.get('dateTo')

  let samples: typeof sampleSets.$inferSelect[] = []

  if (dateFrom && dateTo) {
    const pours = await db.select().from(pourEvents)
      .where(and(gte(pourEvents.date, dateFrom), lte(pourEvents.date, dateTo)))
    for (const pour of pours) {
      const s = await db.select().from(sampleSets).where(eq(sampleSets.pourEventId, pour.id))
      samples.push(...s)
    }
  } else {
    samples = await db.select().from(sampleSets)
  }

  const settingRows = await db.select().from(appSettings)
    .where(inArray(appSettings.key, ['project_name', 'project_location', 'company_name', 'contract_number', 'report_prepared_by', 'logo_url', 'brand_color']))
  const settingsMap = Object.fromEntries(settingRows.map(r => [r.key, r.value]))
  const projectSettings = {
    projectName:      settingsMap['project_name']       ?? null,
    projectLocation:  settingsMap['project_location']   ?? null,
    companyName:      settingsMap['company_name']        ?? null,
    contractNumber:   settingsMap['contract_number']     ?? null,
    reportPreparedBy: settingsMap['report_prepared_by']  ?? null,
    logoUrl:          settingsMap['logo_url']            ?? null,
    brandColor:       settingsMap['brand_color']         ?? null,
  }

  const merged = await PDFDocument.create()

  for (const sampleRow of samples) {
    const [pourRow] = await db.select().from(pourEvents).where(eq(pourEvents.id, sampleRow.pourEventId))
    if (!pourRow) continue

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
    }, projectSettings)

    const ticketUrl = sampleRow.ticketFileUrl
      ?? (await db.select().from(ticketRecords).where(eq(ticketRecords.pourEventId, pourRow.id)).limit(1))[0]?.fileUrl
      ?? null

    let finalPdf: Uint8Array = reportBuffer
    if (ticketUrl) {
      try {
        const res = await fetch(ticketUrl, {
          headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
        })
        if (res.ok) {
          const ticketBytes = new Uint8Array(await res.arrayBuffer())
          finalPdf = await mergeReportWithTicket(reportBuffer, ticketBytes)
        }
      } catch { /* skip if ticket fetch fails */ }
    }

    const doc = await PDFDocument.load(finalPdf)
    const pages = await merged.copyPages(doc, doc.getPageIndices())
    pages.forEach(p => merged.addPage(p))
  }

  const pdfBytes = await merged.save()
  const label = dateFrom ? dateFrom.substring(0, 7) : 'all'

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="compression-reports-${label}.pdf"`,
    },
  })
}
