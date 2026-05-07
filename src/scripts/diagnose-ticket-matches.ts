import { db } from '@/lib/db'
import { sampleSets, ticketRecords, summaryRecords } from '@/lib/db/schema'
import { isNotNull, isNull, and, eq } from 'drizzle-orm'

async function main() {
  console.log('=== TICKET RECORDS ===')
  const allTickets = await db.select({
    id: ticketRecords.id,
    batchTicketNumber: ticketRecords.batchTicketNumber,
    sampleSetId: ticketRecords.sampleSetId,
    pourEventId: ticketRecords.pourEventId,
    ticketDate: ticketRecords.ticketDate,
  }).from(ticketRecords)
  const ticketsWithSample  = allTickets.filter(t => t.sampleSetId != null).length
  const ticketsWithPour    = allTickets.filter(t => t.pourEventId != null).length
  const ticketsNoLink      = allTickets.filter(t => t.sampleSetId == null && t.pourEventId == null).length
  console.log(`  Total ticket records:           ${allTickets.length}`)
  console.log(`  With sampleSetId (PW match):    ${ticketsWithSample}`)
  console.log(`  With pourEventId:               ${ticketsWithPour}`)
  console.log(`  Unlinked (no sample, no pour):  ${ticketsNoLink}`)

  console.log('\n=== SAMPLE SETS (Project Wide) ===')
  const allSamples = await db.select({
    id: sampleSets.id,
    batchTicketNumber: sampleSets.batchTicketNumber,
    ticketFileUrl: sampleSets.ticketFileUrl,
    matchStatus: sampleSets.matchStatus,
  }).from(sampleSets)
  const samplesWithUrl = allSamples.filter(s => s.ticketFileUrl != null).length
  const byStatus: Record<string, number> = {}
  for (const s of allSamples) byStatus[s.matchStatus] = (byStatus[s.matchStatus] ?? 0) + 1
  console.log(`  Total sampleSets:               ${allSamples.length}`)
  console.log(`  With ticketFileUrl set:         ${samplesWithUrl}`)
  console.log(`  By matchStatus:`)
  for (const [k, v] of Object.entries(byStatus)) console.log(`    ${k}: ${v}`)

  console.log('\n=== SUMMARY RECORDS (DD5) ===')
  const allSummary = await db.select({
    id: summaryRecords.id,
    batchTicketNumber: summaryRecords.batchTicketNumber,
    ticketFileUrl: summaryRecords.ticketFileUrl,
    matchStatus: summaryRecords.matchStatus,
    mixId: summaryRecords.mixId,
  }).from(summaryRecords)
  const summaryWithUrl = allSummary.filter(s => s.ticketFileUrl != null).length
  const summaryStatus: Record<string, number> = {}
  for (const s of allSummary) summaryStatus[s.matchStatus] = (summaryStatus[s.matchStatus] ?? 0) + 1
  console.log(`  Total summaryRecords:           ${allSummary.length}`)
  console.log(`  With ticketFileUrl set:         ${summaryWithUrl}`)
  console.log(`  By matchStatus:`)
  for (const [k, v] of Object.entries(summaryStatus)) console.log(`    ${k}: ${v}`)

  console.log('\n=== CROSS-CHECK: ticketRecords.sampleSetId vs sampleSets.ticketFileUrl ===')
  const linked = await db.select({
    ticketId: ticketRecords.id,
    ticketBatch: ticketRecords.batchTicketNumber,
    sampleId: sampleSets.id,
    sampleBatch: sampleSets.batchTicketNumber,
    sampleFileUrl: sampleSets.ticketFileUrl,
    sampleStatus: sampleSets.matchStatus,
  })
  .from(ticketRecords)
  .innerJoin(sampleSets, eq(ticketRecords.sampleSetId, sampleSets.id))

  const linkedNoUrl = linked.filter(r => r.sampleFileUrl == null)
  console.log(`  ticketRecords linked to sampleSets:        ${linked.length}`)
  console.log(`  ...where sampleSet.ticketFileUrl IS NULL:  ${linkedNoUrl.length}  <-- BUG SIGNAL`)
  if (linkedNoUrl.length > 0) {
    console.log('\n  First 5 examples (link exists but ticketFileUrl missing):')
    for (const r of linkedNoUrl.slice(0, 5)) {
      console.log(`    ticket=${r.ticketBatch}  sample=${r.sampleBatch}  status=${r.sampleStatus}  sampleId=${r.sampleId}`)
    }
  }

  console.log('\n=== SAMPLE 5 MATCHED PW RECORDS (sampleSets with ticketFileUrl) ===')
  const matchedSamples = allSamples.filter(s => s.ticketFileUrl != null).slice(0, 5)
  for (const s of matchedSamples) {
    console.log(`  batch=${s.batchTicketNumber}  status=${s.matchStatus}  url=${s.ticketFileUrl?.slice(0, 80)}...`)
  }

  console.log('\n=== BATCH NUMBER OVERLAP CHECK ===')
  const norm = (s: string | null) => s == null ? '' : s.replace(/\s/g, '').replace(/^0+/, '')
  const ticketBatches = new Set(allTickets.map(t => norm(t.batchTicketNumber)).filter(Boolean))
  const sampleBatches = new Set(allSamples.map(s => norm(s.batchTicketNumber)).filter(Boolean))
  const summaryBatches = new Set(allSummary.map(s => norm(s.batchTicketNumber)).filter(Boolean))
  const ticketsHittingSamples  = [...ticketBatches].filter(b => sampleBatches.has(b))
  const ticketsHittingSummary  = [...ticketBatches].filter(b => summaryBatches.has(b))
  const ticketsHittingNeither  = [...ticketBatches].filter(b => !sampleBatches.has(b) && !summaryBatches.has(b))
  console.log(`  Distinct ticket batch nums:                ${ticketBatches.size}`)
  console.log(`  Tickets whose batch IS in sampleSets:      ${ticketsHittingSamples.length}`)
  console.log(`  Tickets whose batch IS in summaryRecords:  ${ticketsHittingSummary.length}`)
  console.log(`  Tickets matching neither:                  ${ticketsHittingNeither.length}`)

  console.log('\n  First 10 ticket batch numbers (raw):')
  for (const t of allTickets.slice(0, 10)) {
    console.log(`    "${t.batchTicketNumber}"  date=${t.ticketDate}`)
  }

  console.log('\n  First 10 sampleSets batch numbers (raw):')
  for (const s of allSamples.slice(0, 10)) {
    console.log(`    "${s.batchTicketNumber}"`)
  }

  if (ticketsHittingSamples.length > 0) {
    console.log('\n  Sample matches found (normalized batch):')
    for (const b of ticketsHittingSamples.slice(0, 10)) console.log(`    ${b}`)
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
