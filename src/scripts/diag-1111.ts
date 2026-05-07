import { db } from '@/lib/db'
import { sampleSets, ticketRecords } from '@/lib/db/schema'
import { eq, and, isNotNull } from 'drizzle-orm'

async function main() {
  const t1111 = await db.select({
    id: ticketRecords.id,
    batch: ticketRecords.batchTicketNumber,
    sampleSetId: ticketRecords.sampleSetId,
    pourEventId: ticketRecords.pourEventId,
    ticketDate: ticketRecords.ticketDate,
    fileUrl: ticketRecords.fileUrl,
  }).from(ticketRecords).where(eq(ticketRecords.ticketDate, '2025-11-11'))

  console.log(`=== TICKETS dated 2025-11-11: ${t1111.length} ===`)
  for (const t of t1111) {
    console.log(`  batch=${t.batch}  sampleSetId=${t.sampleSetId ?? '—'}  pourEventId=${t.pourEventId ?? '—'}`)
  }

  const norm = (s: string | null) => (s ?? '').replace(/\s/g, '').replace(/^0+/, '')

  const allSamples = await db.select({
    id: sampleSets.id,
    batch: sampleSets.batchTicketNumber,
    ticketFileUrl: sampleSets.ticketFileUrl,
    matchStatus: sampleSets.matchStatus,
  }).from(sampleSets)

  console.log(`\n=== ATTEMPT MATCH for 2025-11-11 tickets against sampleSets ===`)
  for (const t of t1111) {
    if (!t.batch || t.batch === 'null') continue
    const tn = norm(t.batch)
    const hits = allSamples.filter(s => norm(s.batch) === tn)
    if (hits.length === 0) {
      console.log(`  ticket batch=${t.batch}  -> NO sample match`)
    } else {
      for (const h of hits) {
        console.log(`  ticket batch=${t.batch}  -> sample=${h.id}  sampleBatch=${h.batch}  ticketFileUrl=${h.ticketFileUrl ? 'SET' : 'NULL'}  status=${h.matchStatus}`)
      }
    }
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
