import { db } from '@/lib/db'
import { appSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import * as ExcelJS from 'exceljs'
import { readFile } from 'node:fs/promises'

function colLetter(n: number): string {
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v == null) return ''
  if (typeof v === 'string') return v.replace(/\s+/g, ' ').trim()
  if (typeof v === 'number') return String(v)
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.text === 'string') return o.text.replace(/\s+/g, ' ').trim()
    if ('richText' in o && Array.isArray(o.richText)) {
      return (o.richText as Array<{ text: string }>).map(r => r.text).join('').replace(/\s+/g, ' ').trim()
    }
    if ('result' in o) return String(o.result ?? '')
  }
  return String(v)
}

async function main() {
  const localPath = process.argv[2]
  let buf: Buffer
  if (localPath) {
    console.log('Reading local file:', localPath)
    buf = await readFile(localPath)
  } else {
    const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, 'master_log_url'))
    if (!setting) {
      console.error('No master_log_url in appSettings — pass a local path or upload via /admin first.')
      process.exit(1)
    }
    let url: string
    try {
      url = JSON.parse(setting.value).url
    } catch {
      url = setting.value
    }
    console.log('Fetching:', url)

    const token = process.env.BLOB_READ_WRITE_TOKEN
    if (!token) { console.error('BLOB_READ_WRITE_TOKEN missing'); process.exit(1) }
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      console.error(`Fetch failed: ${res.status} ${res.statusText}`)
      process.exit(1)
    }
    buf = Buffer.from(await res.arrayBuffer())
  }

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)

  console.log('\nSheets in workbook:')
  for (const ws of wb.worksheets) console.log(`  - "${ws.name}"  (${ws.rowCount} rows × ${ws.columnCount} cols)`)

  for (const sheetName of ['Compressive Strength', 'Summary']) {
    const ws = wb.getWorksheet(sheetName) ?? wb.worksheets.find(w => w.name.toLowerCase() === sheetName.toLowerCase())
    if (!ws) { console.log(`\n[!] Sheet "${sheetName}" not found`); continue }
    console.log(`\n=== ${ws.name} — header rows 12-16 ===`)
    const maxCol = Math.min(ws.columnCount, 50)
    for (let rowNum = 12; rowNum <= 16; rowNum++) {
      const row = ws.getRow(rowNum)
      console.log(`\nRow ${rowNum}:`)
      for (let c = 1; c <= maxCol; c++) {
        const txt = cellText(row.getCell(c))
        if (txt) console.log(`  col ${String(c).padStart(2)} (${colLetter(c).padStart(2)}): ${txt}`)
      }
    }
    console.log(`\nFirst data row (row 16) snapshot:`)
    const row = ws.getRow(16)
    for (let c = 1; c <= maxCol; c++) {
      const txt = cellText(row.getCell(c))
      if (txt) console.log(`  col ${String(c).padStart(2)} (${colLetter(c).padStart(2)}): ${txt.slice(0, 60)}`)
    }
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
