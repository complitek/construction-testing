import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { ticketRecords } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pourId = new URL(request.url).searchParams.get('pourId')
  if (!pourId) return NextResponse.json({ error: 'pourId required' }, { status: 400 })

  const records = await db.select().from(ticketRecords).where(eq(ticketRecords.pourEventId, pourId))
  return NextResponse.json(records)
}
