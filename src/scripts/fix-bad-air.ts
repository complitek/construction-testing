/**
 * Fix the two records that were incorrectly multiplied (0.77 → 77, 0.75 → 75).
 * Divides them back by 100 to restore original values.
 * Run once: npm run fix:bad-air
 */
import { db } from '@/lib/db'
import { sampleSets, pourEvents } from '@/lib/db/schema'
import { eq, gt, sql } from 'drizzle-orm'

async function main() {
  // Find all records where air content was incorrectly multiplied (> 50 is impossible for concrete)
  const bad = await db.select({
    id: sampleSets.id,
    airContent: sampleSets.airContent,
    batchTicket: sampleSets.batchTicketNumber,
    pourEventId: sampleSets.pourEventId,
  })
  .from(sampleSets)
  .where(gt(sampleSets.airContent, 50))

  if (bad.length === 0) {
    console.log('No bad air content values found.')
    process.exit(0)
  }

  for (const record of bad) {
    const [pour] = await db.select({ date: pourEvents.date, location: pourEvents.location })
      .from(pourEvents).where(eq(pourEvents.id, record.pourEventId)).limit(1)
    const corrected = ((record.airContent ?? 0) / 100).toFixed(2)
    console.log(`Fixing ${pour?.date} ticket ${record.batchTicket}: ${record.airContent}% → ${corrected}%`)

    await db.update(sampleSets)
      .set({ airContent: sql`air_content / 100` })
      .where(eq(sampleSets.id, record.id))
  }

  console.log(`\nFixed ${bad.length} record(s).`)
  console.log('NOTE: These restored values may still be incorrect — please verify them in the app.')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
