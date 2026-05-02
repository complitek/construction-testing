import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { sampleSets } from '@/lib/db/schema'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { eq } from 'drizzle-orm'

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pourId = new URL(request.url).searchParams.get('pourId')
  if (!pourId) return NextResponse.json({ error: 'pourId required' }, { status: 400 })

  const samples = await db.select().from(sampleSets).where(eq(sampleSets.pourEventId, pourId))
  return NextResponse.json(samples)
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'create_pour_log')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { pourEventId, batchTicketNumber } = await request.json()
  if (!pourEventId || !batchTicketNumber) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const [sample] = await db.insert(sampleSets).values({
    pourEventId, batchTicketNumber, createdBy: userId,
  }).returning()

  return NextResponse.json(sample, { status: 201 })
}
