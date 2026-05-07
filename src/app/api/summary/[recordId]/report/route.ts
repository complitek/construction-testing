import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { summaryRecords, appSettings } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { renderReportPdf } from '@/lib/pdf/render-report'
import { mergeReportWithTicket } from '@/lib/pdf/merge'
import type { BreakResults } from '@/lib/types'

export const maxDuration = 60

export async function GET(_: Request, { params }: { params: Promise<{ recordId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { recordId } = await params
  const [r] = await db.select().from(summaryRecords).where(eq(summaryRecords.id, recordId))
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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

  const reportBuffer = await renderReportPdf({
    date: r.shiftDate,
    shift: 'day',
    spec: r.spec ?? '',
    location: r.locationDescription ?? '',
    description: r.locationDescription ?? '',
    supplier: r.supplier ?? '',
    mixId: r.mixId ?? '',
    definableFeature: r.dfow ?? null,
    batchTicketNumber: r.batchTicketNumber ?? 'N/A',
    sampleIdRange: null,
    quantitySize: null,
    area: r.area ?? null,
    pfuLocation: r.structure ?? null,
    wallPanelControlNo: null,
    structure: r.structure ?? null,
    element: r.element ?? null,
    sampledBy: r.sampledBy ?? null,
    sampleType: null,
    testedBy: null,
    slump: r.slump ?? null,
    astmC1611Flow: r.flow ?? null,
    airContent: r.airContent ?? null,
    temperature: r.temperature ?? null,
    unitWeight: r.unitWeight ?? null,
    wcRatio: null,
    vsi: null,
    ambientTemp: null,
    volumeCy: null,
    marineConcreteCumulative: null,
    marineConcreteLoNumber: null,
    requiredCompStrength: r.requiredStrength ?? null,
    compliance: r.complianceStrength ?? null,
    breaks,
  }, projectSettings)

  // Append matched batch ticket scan as the final page when one is linked.
  let finalPdf: Uint8Array = reportBuffer
  if (r.ticketFileUrl) {
    try {
      const ticketRes = await fetch(r.ticketFileUrl, {
        headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
      })
      console.log(`[summary report ${recordId}] fetch ticket → ${ticketRes.status}`)
      if (ticketRes.ok) {
        const ticketBytes = new Uint8Array(await ticketRes.arrayBuffer())
        finalPdf = await mergeReportWithTicket(reportBuffer, ticketBytes)
        console.log(`[summary report ${recordId}] merged ${ticketBytes.byteLength}B ticket into ${finalPdf.byteLength}B final`)
      }
    } catch (e) {
      console.error(`[summary report ${recordId}] ticket merge failed:`, e instanceof Error ? e.message : e)
    }
  }

  const dateStr = r.shiftDate.replace(/-/g, '')
  const locStr = (r.locationDescription ?? 'DD5').replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_')
  const fileName = `${dateStr}_${locStr}_DD5_Report.pdf`

  return new NextResponse(finalPdf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
