import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { appSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = await getUserRole()
  if (!role || !hasPermission(role, 'manage_users')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

  if (!process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN === 'vercel_blob_replace_me') {
    return NextResponse.json({ error: 'File storage is not configured yet. Set up Vercel Blob to enable uploads.' }, { status: 503 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const blob = await put(`master-log/${Date.now()}-${file.name}`, bytes, {
    access: 'private',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const uploadedAt = new Date().toISOString()
  const meta = JSON.stringify({ url: blob.url, fileName: file.name, uploadedAt })

  await db.insert(appSettings)
    .values({ key: 'master_log_url', value: meta, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: meta, updatedAt: new Date() } })

  return NextResponse.json({ url: blob.url, fileName: file.name, uploadedAt })
}

export async function DELETE() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = await getUserRole()
  if (!role || !hasPermission(role, 'manage_users')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  await db.delete(appSettings).where(eq(appSettings.key, 'master_log_url'))
  return NextResponse.json({ success: true })
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [setting] = await db.select().from(appSettings)
    .where(eq(appSettings.key, 'master_log_url'))
  if (!setting) return NextResponse.json({ url: null, fileName: null, uploadedAt: null })
  try {
    const meta = JSON.parse(setting.value)
    return NextResponse.json(meta)
  } catch {
    return NextResponse.json({ url: setting.value, fileName: null, uploadedAt: null })
  }
}
