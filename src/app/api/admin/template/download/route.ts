import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { appSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'manage_templates')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [urlSetting] = await db.select().from(appSettings).where(eq(appSettings.key, 'excel_template_url'))
  const [nameSetting] = await db.select().from(appSettings).where(eq(appSettings.key, 'excel_template_name'))

  if (!urlSetting) return NextResponse.json({ error: 'No template uploaded' }, { status: 404 })

  const res = await fetch(urlSetting.value, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  })

  if (!res.ok) return NextResponse.json({ error: 'Template not accessible' }, { status: 502 })

  const bytes = await res.arrayBuffer()
  const fileName = nameSetting?.value ?? 'compression-report-template.xlsx'

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
