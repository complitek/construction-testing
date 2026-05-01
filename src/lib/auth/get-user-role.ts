import { auth, currentUser } from '@clerk/nextjs/server'
import type { Role } from '@/lib/types'

export async function getUserRole(): Promise<Role | null> {
  const { userId } = await auth()
  if (!userId) return null
  const user = await currentUser()
  return (user?.publicMetadata?.role as Role) ?? null
}

export async function requireRole(): Promise<Role> {
  const role = await getUserRole()
  if (!role) throw new Error('Unauthorized')
  return role
}
