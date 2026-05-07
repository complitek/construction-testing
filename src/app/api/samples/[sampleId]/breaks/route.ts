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

function computeCompliance(
  break28day: number | null | undefined,
  break56day: number | null | undefined,
  requiredCompStrength: number | null | undefined,
): string | null {
  if (!requiredCompStrength) return null

  // 28-day takes priority
  if (break28day != null) {
    return break28day >= requiredCompStrength ? 'YES' : 'NO'
  }

  // 56-day late strength gain: only applies when 28-day not yet set
  if (break56day != null) {
    return break56day >= requiredCompStrength ? 'YES' : 'NO'
  }

  return null
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

  const patching28day = '28day' in body
  const patching56day = '56day' in body

  // Fetch current record so we can merge for compliance calculation
  const [existing] = await db.select().from(sampleSets).where(eq(sampleSets.id, sampleId))
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updates: Record<string, unknown> = { updatedAt: new Date() }

  // Map age keys to DB columns
  for (const [age, psi] of Object.entries(body)) {
    const col = BREAK_COLUMN_MAP[age as BreakAge]
    if (col) updates[col] = psi
  }

  // Determine effective break values after this patch
  const effective28day = patching28day ? (body['28day'] ?? null) : existing.break28day
  const effective56day = patching56day ? (body['56day'] ?? null) : existing.break56day

  // Auto-calculate compliance when 28-day or 56-day is being patched
  if (patching28day || patching56day) {
    const newCompliance = computeCompliance(effective28day, effective56day, existing.requiredCompStrength)
    if (newCompliance !== null) {
      updates.compliance = newCompliance
    }
  }

  // Auto-update reportStatus: set to ready_to_export if 28-day is now present
  // and status is not already 'exported'
  if (effective28day != null && existing.reportStatus !== 'exported') {
    updates.reportStatus = 'ready_to_export'
  }

  const [updated] = await db.update(sampleSets)
    .set(updates as any)
    .where(eq(sampleSets.id, sampleId))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(updated)
}
