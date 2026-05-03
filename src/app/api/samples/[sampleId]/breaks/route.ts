import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { sampleSets } from '@/lib/db/schema'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { eq } from 'drizzle-orm'
import type { BreakAge } from '@/lib/types'

const BREAK_COLUMN_MAP: Record<BreakAge, string> = {
  '1day': 'break1day', '3day': 'break3day', '4day': 'break4day',
  '5day': 'break5day', '7day': 'break7day', '14day': 'break14day',
  '21day': 'break21day', '28day': 'break28day', '56day': 'break56day', '90day': 'break90day',
  '120day': 'break120day',
}

export async function PATCH(request: Request, { params }: { params: Promise<{ sampleId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'enter_break_results')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { sampleId } = await params
  const body = await request.json() as Partial<Record<BreakAge, number>>

  const updates: Record<string, unknown> = { updatedAt: new Date(), reportStatus: 'ready_to_export' }
  for (const [age, psi] of Object.entries(body)) {
    const col = BREAK_COLUMN_MAP[age as BreakAge]
    if (col) updates[col] = psi
  }

  const [updated] = await db.update(sampleSets)
    .set(updates as any)
    .where(eq(sampleSets.id, sampleId))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(updated)
}
