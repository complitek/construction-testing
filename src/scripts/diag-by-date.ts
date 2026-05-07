import { db } from '@/lib/db'
import { sampleSets, pourEvents, ticketRecords, summaryRecords } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

async function main() {
  const samples = await db.select({
    id: sampleSets.id,
    batch: sampleSets.batchTicketNumber,
    ticketFileUrl: sampleSets.ticketFileUrl,
    pourDate: pourEvents.date,
  }).from(sampleSets).leftJoin(pourEvents, eq(sampleSets.pourEventId, pourEvents.id))

  const byDate: Record<string, { total: number; withTicket: number; batches: string[]; matchedBatches: string[] }> = {}
  for (const s of samples) {
    const d = s.pourDate ?? '(no date)'
    byDate[d] ??= { total: 0, withTicket: 0, batches: [], matchedBatches: [] }
    byDate[d].total++
    byDate[d].batches.push(s.batch)
    if (s.ticketFileUrl) {
      byDate[d].withTicket++
      byDate[d].matchedBatches.push(s.batch)
    }
  }

  console.log('=== PW SAMPLE SETS by pour date (with ticket attached?) ===')
  for (const [date, info] of Object.entries(byDate).sort()) {
    if (info.total > 0) {
      console.log(`  ${date}  total=${info.total}  withTicket=${info.withTicket}`)
      if (info.total <= 30) {
        console.log(`    batches: ${info.batches.join(', ')}`)
        console.log(`    matched: ${info.matchedBatches.join(', ') || '—'}`)
      }
    }
  }

  console.log('\n=== TICKET RECORDS by ticketDate ===')
  const tickets = await db.select({
    batch: ticketRecords.batchTicketNumber,
    sampleSetId: ticketRecords.sampleSetId,
    ticketDate: ticketRecords.ticketDate,
  }).from(ticketRecords)
  const byTDate: Record<string, { total: number; matched: number }> = {}
  for (const t of tickets) {
    const d = t.ticketDate ?? '(no date)'
    byTDate[d] ??= { total: 0, matched: 0 }
    byTDate[d].total++
    if (t.sampleSetId) byTDate[d].matched++
  }
  for (const [date, info] of Object.entries(byTDate).sort()) {
    console.log(`  ${date}  total=${info.total}  matchedToSample=${info.matched}`)
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
