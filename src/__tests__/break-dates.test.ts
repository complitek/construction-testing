import { describe, it, expect } from 'vitest'
import { calculateBreakDate, calculateAllBreakDates } from '@/lib/utils/break-dates'

describe('calculateBreakDate', () => {
  it('adds 7 days to placement date', () => {
    expect(calculateBreakDate('2026-05-01', '7day')).toBe('2026-05-08')
  })
  it('adds 28 days to placement date', () => {
    expect(calculateBreakDate('2026-05-01', '28day')).toBe('2026-05-29')
  })
  it('adds 1 day to placement date', () => {
    expect(calculateBreakDate('2026-05-01', '1day')).toBe('2026-05-02')
  })
  it('handles month boundary', () => {
    expect(calculateBreakDate('2026-05-30', '7day')).toBe('2026-06-06')
  })
})

describe('calculateAllBreakDates', () => {
  it('returns a date for all 10 break ages', () => {
    const result = calculateAllBreakDates('2026-05-01')
    expect(Object.keys(result)).toHaveLength(10)
    expect(result['28day']).toBe('2026-05-29')
  })
})
