import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { appSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { FieldMapping } from '@/lib/excel/analyze-template'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = await getUserRole()
  if (!role || !hasPermission(role, 'manage_templates')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, 'excel_template_mapping'))
  return NextResponse.json({ mapping: setting ? JSON.parse(setting.value) as FieldMapping : {} })
}

export async function PATCH(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = await getUserRole()
  if (!role || !hasPermission(role, 'manage_templates')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { field, sheet, cell } = await request.json() as { field: string; sheet: string; cell: string }

  const [existing] = await db.select().from(appSettings).where(eq(appSettings.key, 'excel_template_mapping'))
  const current: FieldMapping = existing ? JSON.parse(existing.value) as FieldMapping : {}

  if (cell.trim() === '') {
    // Empty cell = remove this field from mapping
    delete current[field as keyof FieldMapping]
  } else {
    (current as Record<string, { sheet: string; cell: string }>)[field] = { sheet, cell: cell.toUpperCase().trim() }
  }

  await db.insert(appSettings)
    .values({ key: 'excel_template_mapping', value: JSON.stringify(current), updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify(current), updatedAt: new Date() } })

  return NextResponse.json({ mapping: current, fieldCount: Object.keys(current).length })
}
