/**
 * One-time fix: air content values were imported from Excel as decimal fractions
 * (Excel stores 1.7% as 0.017 internally). This script multiplies all values < 1 by 100.
 * Run once: npm run fix:air
 */
import { db } from '@/lib/db'
import { sampleSets } from '@/lib/db/schema'
import { sql, and, lt, isNotNull } from 'drizzle-orm'

async function main() {
  const before = await db
    .select({ id: sampleSets.id, air: sampleSets.airContent })
    .from(sampleSets)
    .where(and(isNotNull(sampleSets.airContent), lt(sampleSets.airContent, 1)))

  if (before.length === 0) {
    console.log('No air content values need fixing.')
    process.exit(0)
  }

  console.log(`Fixing ${before.length} air content values...`)
  before.forEach(r => console.log(`  ${r.id}: ${r.air} → ${((r.air ?? 0) * 100).toFixed(2)}`))

  await db.update(sampleSets)
    .set({ airContent: sql`air_content * 100` })
    .where(and(
      isNotNull(sampleSets.airContent),
      lt(sampleSets.airContent, 1),
    ))

  console.log('Done.')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
