import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { ticketRecords, sampleSets } from '@/lib/db/schema'
import { isNull, inArray, not, or } from 'drizzle-orm'

export async function DELETE(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { mode } = await request.json() as { mode: 'all' | 'unmatched' | 'no_number' }

  if (mode === 'all') {
    // Clear ticketFileUrl on all sample sets
    await db.update(sampleSets).set({ ticketFileUrl: null, matchStatus: 'unmatched', updatedAt: new Date() })
    // Delete all ticket records
    await db.delete(ticketRecords)
    return NextResponse.json({ success: true, mode: 'all' })
  }

  if (mode === 'unmatched') {
    // Collect sampleSetIds that are confirmed matched
    const matchedRows = await db
      .select({ id: sampleSets.id })
      .from(sampleSets)
      .where(inArray(sampleSets.matchStatus, ['auto_matched', 'manually_confirmed']))

    const matchedIds = matchedRows.map(r => r.id)

    // Delete tickets with no sampleSetId OR whose linked sample is not matched
    // If nothing is matched yet, do nothing (avoids wiping everything on a fresh install)
    if (matchedIds.length > 0) {
      await db.delete(ticketRecords).where(
        or(
          isNull(ticketRecords.sampleSetId),
          not(inArray(ticketRecords.sampleSetId, matchedIds))
        )
      )
    } else {
      await db.delete(ticketRecords).where(isNull(ticketRecords.sampleSetId))
    }

    return NextResponse.json({ success: true, mode: 'unmatched' })
  }

  if (mode === 'no_number') {
    await db.delete(ticketRecords).where(isNull(ticketRecords.batchTicketNumber))
    return NextResponse.json({ success: true, mode: 'no_number' })
  }

  return NextResponse.json({ error: 'mode must be "all", "unmatched", or "no_number"' }, { status: 400 })
}
