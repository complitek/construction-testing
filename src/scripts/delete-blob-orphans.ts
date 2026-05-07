import { list, del } from '@vercel/blob'
import { db } from '@/lib/db'
import { ticketRecords, sampleSets, summaryRecords } from '@/lib/db/schema'

async function main() {
  // Collect every URL the DB knows about (these are KEPT)
  const tickets  = await db.select({ fileUrl: ticketRecords.fileUrl }).from(ticketRecords)
  const samples  = await db.select({ url: sampleSets.ticketFileUrl }).from(sampleSets)
  const summary  = await db.select({ url: summaryRecords.ticketFileUrl }).from(summaryRecords)

  const known = new Set<string>()
  for (const r of tickets) if (r.fileUrl) known.add(r.fileUrl)
  for (const r of samples) if (r.url) known.add(r.url)
  for (const r of summary) if (r.url) known.add(r.url)
  console.log(`Keeping ${known.size} blobs referenced by DB`)

  // List everything under tickets/ in Blob
  let cursor: string | undefined = undefined
  const allBlobs: Array<{ url: string; pathname: string; size: number }> = []
  do {
    const res = await list({ prefix: 'tickets/', cursor, limit: 1000 })
    allBlobs.push(...res.blobs)
    cursor = res.cursor
  } while (cursor)
  console.log(`Total blobs under tickets/: ${allBlobs.length}`)

  const orphans = allBlobs.filter(b => !known.has(b.url))
  console.log(`Orphans to delete: ${orphans.length}`)
  const totalKB = orphans.reduce((s, b) => s + b.size, 0) / 1024
  console.log(`Total size to free: ${(totalKB / 1024).toFixed(1)} MB\n`)

  if (orphans.length === 0) { console.log('Nothing to delete.'); process.exit(0) }

  // Delete in chunks of 100 (Blob del accepts arrays)
  let deleted = 0
  const CHUNK = 100
  for (let i = 0; i < orphans.length; i += CHUNK) {
    const slice = orphans.slice(i, i + CHUNK)
    await del(slice.map(b => b.url))
    deleted += slice.length
    console.log(`  deleted ${deleted}/${orphans.length}`)
  }

  console.log(`\nDone. Removed ${deleted} orphan blobs.`)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
