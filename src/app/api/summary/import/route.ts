import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { summaryRecords } from '@/lib/db/schema'
import * as ExcelJS from 'exceljs'

export const maxDuration = 300

const C = {
  SHIFT_DATE: 2, LOC_DESC: 3, DFOW: 4, SPEC: 5,
  AREA: 6, STRUCTURE: 7, ELEMENT: 8,
  SUPPLIER: 9, MIX_ID: 10, BATCH_TKT: 11, SAMPLED_BY: 12,
  SLUMP: 13, FLOW: 14, AIR: 15, TEMP: 16, UNIT_WT: 17,
  BREAK_1: 18, BREAK_2: 19, BREAK_3: 20, BREAK_4: 21,
  BREAK_7: 22, BREAK_10: 23, BREAK_14: 24, BREAK_28: 25,
  BREAK_56: 26, BREAK_90: 27, BREAK_120: 28, BREAK_150: 29,
  REQ_STR: 30, C1202_1: 31, C1202_2: 32, C1202_3: 33, C1202_4: 34, C1202_5: 35,
  COMPLY_STR: 36, COMPLY_DUR: 37, COMPLY_OTH: 38,
  COMMENTS: 39, RPT_GEN: 40, DUR_RPT: 41,
}

function cellVal(row: ExcelJS.Row, col: number): ExcelJS.CellValue {
  const c = row.getCell(col)
  const v = c.value
  if (v != null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
    const o = v as unknown as Record<string, unknown>
    if ('result' in o) return o.result as ExcelJS.CellValue
    if ('text' in o) return o.text as ExcelJS.CellValue
  }
  return v
}
function toStr(v: ExcelJS.CellValue): string | null {
  if (v == null) return null
  if (typeof v === 'string') { const t = v.trim(); return t === '' || t.toUpperCase() === 'N/A' ? null : t }
  if (typeof v === 'number') return Number.isFinite(v) ? v.toString() : null
  if (v instanceof Date) { if (isNaN(v.getTime())) return null; return toDate(v) }
  return null
}
function toNum(v: ExcelJS.CellValue): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = toStr(v); if (!s) return null
  const n = parseFloat(s); return isNaN(n) ? null : n
}
function toInt(v: ExcelJS.CellValue): number | null {
  const n = toNum(v); return n == null ? null : Math.round(n)
}
function toDate(v: ExcelJS.CellValue): string | null {
  if (v == null) return null
  if (v instanceof Date) {
    if (isNaN(v.getTime()) || v.getFullYear() < 2000 || v.getFullYear() > 2100) return null
    const y = v.getUTCFullYear(), m = String(v.getUTCMonth() + 1).padStart(2, '0'), d = String(v.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return null
}
function toBool(v: ExcelJS.CellValue): boolean {
  if (v == null || v === '' || v === false || v === 0) return false
  return true
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = await getUserRole()
  if (!role || !hasPermission(role, 'manage_users')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const wb = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buffer as any)

  const ws = wb.getWorksheet('Summary')
    ?? wb.getWorksheet('summary')
    ?? wb.worksheets.find(s => s.name.toLowerCase() === 'summary')

  if (!ws) return NextResponse.json({ error: 'Sheet "Summary" not found in workbook' }, { status: 400 })

  // Clear existing records and re-import
  await db.delete(summaryRecords)

  let imported = 0, skipped = 0
  const toInsert: typeof summaryRecords.$inferInsert[] = []

  ws.eachRow((row, rowNum) => {
    if (rowNum < 16) return
    const shiftDate = toDate(cellVal(row, C.SHIFT_DATE))
    if (!shiftDate) { skipped++; return }

    toInsert.push({
      shiftDate,
      locationDescription: toStr(cellVal(row, C.LOC_DESC)),
      dfow: toStr(cellVal(row, C.DFOW)),
      spec: toStr(cellVal(row, C.SPEC)),
      area: toStr(cellVal(row, C.AREA)),
      structure: toStr(cellVal(row, C.STRUCTURE)),
      element: toStr(cellVal(row, C.ELEMENT)),
      supplier: toStr(cellVal(row, C.SUPPLIER)),
      mixId: toStr(cellVal(row, C.MIX_ID)),
      batchTicketNumber: toStr(cellVal(row, C.BATCH_TKT)),
      sampledBy: toStr(cellVal(row, C.SAMPLED_BY)),
      slump: toStr(cellVal(row, C.SLUMP)),
      flow: toNum(cellVal(row, C.FLOW)),
      airContent: toNum(cellVal(row, C.AIR)),
      temperature: toInt(cellVal(row, C.TEMP)),
      unitWeight: toNum(cellVal(row, C.UNIT_WT)),
      break1day:   toInt(cellVal(row, C.BREAK_1)),
      break2day:   toInt(cellVal(row, C.BREAK_2)),
      break3day:   toInt(cellVal(row, C.BREAK_3)),
      break4day:   toInt(cellVal(row, C.BREAK_4)),
      break7day:   toInt(cellVal(row, C.BREAK_7)),
      break10day:  toInt(cellVal(row, C.BREAK_10)),
      break14day:  toInt(cellVal(row, C.BREAK_14)),
      break28day:  toInt(cellVal(row, C.BREAK_28)),
      break56day:  toInt(cellVal(row, C.BREAK_56)),
      break90day:  toInt(cellVal(row, C.BREAK_90)),
      break120day: toInt(cellVal(row, C.BREAK_120)),
      break150day: toInt(cellVal(row, C.BREAK_150)),
      requiredStrength: toInt(cellVal(row, C.REQ_STR)),
      c1202_1: toStr(cellVal(row, C.C1202_1)),
      c1202_2: toStr(cellVal(row, C.C1202_2)),
      c1202_3: toStr(cellVal(row, C.C1202_3)),
      c1202_4: toStr(cellVal(row, C.C1202_4)),
      c1202_5: toStr(cellVal(row, C.C1202_5)),
      complianceStrength: toStr(cellVal(row, C.COMPLY_STR)),
      complianceDurability: toStr(cellVal(row, C.COMPLY_DUR)),
      complianceOther: toStr(cellVal(row, C.COMPLY_OTH)),
      comments: toStr(cellVal(row, C.COMMENTS)),
      reportGenerated: toBool(cellVal(row, C.RPT_GEN)),
      durabilityReport: toBool(cellVal(row, C.DUR_RPT)),
    })
    imported++
  })

  // Insert in batches of 100 to avoid query size limits
  for (let i = 0; i < toInsert.length; i += 100) {
    await db.insert(summaryRecords).values(toInsert.slice(i, i + 100))
  }

  return NextResponse.json({ imported, skipped })
}
