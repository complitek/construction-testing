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

export const maxDuration = 60

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y}`
}

export async function GET(_: Request, { params }: { params: Promise<{ sampleId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'download_report')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { sampleId } = await params

  // Fetch sample and pour
  const [sampleRow] = await db.select().from(sampleSets).where(eq(sampleSets.id, sampleId))
  if (!sampleRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [pourRow] = await db.select().from(pourEvents).where(eq(pourEvents.id, sampleRow.pourEventId))
  if (!pourRow) return NextResponse.json({ error: 'Pour not found' }, { status: 404 })

  // Fetch template URL from app_settings
  const [templateSetting] = await db.select().from(appSettings).where(eq(appSettings.key, 'excel_template_url'))
  if (!templateSetting) {
    return NextResponse.json({ error: 'No template uploaded. Upload a template in the Templates section first.' }, { status: 404 })
  }

  // Download template from Vercel Blob
  const templateRes = await fetch(templateSetting.value)
  if (!templateRes.ok) return NextResponse.json({ error: 'Could not fetch template' }, { status: 500 })
  const templateArrayBuffer = await templateRes.arrayBuffer()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const templateBuffer = Buffer.from(templateArrayBuffer) as any

  // Build break date map
  const breakDates = calculateAllBreakDates(pourRow.date)

  // Build replacement map
  const ageMap: Record<BreakAge, number | null> = {
    '1day': sampleRow.break1day, '3day': sampleRow.break3day, '4day': sampleRow.break4day,
    '5day': sampleRow.break5day, '7day': sampleRow.break7day, '14day': sampleRow.break14day,
    '21day': sampleRow.break21day, '28day': sampleRow.break28day, '56day': sampleRow.break56day,
    '90day': sampleRow.break90day, '120day': sampleRow.break120day,
  }

  const replacements: Record<string, string> = {
    '{{date}}': formatDate(pourRow.date),
    '{{shift}}': pourRow.shift,
    '{{spec}}': pourRow.spec,
    '{{location}}': pourRow.location,
    '{{description}}': pourRow.description,
    '{{supplier}}': pourRow.supplier,
    '{{mix_id}}': pourRow.mixId,
    '{{ticket_number}}': sampleRow.batchTicketNumber,
    '{{temperature}}': sampleRow.temperature != null ? String(sampleRow.temperature) : '',
    '{{slump}}': sampleRow.slump ?? '',
    '{{unit_weight}}': sampleRow.unitWeight != null ? String(sampleRow.unitWeight) : '',
    '{{air_content}}': sampleRow.airContent != null ? String(sampleRow.airContent) : '',
  }

  // Support both {{break_28day}} and {{break_28_day}} style keys
  for (const age of BREAK_AGES) {
    replacements[`{{break_${age}}}`] = ageMap[age] != null ? String(ageMap[age]) : ''
    replacements[`{{date_${age}}}`] = formatDate(breakDates[age])
  }

  // Load template with ExcelJS and replace placeholders
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(templateBuffer)

  wb.eachSheet(sheet => {
    sheet.eachRow(row => {
      row.eachCell(cell => {
        if (typeof cell.value === 'string') {
          let val = cell.value
          for (const [placeholder, replacement] of Object.entries(replacements)) {
            val = val.replaceAll(placeholder, replacement)
          }
          if (val !== cell.value) cell.value = val
        }
        // Also handle cells with rich text
        if (cell.value && typeof cell.value === 'object' && 'richText' in (cell.value as object)) {
          const rich = cell.value as { richText: Array<{ text: string; font?: object }> }
          rich.richText = rich.richText.map(part => {
            let text = part.text
            for (const [placeholder, replacement] of Object.entries(replacements)) {
              text = text.replaceAll(placeholder, replacement)
            }
            return { ...part, text }
          })
        }
      })
    })
  })

  const buf = await wb.xlsx.writeBuffer()

  return new NextResponse(Buffer.from(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="compression-report-${sampleRow.batchTicketNumber}.xlsx"`,
    },
  })
}
