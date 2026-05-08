import { db } from '@/lib/db'
import { ticketRecords } from '@/lib/db/schema'

async function main() {
  const all = await db.select({
    id: ticketRecords.id,
    batch: ticketRecords.batchTicketNumber,
    ticketDate: ticketRecords.ticketDate,
    sampleSetId: ticketRecords.sampleSetId,
  }).from(ticketRecords)

  const p209Pattern = /p[\s\-_]?209/i
  const flagged = all.filter(t => t.batch && p209Pattern.test(t.batch))

  console.log(`Total tickets: ${all.length}`)
  console.log(`Tickets where batch contains P-209 / P209: ${flagged.length}\n`)

  const linked = flagged.filter(t => t.sampleSetId).length
  console.log(`  ...linked to a sample set: ${linked}`)
  console.log(`  ...unlinked:               ${flagged.length - linked}\n`)

  console.log('Distinct batch # values seen:')
  const counts: Record<string, number> = {}
  for (const t of flagged) counts[t.batch as string] = (counts[t.batch as string] ?? 0) + 1
  for (const [b, c] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  "${b}": ${c}`)
  }

  console.log('\nFirst 10 examples:')
  for (const t of flagged.slice(0, 10)) {
    console.log(`  id=${t.id.slice(0, 8)}  batch="${t.batch}"  date=${t.ticketDate}  linked=${t.sampleSetId ? 'yes' : 'no'}`)
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
