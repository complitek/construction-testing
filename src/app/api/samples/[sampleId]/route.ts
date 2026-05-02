import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { sampleSets } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(_: Request, { params }: { params: Promise<{ sampleId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sampleId } = await params
  const [sample] = await db.select().from(sampleSets).where(eq(sampleSets.id, sampleId))
  if (!sample) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(sample)
}
