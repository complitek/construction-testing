import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { pourEvents, summaryRecords, users } from '@/lib/db/schema'
import { importMasterLog } from '@/lib/import/master-log'

export const maxDuration = 300

async function requireAdmin() {
  const { userId } = await auth()
  if (!userId) return false
  const role = await getUserRole()
  return role && hasPermission(role, 'manage_users')
}

export async function POST(request: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

  const [anyUser] = await db.select().from(users).limit(1)
  if (!anyUser) return NextResponse.json({ error: 'No users in database — log in first' }, { status: 500 })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await importMasterLog(buffer, anyUser.id)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Import failed' }, { status: 400 })
  }
}

export async function DELETE() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await db.delete(pourEvents)
  await db.delete(summaryRecords)
  return NextResponse.json({ success: true })
}
