import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { pourEvents, users } from '@/lib/db/schema'
import * as schema from '@/lib/db/schema'
import * as ExcelJS from 'exceljs'

export const maxDuration = 300

// Column indices match the import script exactly
const C = {
  SAMPLE_ID: 2, SHIFT_DATE: 3, DFOW: 4, SPEC: 5,
  AREA: 6, LOCATION: 11, WALL_PANEL: 12, PFU_LOC: 13,
  STRUCTURE: 14, ELEMENT: 15, SAMPLED_BY: 16, SAMPLE_TYPE: 17,
  SUPPLIER: 18, MIX_ID: 19, BATCH_TKT: 20, QTY_SIZE: 21,
  TEST_DATE: 22, AGE_DAYS: 23, TESTED_BY: 24,
  SLUMP: 25, FLOW: 26, AIR: 27, TEMP: 28,
  UNIT_WT: 29, WC: 30, VSI: 31, AMB_TEMP: 32,
  LOAD_LBS: 33, SURF_AREA: 34, STRENGTH: 35,
  AVERAGE: 36, BREAK_TYPE: 37, REQ_STR: 38,
  VOL_CY: 39, DAILY_VOL: 40, MARINE_CUM: 41, MARINE_LOT: 42,
  COMPLY_YES: 43, COMPLY_NO: 44, COMPLY_NA: 45,
  SUBMITTED: 46, COMMENTS: 47,
}

const AGE_COL: Record<number, keyof typeof schema.sampleSets.$inferInsert> = {
  1: 'break1day', 3: 'break3day', 4: 'break4day', 5: 'break5day',
  7: 'break7day', 14: 'break14day', 21: 'break21day', 28: 'break28day',
  56: 'break56day', 90: 'break90day', 120: 'break120day',
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
function compliance(row: ExcelJS.Row): string | null {
  if (cellVal(row, C.COMPLY_YES) != null && cellVal(row, C.COMPLY_YES) !== '') return 'YES'
  if (cellVal(row, C.COMPLY_NO) != null && cellVal(row, C.COMPLY_NO) !== '') return 'NO'
  if (cellVal(row, C.COMPLY_NA) != null && cellVal(row, C.COMPLY_NA) !== '') return 'NA'
  return null
}

async function requireAdmin() {
  const { userId } = await auth()
  if (!userId) return false
  const role = await getUserRole()
  return role && hasPermission(role, 'manage_users')
}

// DELETE: erase all pour events (cascades sample sets, tickets, uploads)
export async function DELETE() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await db.delete(pourEvents)
  return NextResponse.json({ success: true })
}

// POST: clear all records + import from uploaded Excel
export async function POST(request: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())

  const wb = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buffer as any)

  const ws = wb.getWorksheet('Compressive Strength')
  if (!ws) return NextResponse.json({ error: 'Sheet "Compressive Strength" not found in workbook' }, { status: 400 })

  // Get or create a user record for the import
  const [anyUser] = await db.select().from(users).limit(1)
  if (!anyUser) return NextResponse.json({ error: 'No users in database — log in first' }, { status: 500 })
  const createdBy = anyUser.id

  // Clear all existing records (sampleSets, ticketRecords, ticketUploads cascade from pourEvents)
  await db.delete(pourEvents)

  interface PourGroup {
    firstRow: ExcelJS.Row
    breaksByAge: Record<number, number[]>
    complianceVal: string | null
    dateSubmitted: string | null
    comments: string | null
    testedBy: string | null
    sampleIds: string[]
  }

  const groups = new Map<string, PourGroup>()

  ws.eachRow((row, rowNum) => {
    if (rowNum < 16) return
    const sampleId = toStr(cellVal(row, C.SAMPLE_ID))
    if (!sampleId) return

    const batchTkt = toStr(cellVal(row, C.BATCH_TKT))
    const shiftDate = toDate(cellVal(row, C.SHIFT_DATE))
    const location = toStr(cellVal(row, C.LOCATION)) ?? ''
    const key = batchTkt ?? `${shiftDate}:${location}`

    if (!groups.has(key)) {
      groups.set(key, { firstRow: row, breaksByAge: {}, complianceVal: null, dateSubmitted: null, comments: null, testedBy: null, sampleIds: [] })
    }
    const g = groups.get(key)!
    g.sampleIds.push(sampleId)

    const ageDays = toInt(cellVal(row, C.AGE_DAYS))
    const psi = toInt(cellVal(row, C.STRENGTH))
    if (ageDays != null && psi != null) {
      if (!g.breaksByAge[ageDays]) g.breaksByAge[ageDays] = []
      g.breaksByAge[ageDays].push(psi)
    }

    const c = compliance(row)
    if (c) g.complianceVal = c

    const submitted = toDate(cellVal(row, C.SUBMITTED))
    if (submitted) g.dateSubmitted = submitted

    const comments = toStr(cellVal(row, C.COMMENTS))
    if (comments) g.comments = comments

    const testedBy = toStr(cellVal(row, C.TESTED_BY))
    if (testedBy) g.testedBy = testedBy
  })

  let pourCount = 0, sampleCount = 0, skipped = 0

  for (const [, g] of groups) {
    const row = g.firstRow
    const shiftDate = toDate(cellVal(row, C.SHIFT_DATE))
    if (!shiftDate) { skipped++; continue }

    const [pour] = await db.insert(schema.pourEvents).values({
      date: shiftDate,
      shift: 'day',
      spec: toStr(cellVal(row, C.SPEC)) ?? '03 31 29',
      location: toStr(cellVal(row, C.LOCATION)) ?? '',
      description: toStr(cellVal(row, C.PFU_LOC)) ?? '',
      supplier: toStr(cellVal(row, C.SUPPLIER)) ?? '',
      mixId: toStr(cellVal(row, C.MIX_ID)) ?? '',
      definableFeature: toStr(cellVal(row, C.DFOW)),
      createdBy,
    }).returning()

    pourCount++

    const breakCols: Partial<typeof schema.sampleSets.$inferInsert> = {}
    for (const [ageDays, psiValues] of Object.entries(g.breaksByAge)) {
      const col = AGE_COL[Number(ageDays)]
      if (col && psiValues.length > 0) {
        breakCols[col] = Math.round(psiValues.reduce((a, b) => a + b, 0) / psiValues.length) as never
      }
    }

    await db.insert(schema.sampleSets).values({
      pourEventId: pour.id,
      batchTicketNumber: toStr(cellVal(row, C.BATCH_TKT)) ?? 'N/A',
      matchStatus: 'manually_confirmed',
      reportStatus: 'pending_breaks',
      area: toStr(cellVal(row, C.AREA)),
      pfuLocation: toStr(cellVal(row, C.PFU_LOC)),
      wallPanelControlNo: toStr(cellVal(row, C.WALL_PANEL)),
      structure: toStr(cellVal(row, C.STRUCTURE)),
      element: toStr(cellVal(row, C.ELEMENT)),
      sampledBy: toStr(cellVal(row, C.SAMPLED_BY)),
      sampleType: toStr(cellVal(row, C.SAMPLE_TYPE)),
      quantitySize: toStr(cellVal(row, C.QTY_SIZE)),
      testedBy: g.testedBy,
      sampleIdRange: g.sampleIds.length > 0 ? `${g.sampleIds[0]}–${g.sampleIds[g.sampleIds.length - 1]}` : null,
      slump: toStr(cellVal(row, C.SLUMP)),
      astmC1611Flow: toNum(cellVal(row, C.FLOW)),
      airContent: toNum(cellVal(row, C.AIR)),
      temperature: toInt(cellVal(row, C.TEMP)),
      unitWeight: toNum(cellVal(row, C.UNIT_WT)),
      wcRatio: toNum(cellVal(row, C.WC)),
      vsi: toInt(cellVal(row, C.VSI)),
      ambientTemp: toNum(cellVal(row, C.AMB_TEMP)),
      volumeCy: toStr(cellVal(row, C.VOL_CY)),
      totalDailyVol: toNum(cellVal(row, C.DAILY_VOL)),
      marineConcreteCumulative: toNum(cellVal(row, C.MARINE_CUM)),
      marineConcreteLoNumber: toStr(cellVal(row, C.MARINE_LOT)),
      requiredCompStrength: toInt(cellVal(row, C.REQ_STR)),
      compliance: g.complianceVal,
      dateSubmittedToGovt: g.dateSubmitted,
      comments: g.comments,
      ...breakCols,
      createdBy,
    })

    sampleCount++
  }

  return NextResponse.json({ imported: pourCount, samples: sampleCount, skipped })
}
