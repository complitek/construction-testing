import * as ExcelJS from 'exceljs'
import { readFile } from 'node:fs/promises'

async function main() {
  const path = process.argv[2]
  if (!path) { console.error('Usage: tsx sample-cs-batches.ts <xlsx>'); process.exit(1) }
  const buf = await readFile(path)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const ws = wb.getWorksheet('Compressive Strength')
  if (!ws) { console.error('No CS sheet'); process.exit(1) }

  let total = 0, withBatch = 0, naBatch = 0, blankBatch = 0
  const samples: string[] = []
  ws.eachRow((row, n) => {
    if (n < 16) return
    // Quick row liveness check: shift date in C
    const shiftDate = row.getCell(3).value
    if (!shiftDate) return
    total++
    const v = row.getCell(12).value
    let s: string | null = null
    if (typeof v === 'string') s = v.trim()
    else if (typeof v === 'number') s = String(v)
    else if (v && typeof v === 'object' && 'text' in v) s = String((v as {text:unknown}).text).trim()
    else if (v && typeof v === 'object' && 'result' in v) s = String((v as {result:unknown}).result).trim()
    else if (v && typeof v === 'object' && 'richText' in v) s = ((v as {richText:Array<{text:string}>}).richText).map(r=>r.text).join('').trim()
    if (s == null || s === '') blankBatch++
    else if (s.toUpperCase() === 'N/A') naBatch++
    else { withBatch++; if (samples.length < 30) samples.push(`row ${n}: "${s}"`) }
  })
  console.log(`Total CS rows with shift date: ${total}`)
  console.log(`  Real batch ticket #:  ${withBatch}`)
  console.log(`  "N/A":                ${naBatch}`)
  console.log(`  Blank:                ${blankBatch}`)
  console.log('\nSample real batch numbers (first 30):')
  for (const s of samples) console.log(`  ${s}`)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
