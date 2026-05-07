import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { sampleSets } from '@/lib/db/schema'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { eq } from 'drizzle-orm'
import type { BreakAge } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'

function withBreaks(row: typeof sampleSets.$inferSelect) {
  const breaks: Partial<Record<BreakAge, number>> = {}
  const map: Record<BreakAge, number | null> = {
    '1day': row.break1day, '3day': row.break3day, '4day': row.break4day,
    '5day': row.break5day, '7day': row.break7day, '14day': row.break14day,
    '21day': row.break21day, '28day': row.break28day, '56day': row.break56day,
    '90day': row.break90day, '120day': row.break120day,
  }
  for (const age of BREAK_AGES) {
    if (map[age] != null) breaks[age] = map[age]!
  }
  return { ...row, breaks }
}

function computeCompliance(
  break28day: number | null | undefined,
  break56day: number | null | undefined,
  requiredCompStrength: number | null | undefined,
): string | null {
  if (!requiredCompStrength) return null
  if (break28day != null) {
    return break28day >= requiredCompStrength ? 'YES' : 'NO'
  }
  if (break56day != null) {
    return break56day >= requiredCompStrength ? 'YES' : 'NO'
  }
  return null
}

export async function GET(_: Request, { params }: { params: Promise<{ sampleId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sampleId } = await params
  const [sample] = await db.select().from(sampleSets).where(eq(sampleSets.id, sampleId))
  if (!sample) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(withBreaks(sample))
}

export async function PATCH(request: Request, { params }: { params: Promise<{ sampleId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'enter_break_results')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { sampleId } = await params
  const body = await request.json()

  // If requiredCompStrength is being updated, fetch existing break values to recalculate compliance
  let autoCompliance: string | null = null
  if ('requiredCompStrength' in body && body.requiredCompStrength != null) {
    const [existing] = await db.select().from(sampleSets).where(eq(sampleSets.id, sampleId))
    if (existing) {
      // Recalculate using current break values in DB (this patch doesn't update breaks)
      autoCompliance = computeCompliance(
        existing.break28day,
        existing.break56day,
        body.requiredCompStrength,
      )
    }
  }

  // compliance field: use auto-calculated value when requiredCompStrength changed,
  // otherwise fall back to whatever was explicitly sent in the body (manual override).
  const complianceValue = autoCompliance !== null ? autoCompliance : (body.compliance ?? null)

  const [updated] = await db.update(sampleSets)
    .set({
      // Field tests
      temperature: body.temperature ?? null,
      slump: body.slump ?? null,
      unitWeight: body.unitWeight ?? null,
      airContent: body.airContent ?? null,
      astmC1611Flow: body.astmC1611Flow ?? null,
      wcRatio: body.wcRatio ?? null,
      vsi: body.vsi ?? null,
      ambientTemp: body.ambientTemp ?? null,
      // Location
      area: body.area ?? null,
      pfuLocation: body.pfuLocation ?? null,
      wallPanelControlNo: body.wallPanelControlNo ?? null,
      structure: body.structure ?? null,
      element: body.element ?? null,
      // Personnel
      sampledBy: body.sampledBy ?? null,
      sampleType: body.sampleType ?? null,
      quantitySize: body.quantitySize ?? null,
      testedBy: body.testedBy ?? null,
      sampleIdRange: body.sampleIdRange ?? null,
      // Volume / lot
      volumeCy: body.volumeCy ?? null,
      totalDailyVol: body.totalDailyVol ?? null,
      marineConcreteCumulative: body.marineConcreteCumulative ?? null,
      marineConcreteLoNumber: body.marineConcreteLoNumber ?? null,
      // Acceptance
      requiredCompStrength: body.requiredCompStrength ?? null,
      compliance: complianceValue,
      retested: body.retested ?? false,
      ncrIssued: body.ncrIssued ?? false,
      dateSubmittedToGovt: body.dateSubmittedToGovt ?? null,
      comments: body.comments ?? null,
      // Hold tracking
      ...(body.holdActive           !== undefined ? { holdActive: body.holdActive }                     : {}),
      ...(body.holdPlacedDate       !== undefined ? { holdPlacedDate: body.holdPlacedDate ?? null }     : {}),
      ...(body.holdReleasedDate     !== undefined ? { holdReleasedDate: body.holdReleasedDate ?? null } : {}),
      ...(body.holdBrokenDate       !== undefined ? { holdBrokenDate: body.holdBrokenDate ?? null }     : {}),
      ...(body.holdBrokenBy         !== undefined ? { holdBrokenBy: body.holdBrokenBy ?? null }         : {}),
      ...(body.holdBrokenReason     !== undefined ? { holdBrokenReason: body.holdBrokenReason ?? null } : {}),
      ...(body.holdRequiredBreakAge !== undefined ? { holdRequiredBreakAge: body.holdRequiredBreakAge ?? null } : {}),
      ...(body.holdNotes            !== undefined ? { holdNotes: body.holdNotes ?? null }               : {}),
      // Break results (patched by age key e.g. { '28day': 4500 })
      ...(body['1day']   !== undefined ? { break1day:   body['1day']   } : {}),
      ...(body['3day']   !== undefined ? { break3day:   body['3day']   } : {}),
      ...(body['4day']   !== undefined ? { break4day:   body['4day']   } : {}),
      ...(body['5day']   !== undefined ? { break5day:   body['5day']   } : {}),
      ...(body['7day']   !== undefined ? { break7day:   body['7day']   } : {}),
      ...(body['14day']  !== undefined ? { break14day:  body['14day']  } : {}),
      ...(body['21day']  !== undefined ? { break21day:  body['21day']  } : {}),
      ...(body['28day']  !== undefined ? { break28day:  body['28day']  } : {}),
      ...(body['56day']  !== undefined ? { break56day:  body['56day']  } : {}),
      ...(body['90day']  !== undefined ? { break90day:  body['90day']  } : {}),
      ...(body['120day'] !== undefined ? { break120day: body['120day'] } : {}),
      updatedAt: new Date(),
    })
    .where(eq(sampleSets.id, sampleId))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(withBreaks(updated))
}
