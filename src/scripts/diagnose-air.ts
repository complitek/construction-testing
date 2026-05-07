import { db } from '@/lib/db'
import { sampleSets, pourEvents } from '@/lib/db/schema'
import { eq, isNull, gt } from 'drizzle-orm'

async function main() {
  const joined = await db.select({
    id: sampleSets.id,
    batchTicket: sampleSets.batchTicketNumber,
    airContent: sampleSets.airContent,
    date: pourEvents.date,
    location: pourEvents.location,
  })
  .from(sampleSets)
  .innerJoin(pourEvents, eq(sampleSets.pourEventId, pourEvents.id))

  // Find impossible values (> 50%)
  const bad = joined.filter(r => r.airContent != null && r.airContent > 50)
  console.log('\n=== IMPOSSIBLE AIR CONTENT (> 50%) ===')
  bad.forEach(r => console.log(`  ${r.date}  ${r.batchTicket}  ${r.airContent}%  [${r.id}]`))

  // Find NULL air content by month
  const nullByMonth: Record<string, number> = {}
  for (const r of joined) {
    if (r.airContent == null) {
      const month = r.date.substring(0, 7)
      nullByMonth[month] = (nullByMonth[month] ?? 0) + 1
    }
  }
  console.log('\n=== NULL AIR CONTENT BY MONTH ===')
  Object.entries(nullByMonth).sort().forEach(([month, count]) =>
    console.log(`  ${month}: ${count} records missing air content`)
  )

  console.log(`\nTotal records: ${joined.length}`)
  console.log(`With air content: ${joined.filter(r => r.airContent != null).length}`)
  console.log(`Missing air content: ${joined.filter(r => r.airContent == null).length}`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
