import { del } from '@vercel/blob'
import { db } from '@/lib/db'
import { ticketRecords, summaryRecords } from '@/lib/db/schema'
import { inArray, eq, isNotNull } from 'drizzle-orm'

async function main() {
  const tickets = await db.select({ fileUrl: ticketRecords.fileUrl }).from(ticketRecords)
  const ticketUrls = new Set(tickets.map(t => t.fileUrl))

  const summary = await db.select({
    id: summaryRecords.id,
    url: summaryRecords.ticketFileUrl,
    batch: summaryRecords.batchTicketNumber,
    shiftDate: summaryRecords.shiftDate,
  }).from(summaryRecords).where(isNotNull(summaryRecords.ticketFileUrl))

  const orphans = summary.filter(s => s.url && !ticketUrls.has(s.url))
  console.log(`DD5 summary rows with orphan ticket links: ${orphans.length}`)
  for (const o of orphans) {
    console.log(`  batch=${o.batch}  shift=${o.shiftDate}`)
  }
  if (orphans.length === 0) { console.log('Nothing to do.'); process.exit(0) }

  // 1. Delete blobs from storage
  await del(orphans.map(o => o.url!))
  console.log(`\nDeleted ${orphans.length} orphan blobs from storage`)

  // 2. Clear summaryRecords ticket links
  const ids = orphans.map(o => o.id)
  await db.update(summaryRecords)
    .set({ ticketFileUrl: null, matchStatus: 'unmatched' })
    .where(inArray(summaryRecords.id, ids))
  console.log(`Cleared ticket link + reset matchStatus on ${ids.length} summaryRecords`)

  // 3. Verify
  const remaining = await db.select({ id: summaryRecords.id })
    .from(summaryRecords)
    .where(eq(summaryRecords.matchStatus, 'auto_matched'))
  console.log(`\nDD5 summaryRecords still auto_matched: ${remaining.length}`)

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
