import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { summaryRecords, appSettings } from '@/lib/db/schema'
import { and, eq, gte, lte, inArray } from 'drizzle-orm'
import { renderReportPdf } from '@/lib/pdf/render-report'
import { PDFDocument } from 'pdf-lib'
import type { BreakResults } from '@/lib/types'

export const maxDuration = 300

function buildBreaks(r: typeof summaryRecords.$inferSelect): BreakResults {
  const breaks: BreakResults = {}
  if (r.break1day   != null) breaks['1day']   = r.break1day
  if (r.break3day   != null) breaks['3day']   = r.break3day
  if (r.break4day   != null) breaks['4day']   = r.break4day
  if (r.break7day   != null) breaks['7day']   = r.break7day
  if (r.break14day  != null) breaks['14day']  = r.break14day
  if (r.break28day  != null) breaks['28day']  = r.break28day
  if (r.break56day  != null) breaks['56day']  = r.break56day
  if (r.break90day  != null) breaks['90day']  = r.break90day
  if (r.break120day != null) breaks['120day'] = r.break120day
  return breaks
}

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const dateFrom = url.searchParams.get('dateFrom')
  const dateTo = url.searchParams.get('dateTo')

  // DD5 PFU Tremie = mixId HD5KMDD1 only. Without this filter, bulk-print
  // would pull every Summary-sheet row (765+ non-Tremie mixes also live here).
  const conditions = [
    eq(summaryRecords.mixId, 'HD5KMDD1'),
    gte(summaryRecords.shiftDate, '2025-11-10'),
  ]
  if (dateFrom) conditions.push(gte(summaryRecords.shiftDate, dateFrom))
  if (dateTo)   conditions.push(lte(summaryRecords.shiftDate, dateTo))

  const all = await db.select().from(summaryRecords).where(and(...conditions))

  // Sort: earliest shift date first, then by batch ticket number.
  const norm = (s: string | null) => (s ?? '').replace(/\s/g, '').replace(/^0+/, '')
  all.sort((a, b) => {
    if (a.shiftDate !== b.shiftDate) return a.shiftDate.localeCompare(b.shiftDate)
    const an = norm(a.batchTicketNumber)
    const bn = norm(b.batchTicketNumber)
    const ai = /^\d+$/.test(an) ? parseInt(an, 10) : NaN
    const bi = /^\d+$/.test(bn) ? parseInt(bn, 10) : NaN
    if (!isNaN(ai) && !isNaN(bi)) return ai - bi
    return an.localeCompare(bn)
  })

  const settingRows = await db.select().from(appSettings)
    .where(inArray(appSettings.key, ['project_name', 'project_location', 'company_name', 'contract_number', 'report_prepared_by', 'logo_url', 'brand_color']))
  const sm = Object.fromEntries(settingRows.map(s => [s.key, s.value]))
  const projectSettings = {
    projectName:      sm['project_name']       ?? null,
    projectLocation:  sm['project_location']   ?? null,
    companyName:      sm['company_name']        ?? null,
    contractNumber:   sm['contract_number']     ?? null,
    reportPreparedBy: sm['report_prepared_by']  ?? null,
    logoUrl:          sm['logo_url']            ?? null,
    brandColor:       sm['brand_color']         ?? null,
  }

  const merged = await PDFDocument.create()

  for (const r of all) {
    const buf = await renderReportPdf({
      date: r.shiftDate, shift: 'day',
      spec: r.spec ?? '', location: r.locationDescription ?? '',
      description: r.locationDescription ?? '', supplier: r.supplier ?? '',
      mixId: r.mixId ?? '', definableFeature: r.dfow ?? null,
      batchTicketNumber: r.batchTicketNumber ?? 'N/A',
      sampleIdRange: null, quantitySize: null,
      area: r.area ?? null, pfuLocation: r.structure ?? null,
      wallPanelControlNo: null, structure: r.structure ?? null,
      element: r.element ?? null, sampledBy: r.sampledBy ?? null,
      sampleType: null, testedBy: null,
      slump: r.slump ?? null, astmC1611Flow: r.flow ?? null,
      airContent: r.airContent ?? null, temperature: r.temperature ?? null,
      unitWeight: r.unitWeight ?? null, wcRatio: null, vsi: null, ambientTemp: null,
      volumeCy: null, marineConcreteCumulative: null, marineConcreteLoNumber: null,
      requiredCompStrength: r.requiredStrength ?? null,
      compliance: r.complianceStrength ?? null,
      breaks: buildBreaks(r),
    }, projectSettings)

    const doc = await PDFDocument.load(buf)
    const pages = await merged.copyPages(doc, doc.getPageIndices())
    pages.forEach(p => merged.addPage(p))

    if (r.ticketFileUrl) {
      try {
        const res = await fetch(r.ticketFileUrl, {
          headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
        })
        if (res.ok) {
          const ticketBytes = new Uint8Array(await res.arrayBuffer())
          const ticketDoc = await PDFDocument.load(ticketBytes)
          const ticketPages = await merged.copyPages(ticketDoc, ticketDoc.getPageIndices())
          ticketPages.forEach(p => merged.addPage(p))
        }
      } catch { /* skip if ticket fetch fails */ }
    }
  }

  const pdfBytes = await merged.save()
  const label = dateFrom ? dateFrom.substring(0, 7) : 'dd5'

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="compression-reports-dd5-${label}.pdf"`,
    },
  })
}
