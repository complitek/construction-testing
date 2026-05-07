import { db } from '@/lib/db'
import { ticketRecords } from '@/lib/db/schema'
import { isNull, eq, and } from 'drizzle-orm'

async function main() {
  const all = await db.select({
    id: ticketRecords.id,
    batch: ticketRecords.batchTicketNumber,
    ticketDate: ticketRecords.ticketDate,
    fileUrl: ticketRecords.fileUrl,
    pageStart: ticketRecords.pageStart,
    pageEnd: ticketRecords.pageEnd,
  }).from(ticketRecords)

  const nullBatch = all.filter(t => t.batch === null || t.batch === 'null' || t.batch === '')
  console.log(`Total ticketRecords: ${all.length}`)
  console.log(`With null/empty batch: ${nullBatch.length}\n`)
  for (const t of nullBatch) {
    console.log(`  id=${t.id.slice(0,8)} batch=${JSON.stringify(t.batch)} date=${t.ticketDate} pages=${t.pageStart}-${t.pageEnd} url=${t.fileUrl.slice(0,80)}...`)
  }
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
