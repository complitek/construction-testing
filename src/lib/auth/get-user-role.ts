import { currentUser } from '@clerk/nextjs/server'
import type { Role } from '@/lib/types'
import { VALID_ROLES } from '@/lib/auth/permissions'

export async function getUserRole(): Promise<Role | null> {
  const user = await currentUser()
  if (!user) return null
  const raw = user.publicMetadata?.role
  if (!raw || !VALID_ROLES.includes(raw as Role)) return null
  return raw as Role
}

export async function requireRole(): Promise<Role> {
  const role = await getUserRole()
  if (!role) throw new Error('Unauthorized')
  return role
}
