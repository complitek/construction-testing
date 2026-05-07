import Link from 'next/link'
import { db } from '@/lib/db'
import { pourEvents, sampleSets } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { calculateBreakDate } from '@/lib/utils/break-dates'
import type { BreakAge } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'
import BreakScheduleClient, { type BreakRow } from './BreakScheduleClient'

const BREAK_COLUMN_MAP: Record<BreakAge, keyof typeof sampleSets.$inferSelect> = {
  '1day':   'break1day',   '3day':   'break3day',   '4day':   'break4day',
  '5day':   'break5day',   '7day':   'break7day',   '14day':  'break14day',
  '21day':  'break21day',  '28day':  'break28day',  '56day':  'break56day',
  '90day':  'break90day',  '120day': 'break120day',
}

function getStatus(dueDate: string, todayMs: number): BreakRow['status'] | null {
  const dueMs = new Date(dueDate + 'T00:00:00Z').getTime()
  const diffDays = Math.floor((dueMs - todayMs) / 86_400_000)
  if (diffDays < -7) return null           // older than 1 week ago — exclude
  if (diffDays < 0)  return 'overdue'
  if (diffDays <= 6) return 'urgent'
  if (diffDays <= 29) return 'upcoming'
  return 'future'
}

export default async function BreaksPage() {
  const now  = new Date()
  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())

  const joined = await db
    .select()
    .from(sampleSets)
    .innerJoin(pourEvents, eq(sampleSets.pourEventId, pourEvents.id))

  const rows: BreakRow[] = []

  for (const { pour_events: p, sample_sets: s } of joined) {
    for (const age of BREAK_AGES) {
      const resultValue = s[BREAK_COLUMN_MAP[age]] as number | null | undefined
      if (resultValue != null) continue  // already recorded — skip

      const dueDate = calculateBreakDate(p.date, age)
      const status  = getStatus(dueDate, todayMs)
      if (!status) continue              // outside the date window — skip

      rows.push({
        sampleId: s.id,
        batchTicketNumber: s.batchTicketNumber,
        pourDate: p.date,
        location: p.location,
        age,
        dueDate,
        status,
      })
    }
  }

  // Sort by due date ascending so months render in order
  rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-blue-600">Construction Testing</Link>
        <span>›</span>
        <Link href="/concrete" className="hover:text-blue-600">Concrete</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Break Schedule</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Break Schedule</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            {rows.length === 0
              ? 'No pending breaks'
              : `${rows.length} pending break${rows.length === 1 ? '' : 's'}`}
          </span>
          <Link
            href="/breaks/enter"
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            Enter Break Results
          </Link>
        </div>
      </div>

      <BreakScheduleClient rows={rows} totalCount={rows.length} />
    </div>
  )
}
