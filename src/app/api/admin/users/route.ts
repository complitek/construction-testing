import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import type { Role } from '@/lib/types'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = await getUserRole()
  if (!role || !hasPermission(role, 'manage_users')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const allUsers = await db.select().from(users)
  return NextResponse.json(allUsers)
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = await getUserRole()
  if (!role || !hasPermission(role, 'manage_users')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, name, newRole, password } = await request.json() as {
    email: string; name: string; newRole: Role; password: string
  }

  const client = await clerkClient()
  const clerkUser = await client.users.createUser({
    emailAddress: [email],
    password,
    firstName: name.split(' ')[0],
    lastName: name.split(' ').slice(1).join(' '),
    publicMetadata: { role: newRole },
  })

  try {
    const [dbUser] = await db.insert(users).values({
      id: crypto.randomUUID(),
      clerkId: clerkUser.id,
      role: newRole,
      name,
      email,
    }).returning()
    return NextResponse.json(dbUser, { status: 201 })
  } catch (err) {
    await client.users.deleteUser(clerkUser.id)
    console.error('DB insert failed after Clerk user creation, rolled back:', err)
    return NextResponse.json({ error: 'User creation failed — please try again.' }, { status: 500 })
  }
}
