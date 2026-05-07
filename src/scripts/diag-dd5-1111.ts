import { db } from '@/lib/db'
import { summaryRecords, ticketRecords } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

async function main() {
  const norm = (s: string | null) => (s ?? '').replace(/\s/g, '').replace(/^0+/, '')

  const dd5 = await db.select({
    id: summaryRecords.id,
    batch: summaryRecords.batchTicketNumber,
    shiftDate: summaryRecords.shiftDate,
    mixId: summaryRecords.mixId,
    ticketFileUrl: summaryRecords.ticketFileUrl,
    matchStatus: summaryRecords.matchStatus,
  }).from(summaryRecords).where(eq(summaryRecords.shiftDate, '2025-11-11'))

  console.log(`=== DD5 summaryRecords for 2025-11-11: ${dd5.length} ===`)
  for (const r of dd5) {
    console.log(`  id=${r.id.slice(0,8)}  batch=${r.batch}  mix=${r.mixId}  ticketFileUrl=${r.ticketFileUrl ? 'SET' : 'NULL'}  status=${r.matchStatus}`)
  }

  const tickets = await db.select({
    id: ticketRecords.id,
    batch: ticketRecords.batchTicketNumber,
    fileUrl: ticketRecords.fileUrl,
    ticketDate: ticketRecords.ticketDate,
  }).from(ticketRecords)

  console.log(`\n=== MATCH ATTEMPT: each 11/11 DD5 record vs ticketRecords ===`)
  for (const r of dd5) {
    const tn = norm(r.batch)
    if (!tn) { console.log(`  batch=${r.batch} -> empty/normalized empty`); continue }
    const hits = tickets.filter(t => norm(t.batch) === tn)
    if (hits.length === 0) {
      console.log(`  batch=${r.batch} -> NO ticket match`)
    } else {
      for (const h of hits.slice(0, 3)) {
        console.log(`  batch=${r.batch} -> ticket=${h.id.slice(0,8)}  ticketBatch=${h.batch}  ticketDate=${h.ticketDate}`)
      }
    }
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
