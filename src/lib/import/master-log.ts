import { db } from '@/lib/db'
import { pourEvents, summaryRecords, sampleSets } from '@/lib/db/schema'
import * as schema from '@/lib/db/schema'
import * as ExcelJS from 'exceljs'
import { ne } from 'drizzle-orm'

// ── Cell helpers ──────────────────────────────────────────────────────────────

export function cellVal(row: ExcelJS.Row, col: number): ExcelJS.CellValue {
  const c = row.getCell(col)
  const v = c.value
  if (v != null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
    const o = v as unknown as Record<string, unknown>
    if ('result' in o) return o.result as ExcelJS.CellValue
    if ('text' in o) return o.text as ExcelJS.CellValue
  }
  return v
}
export function toStr(v: ExcelJS.CellValue): string | null {
  if (v == null) return null
  if (typeof v === 'string') { const t = v.trim(); return t === '' || t.toUpperCase() === 'N/A' ? null : t }
  if (typeof v === 'number') return Number.isFinite(v) ? v.toString() : null
  if (v instanceof Date) { if (isNaN(v.getTime())) return null; return toDate(v) }
  return null
}
export function toNum(v: ExcelJS.CellValue): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = toStr(v); if (!s) return null
  const n = parseFloat(s); return isNaN(n) ? null : n
}
// Excel percentage cells (numFmt "0.0%") return the underlying decimal — multiply by 100.
export function toAirContent(row: ExcelJS.Row, col: number): number | null {
  const cell = row.getCell(col)
  const v = cellVal(row, col)
  const n = toNum(v)
  if (n == null) return null
  const numFmt = cell.numFmt ?? ''
  if (numFmt.includes('%') && Math.abs(n) < 1) {
    return parseFloat((n * 100).toFixed(2))
  }
  return n
}
export function toInt(v: ExcelJS.CellValue): number | null {
  const n = toNum(v); return n == null ? null : Math.round(n)
}
export function toDate(v: ExcelJS.CellValue): string | null {
  if (v == null) return null
  if (v instanceof Date) {
    if (isNaN(v.getTime()) || v.getFullYear() < 2000 || v.getFullYear() > 2100) return null
    const y = v.getUTCFullYear(), m = String(v.getUTCMonth() + 1).padStart(2, '0'), d = String(v.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return null
}
export function toBool(v: ExcelJS.CellValue): boolean {
  return v != null && v !== '' && v !== false && v !== 0
}

// ── Compressive Strength sheet ────────────────────────────────────────────────

// P209 master log Compressive Strength: header row 14, data starts row 16. 1-indexed.
export const CS = {
  SAMPLE_ID: 2,    // B
  SHIFT_DATE: 3,   // C
  LOCATION: 4,     // D — "Location and Description of Material Tested"
  DFOW: 5,         // E
  SPEC: 6,         // F
  AREA: 7,         // G
  STRUCTURE: 8,    // H
  ELEMENT: 9,      // I
  SUPPLIER: 10,    // J
  MIX_ID: 11,      // K
  BATCH_TKT: 12,   // L
  QTY_SIZE: 13,    // M
  SAMPLED_BY: 14,  // N
  SLUMP: 15,       // O
  FLOW: 16,        // P
  AIR: 17,         // Q
  TEMP: 18,        // R
  UNIT_WT: 19,     // S
  WC: 20,          // T
  VSI: 21,         // U
  AMB_TEMP: 22,    // V
  SAMPLE_TYPE: 23, // W
  AGE_DAYS: 25,    // Y
  TESTED_BY: 26,   // Z
  STRENGTH: 29,    // AC
  REQ_STR: 32,     // AF
  VOL_CY: 33,      // AG
  DAILY_VOL: 34,   // AH
  MARINE_CUM: 35,  // AI
  MARINE_LOT: 36,  // AJ
  COMPLY_YES: 37,  // AK
  COMPLY_NO: 38,   // AL
  COMPLY_NA: 39,   // AM
  SUBMITTED: 40,   // AN
  COMMENTS: 41,    // AO
}

const AGE_COL: Record<number, keyof typeof schema.sampleSets.$inferInsert> = {
  1: 'break1day', 3: 'break3day', 4: 'break4day', 5: 'break5day',
  7: 'break7day', 14: 'break14day', 21: 'break21day', 28: 'break28day',
  56: 'break56day', 90: 'break90day', 120: 'break120day',
}

function csCompliance(row: ExcelJS.Row): string | null {
  if (cellVal(row, CS.COMPLY_YES) != null && cellVal(row, CS.COMPLY_YES) !== '') return 'YES'
  if (cellVal(row, CS.COMPLY_NO) != null && cellVal(row, CS.COMPLY_NO) !== '') return 'NO'
  if (cellVal(row, CS.COMPLY_NA) != null && cellVal(row, CS.COMPLY_NA) !== '') return 'NA'
  return null
}

export async function importCSSheet(ws: ExcelJS.Worksheet, createdBy: string) {
  const existingRows = await db.select({ batchTicketNumber: sampleSets.batchTicketNumber })
    .from(sampleSets)
    .where(ne(sampleSets.batchTicketNumber, 'N/A'))
  const existingTickets = new Set(existingRows.map(r => r.batchTicketNumber))

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
    const sampleId = toStr(cellVal(row, CS.SAMPLE_ID))
    if (!sampleId) return

    const batchTkt = toStr(cellVal(row, CS.BATCH_TKT))
    const shiftDate = toDate(cellVal(row, CS.SHIFT_DATE))
    const location = toStr(cellVal(row, CS.LOCATION)) ?? ''
    const key = batchTkt ?? `${shiftDate}:${location}`

    if (!groups.has(key)) {
      groups.set(key, { firstRow: row, breaksByAge: {}, complianceVal: null, dateSubmitted: null, comments: null, testedBy: null, sampleIds: [] })
    }
    const g = groups.get(key)!
    g.sampleIds.push(sampleId)

    const ageDays = toInt(cellVal(row, CS.AGE_DAYS))
    const psi = toInt(cellVal(row, CS.STRENGTH))
    if (ageDays != null && psi != null) {
      if (!g.breaksByAge[ageDays]) g.breaksByAge[ageDays] = []
      g.breaksByAge[ageDays].push(psi)
    }

    const c = csCompliance(row)
    if (c) g.complianceVal = c

    const submitted = toDate(cellVal(row, CS.SUBMITTED))
    if (submitted) g.dateSubmitted = submitted

    const comments = toStr(cellVal(row, CS.COMMENTS))
    if (comments) g.comments = comments

    const testedBy = toStr(cellVal(row, CS.TESTED_BY))
    if (testedBy) g.testedBy = testedBy
  })

  let skipped = 0, existing = 0
  const pourRows: typeof schema.pourEvents.$inferInsert[] = []
  const sampleRows: typeof schema.sampleSets.$inferInsert[] = []

  for (const [, g] of groups) {
    const row = g.firstRow
    const shiftDate = toDate(cellVal(row, CS.SHIFT_DATE))
    if (!shiftDate) { skipped++; continue }

    const batchTkt = toStr(cellVal(row, CS.BATCH_TKT))
    if (batchTkt && batchTkt !== 'N/A' && existingTickets.has(batchTkt)) {
      existing++; continue
    }

    const pourId = crypto.randomUUID()
    const locationDesc = toStr(cellVal(row, CS.LOCATION)) ?? ''
    pourRows.push({
      id: pourId,
      date: shiftDate, shift: 'day',
      spec: toStr(cellVal(row, CS.SPEC)) ?? '03 31 29',
      location: locationDesc,
      description: locationDesc,
      supplier: toStr(cellVal(row, CS.SUPPLIER)) ?? '',
      mixId: toStr(cellVal(row, CS.MIX_ID)) ?? '',
      definableFeature: toStr(cellVal(row, CS.DFOW)),
      createdBy,
    })

    const breakCols: Partial<typeof schema.sampleSets.$inferInsert> = {}
    for (const [ageDays, psiValues] of Object.entries(g.breaksByAge)) {
      const col = AGE_COL[Number(ageDays)]
      if (col && psiValues.length > 0) {
        breakCols[col] = Math.round(psiValues.reduce((a, b) => a + b, 0) / psiValues.length) as never
      }
    }

    sampleRows.push({
      pourEventId: pourId,
      batchTicketNumber: toStr(cellVal(row, CS.BATCH_TKT)) ?? 'N/A',
      matchStatus: 'manually_confirmed',
      reportStatus: 'pending_breaks',
      area: toStr(cellVal(row, CS.AREA)),
      pfuLocation: null,
      wallPanelControlNo: null,
      structure: toStr(cellVal(row, CS.STRUCTURE)),
      element: toStr(cellVal(row, CS.ELEMENT)),
      sampledBy: toStr(cellVal(row, CS.SAMPLED_BY)),
      sampleType: toStr(cellVal(row, CS.SAMPLE_TYPE)),
      quantitySize: toStr(cellVal(row, CS.QTY_SIZE)),
      testedBy: g.testedBy,
      sampleIdRange: g.sampleIds.length > 0 ? `${g.sampleIds[0]}–${g.sampleIds[g.sampleIds.length - 1]}` : null,
      slump: toStr(cellVal(row, CS.SLUMP)),
      astmC1611Flow: toNum(cellVal(row, CS.FLOW)),
      airContent: toAirContent(row, CS.AIR),
      temperature: toInt(cellVal(row, CS.TEMP)),
      unitWeight: toNum(cellVal(row, CS.UNIT_WT)),
      wcRatio: toNum(cellVal(row, CS.WC)),
      vsi: toInt(cellVal(row, CS.VSI)),
      ambientTemp: toNum(cellVal(row, CS.AMB_TEMP)),
      volumeCy: toStr(cellVal(row, CS.VOL_CY)),
      totalDailyVol: toNum(cellVal(row, CS.DAILY_VOL)),
      marineConcreteCumulative: toNum(cellVal(row, CS.MARINE_CUM)),
      marineConcreteLoNumber: toStr(cellVal(row, CS.MARINE_LOT)),
      requiredCompStrength: toInt(cellVal(row, CS.REQ_STR)),
      compliance: g.complianceVal,
      dateSubmittedToGovt: g.dateSubmitted,
      comments: g.comments,
      ...breakCols,
      createdBy,
    })
  }

  // Insert pour events first (sample sets reference them via FK), in chunks.
  const CHUNK = 200
  for (let i = 0; i < pourRows.length; i += CHUNK) {
    await withRetry(() => db.insert(schema.pourEvents).values(pourRows.slice(i, i + CHUNK)))
  }
  for (let i = 0; i < sampleRows.length; i += CHUNK) {
    await withRetry(() => db.insert(schema.sampleSets).values(sampleRows.slice(i, i + CHUNK)))
  }

  return { imported: pourRows.length, samples: sampleRows.length, skipped, existing }
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try { return await fn() }
    catch (e) {
      lastErr = e
      const wait = 500 * Math.pow(2, i)
      console.warn(`  insert failed (attempt ${i + 1}/${attempts}), retrying in ${wait}ms:`, (e as Error).message?.slice(0, 120))
      await new Promise(r => setTimeout(r, wait))
    }
  }
  throw lastErr
}

// ── Summary sheet ─────────────────────────────────────────────────────────────

export const SM = {
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

export async function importSummarySheet(ws: ExcelJS.Worksheet) {
  const existingRows = await db.select({ batchTicketNumber: summaryRecords.batchTicketNumber })
    .from(summaryRecords)
  const existingTickets = new Set(
    existingRows.map(r => r.batchTicketNumber).filter(Boolean) as string[]
  )

  let imported = 0, skipped = 0, existing = 0
  const toInsert: typeof summaryRecords.$inferInsert[] = []

  ws.eachRow((row, rowNum) => {
    if (rowNum < 16) return
    const shiftDate = toDate(cellVal(row, SM.SHIFT_DATE))
    if (!shiftDate) { skipped++; return }

    const mixId = toStr(cellVal(row, SM.MIX_ID))
    if (mixId?.toUpperCase() !== 'HD5KMDD1') { skipped++; return }

    const batchTkt = toStr(cellVal(row, SM.BATCH_TKT))
    if (batchTkt && existingTickets.has(batchTkt)) { existing++; return }

    toInsert.push({
      shiftDate,
      locationDescription: toStr(cellVal(row, SM.LOC_DESC)),
      dfow: toStr(cellVal(row, SM.DFOW)),
      spec: toStr(cellVal(row, SM.SPEC)),
      area: toStr(cellVal(row, SM.AREA)),
      structure: toStr(cellVal(row, SM.STRUCTURE)),
      element: toStr(cellVal(row, SM.ELEMENT)),
      supplier: toStr(cellVal(row, SM.SUPPLIER)),
      mixId: toStr(cellVal(row, SM.MIX_ID)),
      batchTicketNumber: toStr(cellVal(row, SM.BATCH_TKT)),
      sampledBy: toStr(cellVal(row, SM.SAMPLED_BY)),
      slump: toStr(cellVal(row, SM.SLUMP)),
      flow: toNum(cellVal(row, SM.FLOW)),
      airContent: toAirContent(row, SM.AIR),
      temperature: toInt(cellVal(row, SM.TEMP)),
      unitWeight: toNum(cellVal(row, SM.UNIT_WT)),
      break1day:   toInt(cellVal(row, SM.BREAK_1)),
      break2day:   toInt(cellVal(row, SM.BREAK_2)),
      break3day:   toInt(cellVal(row, SM.BREAK_3)),
      break4day:   toInt(cellVal(row, SM.BREAK_4)),
      break7day:   toInt(cellVal(row, SM.BREAK_7)),
      break10day:  toInt(cellVal(row, SM.BREAK_10)),
      break14day:  toInt(cellVal(row, SM.BREAK_14)),
      break28day:  toInt(cellVal(row, SM.BREAK_28)),
      break56day:  toInt(cellVal(row, SM.BREAK_56)),
      break90day:  toInt(cellVal(row, SM.BREAK_90)),
      break120day: toInt(cellVal(row, SM.BREAK_120)),
      break150day: toInt(cellVal(row, SM.BREAK_150)),
      requiredStrength: toInt(cellVal(row, SM.REQ_STR)),
      c1202_1: toStr(cellVal(row, SM.C1202_1)),
      c1202_2: toStr(cellVal(row, SM.C1202_2)),
      c1202_3: toStr(cellVal(row, SM.C1202_3)),
      c1202_4: toStr(cellVal(row, SM.C1202_4)),
      c1202_5: toStr(cellVal(row, SM.C1202_5)),
      complianceStrength: toStr(cellVal(row, SM.COMPLY_STR)),
      complianceDurability: toStr(cellVal(row, SM.COMPLY_DUR)),
      complianceOther: toStr(cellVal(row, SM.COMPLY_OTH)),
      comments: toStr(cellVal(row, SM.COMMENTS)),
      reportGenerated: toBool(cellVal(row, SM.RPT_GEN)),
      durabilityReport: toBool(cellVal(row, SM.DUR_RPT)),
    })
    imported++
  })

  for (let i = 0; i < toInsert.length; i += 100) {
    await withRetry(() => db.insert(summaryRecords).values(toInsert.slice(i, i + 100)))
  }

  return { imported, skipped, existing }
}

export async function importMasterLog(buf: Buffer, createdBy: string) {
  const wb = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buf as any)
  const csSheet = wb.getWorksheet('Compressive Strength')
  if (!csSheet) throw new Error('Sheet "Compressive Strength" not found')
  const summarySheet = wb.getWorksheet('Summary')
    ?? wb.worksheets.find(s => s.name.toLowerCase() === 'summary')
  if (!summarySheet) throw new Error('Sheet "Summary" not found')
  const [csResult, summaryResult] = await Promise.all([
    importCSSheet(csSheet, createdBy),
    importSummarySheet(summarySheet),
  ])
  return { cs: csResult, summary: summaryResult }
}

void pourEvents // ensure import is referenced
