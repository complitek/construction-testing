import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { sampleSets, pourEvents, appSettings } from '@/lib/db/schema'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { eq } from 'drizzle-orm'
import type { BreakAge } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'
import { calculateAllBreakDates } from '@/lib/utils/break-dates'
import type { FieldMapping } from '@/lib/excel/analyze-template'

export const maxDuration = 60

function fmt(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y}`
}
function str(v: string | number | null | undefined): string {
  return v != null ? String(v) : ''
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
  if (!pourRow) return NextResponse.json({ error: 'Pour not found' }, { status: 404 })

  const [templateSetting] = await db.select().from(appSettings).where(eq(appSettings.key, 'excel_template_url'))
  if (!templateSetting) {
    return NextResponse.json({ error: 'No template uploaded. Go to Templates to upload one.' }, { status: 404 })
  }

  const templateRes = await fetch(templateSetting.value, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  })
  if (!templateRes.ok) return NextResponse.json({ error: 'Could not fetch template' }, { status: 500 })

  const templateBuffer = Buffer.from(await templateRes.arrayBuffer())

  const breakDates = calculateAllBreakDates(pourRow.date)
  const ageMap: Record<BreakAge, number | null> = {
    '1day': sampleRow.break1day, '3day': sampleRow.break3day, '4day': sampleRow.break4day,
    '5day': sampleRow.break5day, '7day': sampleRow.break7day, '14day': sampleRow.break14day,
    '21day': sampleRow.break21day, '28day': sampleRow.break28day, '56day': sampleRow.break56day,
    '90day': sampleRow.break90day, '120day': sampleRow.break120day,
  }

  // Build the full data value map
  const values: Record<string, string> = {
    date:                      fmt(pourRow.date),
    shift:                     pourRow.shift,
    spec:                      pourRow.spec,
    location:                  pourRow.location,
    description:               pourRow.description,
    supplier:                  pourRow.supplier,
    mixId:                     pourRow.mixId,
    definableFeature:          str(pourRow.definableFeature),
    batchTicketNumber:         sampleRow.batchTicketNumber,
    sampledBy:                 str(sampleRow.sampledBy),
    testedBy:                  str(sampleRow.testedBy),
    sampleType:                str(sampleRow.sampleType),
    sampleIdRange:             str(sampleRow.sampleIdRange),
    quantitySize:              str(sampleRow.quantitySize),
    temperature:               str(sampleRow.temperature),
    slump:                     str(sampleRow.slump),
    airContent:                str(sampleRow.airContent),
    unitWeight:                str(sampleRow.unitWeight),
    wcRatio:                   str(sampleRow.wcRatio),
    astmC1611Flow:             str(sampleRow.astmC1611Flow),
    vsi:                       str(sampleRow.vsi),
    ambientTemp:               str(sampleRow.ambientTemp),
    area:                      str(sampleRow.area),
    pfuLocation:               str(sampleRow.pfuLocation),
    wallPanelControlNo:        str(sampleRow.wallPanelControlNo),
    structure:                 str(sampleRow.structure),
    element:                   str(sampleRow.element),
    volumeCy:                  str(sampleRow.volumeCy),
    totalDailyVol:             str(sampleRow.totalDailyVol),
    marineConcreteCumulative:  str(sampleRow.marineConcreteCumulative),
    marineConcreteLoNumber:    str(sampleRow.marineConcreteLoNumber),
    requiredCompStrength:      str(sampleRow.requiredCompStrength),
    compliance:                sampleRow.compliance === 'YES' ? 'PASS' : sampleRow.compliance === 'NO' ? 'FAIL' : str(sampleRow.compliance),
  }
  for (const age of BREAK_AGES) {
    values[`break${age.replace('day', '')}day`] = ageMap[age] != null ? String(ageMap[age]) : ''
    values[`date${age.replace('day', '')}day`]  = breakDates[age] ? fmt(breakDates[age]) : ''
  }

  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(templateBuffer as any)

  // Try AI mapping first
  const [mappingSetting] = await db.select().from(appSettings).where(eq(appSettings.key, 'excel_template_mapping'))
  const mapping: FieldMapping = mappingSetting ? JSON.parse(mappingSetting.value) as FieldMapping : {}
  const hasMappedFields = Object.keys(mapping).length > 0

  if (hasMappedFields) {
    // Fill cells using the AI-generated mapping
    wb.eachSheet(sheet => {
      for (const [field, location] of Object.entries(mapping)) {
        if (!location || location.sheet !== sheet.name) continue
        const val = values[field]
        if (val === undefined) continue
        const cell = sheet.getCell(location.cell)
        // Preserve number type for numeric fields
        const numeric = ['temperature', 'airContent', 'unitWeight', 'wcRatio',
          'astmC1611Flow', 'vsi', 'ambientTemp', 'totalDailyVol',
          'marineConcreteCumulative', 'requiredCompStrength',
          ...BREAK_AGES.map(a => `break${a.replace('day', '')}day`),
        ]
        if (numeric.includes(field) && val !== '') {
          const num = parseFloat(val)
          cell.value = isNaN(num) ? val : num
        } else {
          cell.value = val
        }
      }
    })
  } else {
    // Fallback: placeholder replacement for templates that still use {{tags}}
    wb.eachSheet(sheet => {
      sheet.eachRow(row => {
        row.eachCell(cell => {
          if (typeof cell.value === 'string') {
            let v = cell.value
            for (const [field, val] of Object.entries(values)) {
              v = v.replaceAll(`{{${field}}}`, val)
            }
            if (v !== cell.value) cell.value = v
          }
          if (cell.value && typeof cell.value === 'object' && 'richText' in (cell.value as object)) {
            const rich = cell.value as { richText: Array<{ text: string; font?: object }> }
            rich.richText = rich.richText.map(part => {
              let text = part.text
              for (const [field, val] of Object.entries(values)) {
                text = text.replaceAll(`{{${field}}}`, val)
              }
              return { ...part, text }
            })
          }
        })
      })
    })
  }

  const buf = await wb.xlsx.writeBuffer()

  return new NextResponse(Buffer.from(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="compression-report-${sampleRow.batchTicketNumber}.xlsx"`,
    },
  })
}
