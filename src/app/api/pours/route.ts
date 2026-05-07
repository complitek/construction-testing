import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { pourEvents } from '@/lib/db/schema'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { desc } from 'drizzle-orm'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pours = await db.select().from(pourEvents).orderBy(desc(pourEvents.date))
  return NextResponse.json(pours)
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'create_pour_log')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { date, shift, spec, location, description, supplier, mixId, definableFeature } = body

  if (!date || !shift || !spec || !location || !description || !supplier || !mixId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const [pour] = await db.insert(pourEvents).values({
    date, shift, spec, location, description, supplier, mixId,
    definableFeature: definableFeature ?? null,
    createdBy: userId,
  }).returning()

  return NextResponse.json(pour, { status: 201 })
}
