import type { BreakAge } from '@/lib/types'

const BREAK_AGE_DAYS: Record<BreakAge, number> = {
  '1day': 1, '3day': 3, '4day': 4, '5day': 5, '7day': 7,
  '14day': 14, '21day': 21, '28day': 28, '56day': 56, '90day': 90, '120day': 120,
}

export function calculateBreakDate(placementDate: string, age: BreakAge): string {
  const date = new Date(placementDate + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + BREAK_AGE_DAYS[age])
  return date.toISOString().split('T')[0]
}

export function calculateAllBreakDates(placementDate: string): Record<BreakAge, string> {
  return Object.fromEntries(
    (Object.keys(BREAK_AGE_DAYS) as BreakAge[]).map(age => [
      age, calculateBreakDate(placementDate, age),
    ])
  ) as Record<BreakAge, string>
}
