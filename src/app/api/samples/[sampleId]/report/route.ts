import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { sampleSets, pourEvents, ticketRecords, appSettings } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'

import { renderReportPdf } from '@/lib/pdf/render-report'
import { mergeReportWithTicket } from '@/lib/pdf/merge'
import type { BreakAge, BreakResults } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'

export const maxDuration = 60

export async function GET(_: Request, { params }: { params: Promise<{ sampleId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sampleId } = await params

  const [sampleRow] = await db.select().from(sampleSets).where(eq(sampleSets.id, sampleId))
  if (!sampleRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [pourRow] = await db.select().from(pourEvents).where(eq(pourEvents.id, sampleRow.pourEventId))
  if (!pourRow) return NextResponse.json({ error: 'Pour not found' }, { status: 404 })

  // Fetch project settings
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

  // Build break results
  const breaks: BreakResults = {}
  const ageMap: Record<BreakAge, number | null> = {
    '1day': sampleRow.break1day, '3day': sampleRow.break3day, '4day': sampleRow.break4day,
    '5day': sampleRow.break5day, '7day': sampleRow.break7day, '14day': sampleRow.break14day,
    '21day': sampleRow.break21day, '28day': sampleRow.break28day, '56day': sampleRow.break56day,
    '90day': sampleRow.break90day, '120day': sampleRow.break120day,
  }
  for (const age of BREAK_AGES) {
    if (ageMap[age] != null) breaks[age] = ageMap[age]!
  }

  const reportBuffer = await renderReportPdf({
    // Pour
    date: pourRow.date,
    shift: pourRow.shift,
    spec: pourRow.spec,
    location: pourRow.location,
    description: pourRow.description,
    supplier: pourRow.supplier,
    mixId: pourRow.mixId,
    definableFeature: pourRow.definableFeature ?? null,
    // Sample
    batchTicketNumber: sampleRow.batchTicketNumber,
    sampleIdRange: sampleRow.sampleIdRange ?? null,
    quantitySize: sampleRow.quantitySize ?? null,
    area: sampleRow.area ?? null,
    pfuLocation: sampleRow.pfuLocation ?? null,
    wallPanelControlNo: sampleRow.wallPanelControlNo ?? null,
    structure: sampleRow.structure ?? null,
    element: sampleRow.element ?? null,
    sampledBy: sampleRow.sampledBy ?? null,
    sampleType: sampleRow.sampleType ?? null,
    testedBy: sampleRow.testedBy ?? null,
    // Field tests
    slump: sampleRow.slump ?? null,
    astmC1611Flow: sampleRow.astmC1611Flow ?? null,
    airContent: sampleRow.airContent ?? null,
    temperature: sampleRow.temperature ?? null,
    unitWeight: sampleRow.unitWeight ?? null,
    wcRatio: sampleRow.wcRatio ?? null,
    vsi: sampleRow.vsi ?? null,
    ambientTemp: sampleRow.ambientTemp ?? null,
    // Volume / lot
    volumeCy: sampleRow.volumeCy ?? null,
    marineConcreteCumulative: sampleRow.marineConcreteCumulative ?? null,
    marineConcreteLoNumber: sampleRow.marineConcreteLoNumber ?? null,
    // Acceptance
    requiredCompStrength: sampleRow.requiredCompStrength ?? null,
    compliance: sampleRow.compliance ?? null,
    breaks,
    // Hold tracking
    holdActive: sampleRow.holdActive ?? false,
    holdPlacedDate: sampleRow.holdPlacedDate ?? null,
    holdReleasedDate: sampleRow.holdReleasedDate ?? null,
    holdBrokenDate: sampleRow.holdBrokenDate ?? null,
    holdBrokenBy: sampleRow.holdBrokenBy ?? null,
    holdBrokenReason: sampleRow.holdBrokenReason ?? null,
    holdRequiredBreakAge: sampleRow.holdRequiredBreakAge ?? null,
    holdNotes: sampleRow.holdNotes ?? null,
  }, projectSettings)

  // Try to attach batch ticket scan: ticketFileUrl on sample → ticketRecord by sampleSetId → ticketRecord by pourEventId
  let finalPdf: Uint8Array = reportBuffer
  let ticketUrl: string | null = sampleRow.ticketFileUrl
  let ticketSource = sampleRow.ticketFileUrl ? 'sampleSets.ticketFileUrl' : null
  if (!ticketUrl) {
    const bySetId = await db.select({ fileUrl: ticketRecords.fileUrl })
      .from(ticketRecords).where(eq(ticketRecords.sampleSetId, sampleId)).limit(1)
    if (bySetId[0]) { ticketUrl = bySetId[0].fileUrl; ticketSource = 'ticketRecords.sampleSetId' }
  }
  if (!ticketUrl) {
    const byPourId = await db.select({ fileUrl: ticketRecords.fileUrl })
      .from(ticketRecords).where(eq(ticketRecords.pourEventId, pourRow.id)).limit(1)
    if (byPourId[0]) { ticketUrl = byPourId[0].fileUrl; ticketSource = 'ticketRecords.pourEventId' }
  }
  console.log(`[report ${sampleId}] ticket lookup → source=${ticketSource} url=${ticketUrl?.slice(0, 80) ?? 'none'}`)

  if (ticketUrl) {
    try {
      const ticketRes = await fetch(ticketUrl, {
        headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
      })
      console.log(`[report ${sampleId}] fetch ticket → ${ticketRes.status} ${ticketRes.statusText}`)
      if (ticketRes.ok) {
        const ticketBytes = new Uint8Array(await ticketRes.arrayBuffer())
        console.log(`[report ${sampleId}] ticket bytes=${ticketBytes.byteLength}`)
        finalPdf = await mergeReportWithTicket(reportBuffer, ticketBytes)
        console.log(`[report ${sampleId}] merged final=${finalPdf.byteLength} (report was ${reportBuffer.byteLength})`)
      }
    } catch (e) {
      console.error(`[report ${sampleId}] ticket merge failed:`, e instanceof Error ? e.message : e)
    }
  }

  const dateStr = pourRow.date.replace(/-/g, '')
  const locationStr = pourRow.location.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_')
  const fileName = `${dateStr}_${locationStr}_Report.pdf`

  return new NextResponse(finalPdf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
