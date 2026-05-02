import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { pourEvents } from '@/lib/db/schema'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { eq } from 'drizzle-orm'

export async function GET(_: Request, { params }: { params: Promise<{ pourId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pourId } = await params
  const [pour] = await db.select().from(pourEvents).where(eq(pourEvents.id, pourId))
  if (!pour) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(pour)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ pourId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'edit_pour_log')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { pourId } = await params
  const body = await request.json()
  const { date, shift, spec, location, description, supplier, mixId } = body

  const [updated] = await db.update(pourEvents)
    .set({ date, shift, spec, location, description, supplier, mixId, updatedAt: new Date() })
    .where(eq(pourEvents.id, pourId))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(updated)
}
