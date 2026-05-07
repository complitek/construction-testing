import { db } from '@/lib/db'
import { ticketRecords, sampleSets, summaryRecords } from '@/lib/db/schema'
import { eq, isNotNull } from 'drizzle-orm'

function norm(s: string | null): string {
  return (s ?? '').replace(/\s/g, '').replace(/^0+/, '')
}

async function main() {
  const tickets = await db.select({
    id: ticketRecords.id,
    batchTicketNumber: ticketRecords.batchTicketNumber,
    fileUrl: ticketRecords.fileUrl,
    sampleSetId: ticketRecords.sampleSetId,
    pourEventId: ticketRecords.pourEventId,
  }).from(ticketRecords).where(isNotNull(ticketRecords.batchTicketNumber))

  const samples = await db.select({
    id: sampleSets.id,
    batchTicketNumber: sampleSets.batchTicketNumber,
    pourEventId: sampleSets.pourEventId,
  }).from(sampleSets)

  const summary = await db.select({
    id: summaryRecords.id,
    batchTicketNumber: summaryRecords.batchTicketNumber,
  }).from(summaryRecords).where(isNotNull(summaryRecords.batchTicketNumber))

  // Build normalized lookup maps. Same logic as bulk-upload route's findSample/findSummary.
  const sampleByBatch = new Map<string, typeof samples[0]>()
  for (const s of samples) {
    const key = norm(s.batchTicketNumber)
    if (key && !sampleByBatch.has(key)) sampleByBatch.set(key, s)
  }
  const summaryByBatch = new Map<string, typeof summary[0]>()
  for (const s of summary) {
    const key = norm(s.batchTicketNumber)
    if (key && !summaryByBatch.has(key)) summaryByBatch.set(key, s)
  }

  let pwMatched = 0, dd5Matched = 0, stillUnmatched = 0
  const ticketUpdates: Array<{ id: string; sampleSetId: string | null; pourEventId: string | null }> = []
  const samplesToUpdate = new Map<string, string>()   // sampleId -> ticketFileUrl
  const summariesToUpdate = new Map<string, string>() // summaryId -> ticketFileUrl

  for (const t of tickets) {
    const key = norm(t.batchTicketNumber)
    const sample = sampleByBatch.get(key)
    if (sample) {
      pwMatched++
      ticketUpdates.push({ id: t.id, sampleSetId: sample.id, pourEventId: sample.pourEventId })
      samplesToUpdate.set(sample.id, t.fileUrl)
      continue
    }
    const sm = summaryByBatch.get(key)
    if (sm) {
      dd5Matched++
      ticketUpdates.push({ id: t.id, sampleSetId: null, pourEventId: null })
      summariesToUpdate.set(sm.id, t.fileUrl)
      continue
    }
    stillUnmatched++
  }

  console.log(`Tickets to link to PW sampleSets: ${pwMatched}`)
  console.log(`Tickets to link to DD5 summaryRecords: ${dd5Matched}`)
  console.log(`Tickets still unmatched (batch # not in either log): ${stillUnmatched}`)

  // Apply updates
  for (const u of ticketUpdates) {
    if (u.sampleSetId || u.pourEventId) {
      await db.update(ticketRecords)
        .set({ sampleSetId: u.sampleSetId, pourEventId: u.pourEventId })
        .where(eq(ticketRecords.id, u.id))
    }
  }
  for (const [sampleId, url] of samplesToUpdate) {
    await db.update(sampleSets)
      .set({ ticketFileUrl: url, matchStatus: 'auto_matched', updatedAt: new Date() })
      .where(eq(sampleSets.id, sampleId))
  }
  for (const [summaryId, url] of summariesToUpdate) {
    await db.update(summaryRecords)
      .set({ ticketFileUrl: url, matchStatus: 'auto_matched' })
      .where(eq(summaryRecords.id, summaryId))
  }

  console.log(`\nApplied: ${samplesToUpdate.size} sample updates, ${summariesToUpdate.size} summary updates, ${ticketUpdates.filter(u => u.sampleSetId).length} ticket links.`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
