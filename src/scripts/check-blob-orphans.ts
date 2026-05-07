import { list } from '@vercel/blob'
import { db } from '@/lib/db'
import { ticketRecords, sampleSets, summaryRecords } from '@/lib/db/schema'

async function main() {
  // Collect every URL the DB knows about
  const tickets  = await db.select({ fileUrl: ticketRecords.fileUrl }).from(ticketRecords)
  const samples  = await db.select({ url: sampleSets.ticketFileUrl }).from(sampleSets)
  const summary  = await db.select({ url: summaryRecords.ticketFileUrl }).from(summaryRecords)

  const known = new Set<string>()
  for (const r of tickets) if (r.fileUrl) known.add(r.fileUrl)
  for (const r of samples) if (r.url) known.add(r.url)
  for (const r of summary) if (r.url) known.add(r.url)
  console.log(`DB knows about ${known.size} ticket-related URLs`)

  // List everything under tickets/ in Blob
  let cursor: string | undefined = undefined
  const allBlobs: Array<{ url: string; pathname: string; size: number; uploadedAt: Date }> = []
  do {
    const res = await list({ prefix: 'tickets/', cursor, limit: 1000 })
    allBlobs.push(...res.blobs)
    cursor = res.cursor
  } while (cursor)
  console.log(`Blob storage has ${allBlobs.length} files under tickets/\n`)

  // Find blobs not referenced in DB
  const orphans = allBlobs.filter(b => !known.has(b.url))
  console.log(`Orphaned blobs (in storage but not in DB): ${orphans.length}`)

  // Group orphans by month folder
  const byMonth: Record<string, typeof orphans> = {}
  for (const b of orphans) {
    // pathname looks like: tickets/bulk/2025-11/dd5-p0-1-1730...pdf
    const parts = b.pathname.split('/')
    const month = parts[2] ?? '(unknown)'
    if (!byMonth[month]) byMonth[month] = []
    byMonth[month].push(b)
  }
  for (const [month, blobs] of Object.entries(byMonth).sort()) {
    console.log(`\n  ${month}: ${blobs.length} orphans`)
    for (const b of blobs.slice(0, 5)) {
      const dt = b.uploadedAt.toISOString().slice(0, 10)
      console.log(`    ${dt}  ${b.pathname}  (${(b.size / 1024).toFixed(1)} KB)`)
    }
    if (blobs.length > 5) console.log(`    ... and ${blobs.length - 5} more`)
  }

  // Group ALL blobs by month for context
  console.log('\n=== All ticket blobs by month folder ===')
  const allByMonth: Record<string, number> = {}
  for (const b of allBlobs) {
    const parts = b.pathname.split('/')
    const month = parts[2] ?? '(unknown)'
    allByMonth[month] = (allByMonth[month] ?? 0) + 1
  }
  for (const [m, n] of Object.entries(allByMonth).sort()) {
    console.log(`  ${m}: ${n}`)
  }

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
