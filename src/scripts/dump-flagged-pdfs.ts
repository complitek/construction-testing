import { db } from '@/lib/db'
import { ticketRecords } from '@/lib/db/schema'
import * as fs from 'node:fs'
import * as path from 'node:path'

async function main() {
  const all = await db.select({
    id: ticketRecords.id,
    batch: ticketRecords.batchTicketNumber,
    ticketDate: ticketRecords.ticketDate,
    fileUrl: ticketRecords.fileUrl,
  }).from(ticketRecords)

  const now = new Date().getFullYear()
  const flagged = all.filter(t => {
    if (!t.batch || t.batch === 'null' || t.batch.trim() === '') return true
    if (!t.ticketDate) return true
    const y = parseInt(t.ticketDate.slice(0, 4), 10)
    return isNaN(y) || y < 2024 || y > now + 1
  })

  const outDir = path.join(process.cwd(), 'tmp-flagged')
  fs.mkdirSync(outDir, { recursive: true })
  console.log(`Saving ${flagged.length} flagged PDFs to ${outDir}`)

  for (const t of flagged) {
    const res = await fetch(t.fileUrl, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    })
    if (!res.ok) { console.log(`  ${t.id.slice(0,8)} fetch failed: ${res.status}`); continue }
    const bytes = Buffer.from(await res.arrayBuffer())
    const safe = `${t.id.slice(0,8)}_batch-${(t.batch ?? 'null').replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`
    fs.writeFileSync(path.join(outDir, safe), bytes)
    console.log(`  ${safe}  (${bytes.byteLength} bytes)`)
  }
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
