import { db } from '@/lib/db'
import { ticketRecords, pourEvents } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

async function main() {
  const rows = await db.select({
    id: ticketRecords.id,
    batchTicketNumber: ticketRecords.batchTicketNumber,
    ticketDate: ticketRecords.ticketDate,
    createdAt: ticketRecords.createdAt,
    sampleSetId: ticketRecords.sampleSetId,
    pourEventId: ticketRecords.pourEventId,
    pourDate: pourEvents.date,
  })
  .from(ticketRecords)
  .leftJoin(pourEvents, eq(ticketRecords.pourEventId, pourEvents.id))

  console.log(`Total tickets: ${rows.length}\n`)

  // Group by ticketDate (the AI-extracted date)
  const byTicketDate = new Map<string, number>()
  const byPourDate = new Map<string, number>()
  const byCreatedMonth = new Map<string, number>()
  for (const r of rows) {
    const td = r.ticketDate ?? '(no date)'
    byTicketDate.set(td, (byTicketDate.get(td) ?? 0) + 1)
    const pd = r.pourDate ?? '(unmatched / no pour)'
    byPourDate.set(pd, (byPourDate.get(pd) ?? 0) + 1)
    const cm = r.createdAt.toISOString().slice(0, 10)
    byCreatedMonth.set(cm, (byCreatedMonth.get(cm) ?? 0) + 1)
  }

  console.log('=== By AI-extracted ticketDate (on the PDF itself) ===')
  for (const [d, n] of [...byTicketDate.entries()].sort()) {
    console.log(`  ${d}: ${n}`)
  }

  console.log('\n=== By linked pour date (matched tickets only) ===')
  for (const [d, n] of [...byPourDate.entries()].sort()) {
    console.log(`  ${d}: ${n}`)
  }

  console.log('\n=== By upload date (createdAt) ===')
  for (const [d, n] of [...byCreatedMonth.entries()].sort()) {
    console.log(`  ${d}: ${n}`)
  }

  console.log('\n=== Each ticket: batch / ticketDate / pourDate / matched? ===')
  rows.sort((a, b) => (a.ticketDate ?? '').localeCompare(b.ticketDate ?? ''))
  for (const r of rows) {
    const matched = r.sampleSetId ? 'PW' : '—'
    console.log(`  batch=${(r.batchTicketNumber ?? '(none)').padEnd(10)} ticketDate=${(r.ticketDate ?? '—').padEnd(12)} pourDate=${(r.pourDate ?? '—').padEnd(12)} ${matched}`)
  }

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
