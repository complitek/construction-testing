import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { ticketRecords, sampleSets } from '@/lib/db/schema'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { eq } from 'drizzle-orm'

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'confirm_ticket_match')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { ticketId } = await params
  const { sampleSetId, action } = await request.json()

  const [record] = await db.select().from(ticketRecords).where(eq(ticketRecords.id, ticketId))
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'confirm' && sampleSetId) {
    await db.update(ticketRecords).set({ sampleSetId }).where(eq(ticketRecords.id, ticketId))
    await db.update(sampleSets)
      .set({ ticketFileUrl: record.fileUrl, matchStatus: 'manually_confirmed', updatedAt: new Date() })
      .where(eq(sampleSets.id, sampleSetId))
  } else if (action === 'reject') {
    await db.update(ticketRecords).set({ sampleSetId: null }).where(eq(ticketRecords.id, ticketId))
  }

  return NextResponse.json({ success: true })
}
