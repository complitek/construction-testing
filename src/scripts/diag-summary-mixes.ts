import { db } from '@/lib/db'
import { summaryRecords } from '@/lib/db/schema'

async function main() {
  const all = await db.select({
    mixId: summaryRecords.mixId,
    shiftDate: summaryRecords.shiftDate,
    locationDescription: summaryRecords.locationDescription,
    batchTicketNumber: summaryRecords.batchTicketNumber,
  }).from(summaryRecords)

  console.log(`Total summaryRecords: ${all.length}`)

  const byMix: Record<string, number> = {}
  for (const r of all) byMix[r.mixId ?? '(null)'] = (byMix[r.mixId ?? '(null)'] ?? 0) + 1
  console.log('\nBy mix ID:')
  for (const [k, v] of Object.entries(byMix).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`)
  }

  const nonTremie = all.filter(r => (r.mixId ?? '').toUpperCase() !== 'HD5KMDD1')
  console.log(`\nNon-HD5KMDD1 rows: ${nonTremie.length}`)
  for (const r of nonTremie.slice(0, 15)) {
    console.log(`  date=${r.shiftDate}  mix=${r.mixId}  batch=${r.batchTicketNumber}  loc=${r.locationDescription?.slice(0, 50)}`)
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
