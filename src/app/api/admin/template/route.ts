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
  if (!role || !hasPermission(role, 'manage_templates')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

  if (!process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN === 'vercel_blob_replace_me') {
    return NextResponse.json({ error: 'File storage is not configured yet.' }, { status: 503 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'xlsx'
  const blobName = `templates/compression-report-${Date.now()}.${ext}`
  const blob = await put(blobName, file, { access: 'private' })

  await db.insert(appSettings)
    .values({ key: 'excel_template_url', value: blob.url, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: blob.url, updatedAt: new Date() } })

  await db.insert(appSettings)
    .values({ key: 'excel_template_name', value: file.name, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: file.name, updatedAt: new Date() } })

  return NextResponse.json({ url: blob.url, fileName: file.name })
}

export async function DELETE() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = await getUserRole()
  if (!role || !hasPermission(role, 'manage_templates')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.delete(appSettings).where(eq(appSettings.key, 'excel_template_url'))
  await db.delete(appSettings).where(eq(appSettings.key, 'excel_template_name'))
  await db.delete(appSettings).where(eq(appSettings.key, 'excel_template_mapping'))

  return NextResponse.json({ success: true })
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = await getUserRole()
  if (!role || !hasPermission(role, 'manage_templates')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [urlSetting] = await db.select().from(appSettings).where(eq(appSettings.key, 'excel_template_url'))
  const [nameSetting] = await db.select().from(appSettings).where(eq(appSettings.key, 'excel_template_name'))
  const [mappingSetting] = await db.select().from(appSettings).where(eq(appSettings.key, 'excel_template_mapping'))
  const mappedFields = mappingSetting ? Object.keys(JSON.parse(mappingSetting.value)).length : null
  return NextResponse.json({ url: urlSetting?.value ?? null, fileName: nameSetting?.value ?? null, mappedFields })
}
