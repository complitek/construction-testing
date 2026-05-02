import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { sampleSets } from '@/lib/db/schema'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { eq } from 'drizzle-orm'

export async function GET(_: Request, { params }: { params: Promise<{ sampleId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sampleId } = await params
  const [sample] = await db.select().from(sampleSets).where(eq(sampleSets.id, sampleId))
  if (!sample) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(sample)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ sampleId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'enter_break_results')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { sampleId } = await params
  const { temperature, slump, unitWeight, airContent } = await request.json()

  const [updated] = await db.update(sampleSets)
    .set({
      temperature: temperature ?? null,
      slump: slump ?? null,
      unitWeight: unitWeight ?? null,
      airContent: airContent ?? null,
      updatedAt: new Date(),
    })
    .where(eq(sampleSets.id, sampleId))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(updated)
}
