import { db } from '@/lib/db'
import { ticketRecords, sampleSets, summaryRecords } from '@/lib/db/schema'
import { eq, isNotNull } from 'drizzle-orm'
import { extractTicketDataFromPdf } from '@/lib/vision/extract-ticket'

const norm = (s: string | null) => (s ?? '').replace(/\s/g, '').replace(/^0+/, '')

async function main() {
  const all = await db.select({
    id: ticketRecords.id,
    batch: ticketRecords.batchTicketNumber,
    fileUrl: ticketRecords.fileUrl,
  }).from(ticketRecords)

  const nulls = all.filter(t => t.batch === null || t.batch === 'null' || t.batch === '')
  console.log(`Re-extracting ${nulls.length} null-batch tickets...`)

  const [allSamples, allSummary] = await Promise.all([
    db.select({ id: sampleSets.id, batch: sampleSets.batchTicketNumber, pourEventId: sampleSets.pourEventId }).from(sampleSets),
    db.select({ id: summaryRecords.id, batch: summaryRecords.batchTicketNumber }).from(summaryRecords).where(isNotNull(summaryRecords.batchTicketNumber)),
  ])
  const sampleByBatch = new Map(allSamples.map(s => [norm(s.batch), s]))
  const summaryByBatch = new Map(allSummary.map(s => [norm(s.batch as string), s]))

  for (const t of nulls) {
    const res = await fetch(t.fileUrl, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    })
    if (!res.ok) { console.log(`  ${t.id.slice(0,8)}  fetch failed: ${res.status}`); continue }
    const bytes = new Uint8Array(await res.arrayBuffer())
    const ex = await extractTicketDataFromPdf(bytes)
    console.log(`  ${t.id.slice(0,8)}  batch=${ex.batchTicketNumber}  date=${ex.date}  conf=${ex.confidence}`)

    if (!ex.batchTicketNumber) continue

    const k = norm(ex.batchTicketNumber)
    const sample = sampleByBatch.get(k)
    const summary = summaryByBatch.get(k)

    await db.update(ticketRecords)
      .set({
        batchTicketNumber: ex.batchTicketNumber,
        ticketDate: ex.date ?? null,
        sampleSetId: sample?.id ?? null,
        pourEventId: sample?.pourEventId ?? null,
      })
      .where(eq(ticketRecords.id, t.id))

    if (sample) {
      await db.update(sampleSets)
        .set({ ticketFileUrl: t.fileUrl, matchStatus: 'auto_matched', updatedAt: new Date() })
        .where(eq(sampleSets.id, sample.id))
      console.log(`    -> linked PW sampleSet ${sample.id.slice(0,8)}`)
    }
    if (summary) {
      await db.update(summaryRecords)
        .set({ ticketFileUrl: t.fileUrl, matchStatus: 'auto_matched' })
        .where(eq(summaryRecords.id, summary.id))
      console.log(`    -> linked DD5 summaryRecord ${summary.id.slice(0,8)}`)
    }
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
