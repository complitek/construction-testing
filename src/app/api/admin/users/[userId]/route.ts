import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { Role } from '@/lib/types'

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId: authUserId } = await auth()
  if (!authUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = await getUserRole()
  if (!role || !hasPermission(role, 'manage_users')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId } = await params
  const { newRole } = await request.json() as { newRole: Role }

  const [dbUser] = await db.select().from(users).where(eq(users.id, userId))
  if (!dbUser) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const client = await clerkClient()
  await client.users.updateUserMetadata(dbUser.clerkId, { publicMetadata: { role: newRole } })
  const [updated] = await db.update(users).set({ role: newRole }).where(eq(users.id, userId)).returning()

  return NextResponse.json(updated)
}
