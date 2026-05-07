import { db } from '@/lib/db'
import { summaryRecords, ticketRecords } from '@/lib/db/schema'
import { eq, isNull } from 'drizzle-orm'

const norm = (s: string | null) => (s ?? '').replace(/\s/g, '').replace(/^0+/, '')

async function main() {
  const tickets = await db.select({
    id: ticketRecords.id,
    batch: ticketRecords.batchTicketNumber,
    fileUrl: ticketRecords.fileUrl,
  }).from(ticketRecords)

  const ticketByBatch = new Map<string, { id: string; fileUrl: string }>()
  for (const t of tickets) {
    const k = norm(t.batch)
    if (!k) continue
    if (!ticketByBatch.has(k)) ticketByBatch.set(k, { id: t.id, fileUrl: t.fileUrl })
  }

  const dd5Unlinked = await db.select({
    id: summaryRecords.id,
    batch: summaryRecords.batchTicketNumber,
    shiftDate: summaryRecords.shiftDate,
  }).from(summaryRecords).where(isNull(summaryRecords.ticketFileUrl))

  console.log(`DD5 records without ticketFileUrl: ${dd5Unlinked.length}`)
  console.log(`Ticket-by-batch index size: ${ticketByBatch.size}`)

  let linked = 0
  let skipped = 0
  for (const r of dd5Unlinked) {
    const k = norm(r.batch)
    const hit = ticketByBatch.get(k)
    if (!hit) { skipped++; continue }
    await db.update(summaryRecords)
      .set({ ticketFileUrl: hit.fileUrl, matchStatus: 'auto_matched' })
      .where(eq(summaryRecords.id, r.id))
    console.log(`  linked DD5 ${r.id.slice(0,8)} (batch=${r.batch}, shift=${r.shiftDate}) -> ticket ${hit.id.slice(0,8)}`)
    linked++
  }

  console.log(`\nLinked: ${linked}`)
  console.log(`Skipped (no matching ticket): ${skipped}`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
