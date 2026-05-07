import { db } from '@/lib/db'
import { ticketRecords, sampleSets, summaryRecords } from '@/lib/db/schema'

async function main() {
  const tickets = await db.select({ fileUrl: ticketRecords.fileUrl, batch: ticketRecords.batchTicketNumber })
    .from(ticketRecords)
  const ticketUrls = new Set(tickets.map(t => t.fileUrl))

  const samples = await db.select({
    id: sampleSets.id,
    url: sampleSets.ticketFileUrl,
    batch: sampleSets.batchTicketNumber,
    status: sampleSets.matchStatus,
  }).from(sampleSets)

  const summary = await db.select({
    id: summaryRecords.id,
    url: summaryRecords.ticketFileUrl,
    batch: summaryRecords.batchTicketNumber,
    status: summaryRecords.matchStatus,
    shiftDate: summaryRecords.shiftDate,
  }).from(summaryRecords)

  console.log(`ticketRecords URLs:        ${ticketUrls.size}`)
  console.log(`sampleSets URLs (set):     ${samples.filter(s => s.url).length}`)
  console.log(`summaryRecords URLs (set): ${summary.filter(s => s.url).length}\n`)

  // sampleSets URLs not in ticketRecords
  const sampleOrphans = samples.filter(s => s.url && !ticketUrls.has(s.url))
  console.log(`sampleSets URLs NOT also in ticketRecords: ${sampleOrphans.length}`)
  for (const s of sampleOrphans) {
    console.log(`  batch=${s.batch}  status=${s.status}  url=${s.url?.slice(0, 100)}`)
  }

  // summaryRecords URLs not in ticketRecords
  const summaryOrphans = summary.filter(s => s.url && !ticketUrls.has(s.url))
  console.log(`\nsummaryRecords URLs NOT also in ticketRecords: ${summaryOrphans.length}`)
  for (const s of summaryOrphans) {
    console.log(`  batch=${s.batch}  status=${s.status}  shift=${s.shiftDate}  url=${s.url?.slice(0, 100)}`)
  }

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
