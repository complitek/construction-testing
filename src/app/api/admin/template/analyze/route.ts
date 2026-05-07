import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { appSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { analyzeTemplateMapping } from '@/lib/excel/analyze-template'

export const maxDuration = 60

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = await getUserRole()
  if (!role || !hasPermission(role, 'manage_templates')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [urlSetting] = await db.select().from(appSettings).where(eq(appSettings.key, 'excel_template_url'))
  if (!urlSetting) return NextResponse.json({ error: 'No template uploaded yet' }, { status: 404 })

  const res = await fetch(urlSetting.value, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  })
  if (!res.ok) return NextResponse.json({ error: 'Could not fetch template from storage' }, { status: 502 })

  const bytes = Buffer.from(await res.arrayBuffer())
  const mapping = await analyzeTemplateMapping(bytes)
  const fieldCount = Object.keys(mapping).length

  await db.insert(appSettings)
    .values({ key: 'excel_template_mapping', value: JSON.stringify(mapping), updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify(mapping), updatedAt: new Date() } })

  return NextResponse.json({ mapping, fieldCount })
}
