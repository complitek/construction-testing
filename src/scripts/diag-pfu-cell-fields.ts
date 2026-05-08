import { db } from '@/lib/db'
import { summaryRecords, sampleSets, pourEvents } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

async function main() {
  console.log('=== DD5 summaryRecords sample (first 5) ===')
  const dd5 = await db.select({
    shiftDate: summaryRecords.shiftDate,
    locationDescription: summaryRecords.locationDescription,
    dfow: summaryRecords.dfow,
    area: summaryRecords.area,
    structure: summaryRecords.structure,
    element: summaryRecords.element,
    batchTicketNumber: summaryRecords.batchTicketNumber,
  }).from(summaryRecords).limit(5)
  for (const r of dd5) {
    console.log(JSON.stringify(r, null, 2))
  }

  console.log('\n=== PW sampleSets + pourEvents sample (first 5) ===')
  const pw = await db.select({
    pourDate: pourEvents.date,
    pourLocation: pourEvents.location,
    pourDescription: pourEvents.description,
    area: sampleSets.area,
    pfuLocation: sampleSets.pfuLocation,
    wallPanelControlNo: sampleSets.wallPanelControlNo,
    structure: sampleSets.structure,
    element: sampleSets.element,
    batchTicketNumber: sampleSets.batchTicketNumber,
  })
    .from(sampleSets)
    .leftJoin(pourEvents, eq(sampleSets.pourEventId, pourEvents.id))
    .limit(5)
  for (const r of pw) {
    console.log(JSON.stringify(r, null, 2))
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
