import { db } from '@/lib/db'
import { ticketRecords, sampleSets, pourEvents } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'

async function main() {
  // 1. Detach tickets from samples/pours so the upcoming pourEvents delete
  //    does not cascade-delete the 75 uploaded ticket records.
  const detached = await db.update(ticketRecords)
    .set({ sampleSetId: null, pourEventId: null })
    .returning({ id: ticketRecords.id })
  console.log(`Detached ${detached.length} ticketRecords (sampleSetId/pourEventId -> null)`)

  // 2. Clear ticketFileUrl + matchStatus from sampleSets — about to be deleted anyway,
  //    but guards against partial failures.
  await db.execute(sql`UPDATE sample_sets SET ticket_file_url = NULL, match_status = 'unmatched'`)

  // 3. Delete sampleSets first (FK-safe) then pourEvents.
  const samplesDeleted = await db.delete(sampleSets).returning({ id: sampleSets.id })
  console.log(`Deleted ${samplesDeleted.length} sampleSets`)

  const poursDeleted = await db.delete(pourEvents).returning({ id: pourEvents.id })
  console.log(`Deleted ${poursDeleted.length} pourEvents`)

  // 4. Sanity check: tickets should still be there.
  const remainingTickets = await db.select({ id: ticketRecords.id }).from(ticketRecords)
  console.log(`ticketRecords remaining (should still be 75): ${remainingTickets.length}`)

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
