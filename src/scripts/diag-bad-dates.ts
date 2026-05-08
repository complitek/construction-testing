import { db } from '@/lib/db'
import { ticketRecords } from '@/lib/db/schema'

async function main() {
  const all = await db.select({
    id: ticketRecords.id,
    batch: ticketRecords.batchTicketNumber,
    ticketDate: ticketRecords.ticketDate,
    fileUrl: ticketRecords.fileUrl,
  }).from(ticketRecords)

  const now = new Date().getFullYear()
  const flagged = all.filter(t => {
    if (!t.batch || t.batch === 'null' || t.batch.trim() === '') return true
    if (!t.ticketDate) return true
    const y = parseInt(t.ticketDate.slice(0, 4), 10)
    return isNaN(y) || y < 2024 || y > now + 1
  })

  console.log(`Total tickets: ${all.length}`)
  console.log(`Flagged (needs review): ${flagged.length}\n`)

  const byReason: Record<string, number> = {}
  for (const t of flagged) {
    let reason: string
    if (!t.batch || t.batch === 'null' || t.batch.trim() === '') reason = 'null/empty batch'
    else if (!t.ticketDate) reason = 'no date'
    else {
      const y = parseInt(t.ticketDate.slice(0, 4), 10)
      reason = isNaN(y) ? 'unparseable date' : `year ${y}`
    }
    byReason[reason] = (byReason[reason] ?? 0) + 1
  }
  console.log('Breakdown by reason:')
  for (const [k, v] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`)
  }

  console.log('\nFirst 20 flagged tickets:')
  for (const t of flagged.slice(0, 20)) {
    console.log(`  id=${t.id.slice(0, 8)}  batch=${JSON.stringify(t.batch)}  date=${t.ticketDate}`)
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
