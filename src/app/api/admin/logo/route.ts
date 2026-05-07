import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { appSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

async function checkAuth() {
  const { userId } = await auth()
  if (!userId) return null
  const role = await getUserRole()
  if (!role || !hasPermission(role, 'manage_templates')) return null
  return role
}

const MAX_BYTES = 1_500_000 // 1.5 MB — base64 inflates ~33 %, keeps DB row small.

export async function GET() {
  const role = await checkAuth()
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, 'logo_url'))
  return NextResponse.json({ url: row?.value ?? null })
}

export async function POST(request: Request) {
  const role = await checkAuth()
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `Logo too large (${(file.size / 1024).toFixed(0)} KB). Max 1.5 MB.` }, { status: 413 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: `File must be an image, got ${file.type || 'unknown'}.` }, { status: 400 })
  }

  // Store the logo inline as a data URL — keeps it accessible from both <img> tags
  // and @react-pdf/renderer with no Blob proxy / auth dance.
  const buf = Buffer.from(await file.arrayBuffer())
  const dataUrl = `data:${file.type};base64,${buf.toString('base64')}`

  await db.insert(appSettings)
    .values({ key: 'logo_url', value: dataUrl, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: dataUrl, updatedAt: new Date() } })

  return NextResponse.json({ url: dataUrl })
}

export async function DELETE() {
  const role = await checkAuth()
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await db.delete(appSettings).where(eq(appSettings.key, 'logo_url'))
  return NextResponse.json({ success: true })
}
