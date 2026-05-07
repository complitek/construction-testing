/**
 * One-time import: reads the Compressive Strength sheet from the P209 master log
 * and loads historical data into this app's pour_events + sample_sets tables.
 *
 * Usage:
 *   npm run import:log
 *
 * The script groups rows by batch ticket number → one pourEvent + one sampleSet each.
 * Break results (1d, 3d, 4d, 7d, 28d, 56d, 90d, 120d) are collapsed from individual
 * cylinder rows into a single sampleSet row.
 */

import * as ExcelJS from 'exceljs'
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import { eq } from 'drizzle-orm'
import * as schema from '../lib/db/schema'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') })

const EXCEL_PATH = path.resolve(
  process.env.USERPROFILE ?? process.env.HOME ?? '',
  'OneDrive', 'Desktop', 'P209 Concrete Reports',
  'P209 Concrete and Masonry Sample Log.xlsx'
)

// ExcelJS 1-based column indices (Python 0-based + 1)
const C = {
  SAMPLE_ID:   2,  SHIFT_DATE:  3,  DFOW:        4,  SPEC:        5,
  AREA:        6,  LOCATION:   11,  WALL_PANEL: 12,  PFU_LOC:    13,
  STRUCTURE:  14,  ELEMENT:    15,  SAMPLED_BY: 16,  SAMPLE_TYPE:17,
  SUPPLIER:   18,  MIX_ID:     19,  BATCH_TKT:  20,  QTY_SIZE:   21,
  TEST_DATE:  22,  AGE_DAYS:   23,  TESTED_BY:  24,
  SLUMP:      25,  FLOW:       26,  AIR:        27,  TEMP:       28,
  UNIT_WT:    29,  WC:         30,  VSI:        31,  AMB_TEMP:   32,
  LOAD_LBS:   33,  SURF_AREA:  34,  STRENGTH:   35,
  AVERAGE:    36,  BREAK_TYPE: 37,  REQ_STR:    38,
  VOL_CY:     39,  DAILY_VOL:  40,  MARINE_CUM: 41,  MARINE_LOT: 42,
  COMPLY_YES: 43,  COMPLY_NO:  44,  COMPLY_NA:  45,
  SUBMITTED:  46,  COMMENTS:   47,
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
  if (cellVal(row, C.COMPLY_NO)  != null && cellVal(row, C.COMPLY_NO)  !== '') return 'NO'
  if (cellVal(row, C.COMPLY_NA)  != null && cellVal(row, C.COMPLY_NA)  !== '') return 'NA'
  return null
}

// Map age days → sampleSets column name
const AGE_COL: Record<number, keyof typeof schema.sampleSets.$inferInsert> = {
  1: 'break1day', 3: 'break3day', 4: 'break4day', 5: 'break5day',
  7: 'break7day', 14: 'break14day', 21: 'break21day', 28: 'break28day',
  56: 'break56day', 90: 'break90day', 120: 'break120day',
}

async function main() {
  const sqlClient = neon(process.env.DATABASE_URL!)
  const db = drizzle(sqlClient, { schema })

  // Find or create a user record for the import
  let [anyUser] = await db.select().from(schema.users).limit(1)
  if (!anyUser) {
    console.log('No users in DB — creating import user...')
    const importId = crypto.randomUUID()
    ;[anyUser] = await db.insert(schema.users).values({
      id: importId,
      clerkId: 'import-script',
      role: 'qc_manager',
      name: 'Pebbles Valdez',
      email: 'pvaldez@3g2bllc.com',
    }).returning()
    console.log('Created import user:', anyUser.name)
  }
  const createdBy = anyUser.id
  console.log(`Using user: ${anyUser.name} (${anyUser.email})`)

  // Check if already imported
  const existing = await db.select().from(schema.pourEvents).limit(1)
  if (existing.length > 0) {
    console.log(`Database already has data (${existing.length}+ pour events). Delete existing records first to re-import.`)
    process.exit(0)
  }

  console.log('Reading Excel:', EXCEL_PATH)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(EXCEL_PATH)

  const ws = wb.getWorksheet('Compressive Strength')
  if (!ws) { console.error('Sheet "Compressive Strength" not found'); process.exit(1) }

  // Group rows by batch ticket → pour (each batch ticket = one pourEvent + one sampleSet)
  interface PourGroup {
    firstRow: ExcelJS.Row
    breaksByAge: Record<number, number[]>  // age → list of psi values
    complianceVal: string | null
    dateSubmitted: string | null
    comments: string | null
    testedBy: string | null
    sampleIds: string[]
  }

  const groups = new Map<string, PourGroup>()

  ws.eachRow((row, rowNum) => {
    if (rowNum < 16) return   // skip header rows
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

    // Take compliance from the last non-null value in the group
    const c = compliance(row)
    if (c) g.complianceVal = c

    const submitted = toDate(cellVal(row, C.SUBMITTED))
    if (submitted) g.dateSubmitted = submitted

    const comments = toStr(cellVal(row, C.COMMENTS))
    if (comments) g.comments = comments

    const testedBy = toStr(cellVal(row, C.TESTED_BY))
    if (testedBy) g.testedBy = testedBy
  })

  console.log(`Found ${groups.size} unique pours. Importing...`)

  let pourCount = 0, sampleCount = 0, skipped = 0

  for (const [, g] of groups) {
    const row = g.firstRow
    const shiftDate = toDate(cellVal(row, C.SHIFT_DATE))
    if (!shiftDate) { skipped++; continue }

    // Insert pour event
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

    // Build break columns (average the psi values for each age)
    const breakCols: Partial<typeof schema.sampleSets.$inferInsert> = {}
    for (const [ageDays, psiValues] of Object.entries(g.breaksByAge)) {
      const col = AGE_COL[Number(ageDays)]
      if (col && psiValues.length > 0) {
        breakCols[col] = Math.round(psiValues.reduce((a, b) => a + b, 0) / psiValues.length) as never
      }
    }

    // Insert sample set
    await db.insert(schema.sampleSets).values({
      pourEventId: pour.id,
      batchTicketNumber: toStr(cellVal(row, C.BATCH_TKT)) ?? 'N/A',
      matchStatus: 'manually_confirmed',
      reportStatus: 'pending_breaks',
      // Location
      area: toStr(cellVal(row, C.AREA)),
      pfuLocation: toStr(cellVal(row, C.PFU_LOC)),
      wallPanelControlNo: toStr(cellVal(row, C.WALL_PANEL)),
      structure: toStr(cellVal(row, C.STRUCTURE)),
      element: toStr(cellVal(row, C.ELEMENT)),
      // Personnel
      sampledBy: toStr(cellVal(row, C.SAMPLED_BY)),
      sampleType: toStr(cellVal(row, C.SAMPLE_TYPE)),
      quantitySize: toStr(cellVal(row, C.QTY_SIZE)),
      testedBy: g.testedBy,
      sampleIdRange: g.sampleIds.length > 0 ? `${g.sampleIds[0]}–${g.sampleIds[g.sampleIds.length - 1]}` : null,
      // Field tests
      slump: toStr(cellVal(row, C.SLUMP)),
      astmC1611Flow: toNum(cellVal(row, C.FLOW)),
      airContent: toNum(cellVal(row, C.AIR)),
      temperature: toInt(cellVal(row, C.TEMP)),
      unitWeight: toNum(cellVal(row, C.UNIT_WT)),
      wcRatio: toNum(cellVal(row, C.WC)),
      vsi: toInt(cellVal(row, C.VSI)),
      ambientTemp: toNum(cellVal(row, C.AMB_TEMP)),
      // Volume / lot
      volumeCy: toStr(cellVal(row, C.VOL_CY)),
      totalDailyVol: toNum(cellVal(row, C.DAILY_VOL)),
      marineConcreteCumulative: toNum(cellVal(row, C.MARINE_CUM)),
      marineConcreteLoNumber: toStr(cellVal(row, C.MARINE_LOT)),
      // Acceptance
      requiredCompStrength: toInt(cellVal(row, C.REQ_STR)),
      compliance: g.complianceVal,
      dateSubmittedToGovt: g.dateSubmitted,
      comments: g.comments,
      // Breaks (averaged per age)
      ...breakCols,
      createdBy,
    })

    sampleCount++

    if (pourCount % 50 === 0) process.stdout.write(`\r  ${pourCount} pours imported...`)
  }

  console.log(`\nDone. ${pourCount} pours and ${sampleCount} sample sets imported. ${skipped} skipped.`)
}

main().catch(err => { console.error(err); process.exit(1) })
