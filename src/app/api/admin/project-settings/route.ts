import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { appSettings } from '@/lib/db/schema'
import { inArray } from 'drizzle-orm'

const SETTING_KEYS = [
  'project_name',
  'project_location',
  'company_name',
  'contract_number',
  'report_prepared_by',
  'brand_color',
] as const

type SettingKey = typeof SETTING_KEYS[number]

async function checkAuth() {
  const { userId } = await auth()
  if (!userId) return null
  const role = await getUserRole()
  if (!role || !hasPermission(role, 'manage_templates')) return null
  return role
}

export async function GET() {
  const role = await checkAuth()
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db.select().from(appSettings)
    .where(inArray(appSettings.key, [...SETTING_KEYS]))

  const map = Object.fromEntries(rows.map(r => [r.key, r.value])) as Record<string, string>

  return NextResponse.json({
    projectName:       map['project_name']       ?? null,
    projectLocation:   map['project_location']   ?? null,
    companyName:       map['company_name']        ?? null,
    contractNumber:    map['contract_number']     ?? null,
    reportPreparedBy:  map['report_prepared_by']  ?? null,
    brandColor:        map['brand_color']         ?? null,
  })
}

export async function POST(request: Request) {
  const role = await checkAuth()
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    projectName?: string | null
    projectLocation?: string | null
    companyName?: string | null
    contractNumber?: string | null
    reportPreparedBy?: string | null
    brandColor?: string | null
  }

  const pairs: Array<{ key: SettingKey; value: string }> = [
    { key: 'project_name',       value: body.projectName      ?? '' },
    { key: 'project_location',   value: body.projectLocation  ?? '' },
    { key: 'company_name',       value: body.companyName       ?? '' },
    { key: 'contract_number',    value: body.contractNumber    ?? '' },
    { key: 'report_prepared_by', value: body.reportPreparedBy ?? '' },
    { key: 'brand_color',        value: body.brandColor        ?? '' },
  ]

  for (const { key, value } of pairs) {
    await db.insert(appSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } })
  }

  return NextResponse.json({ success: true })
}
