import { describe, it, expect } from 'vitest'
import { matchTicketsToSampleSets } from '@/lib/vision/match-tickets'
import type { ExtractedTicketData } from '@/lib/types'

const sampleSets = [
  { id: 'ss-1', batchTicketNumber: '12345' },
  { id: 'ss-2', batchTicketNumber: '12346' },
]

describe('matchTicketsToSampleSets', () => {
  it('auto-matches a high-confidence ticket with exact number', () => {
    const extracted: ExtractedTicketData = {
      batchTicketNumber: '12345', date: null, supplier: null, mixId: null, confidence: 'high',
    }
    const results = matchTicketsToSampleSets([{ extractedData: extracted, pageStart: 0, pageEnd: 0 }], sampleSets)
    expect(results[0].matchedSampleSetId).toBe('ss-1')
    expect(results[0].matchStatus).toBe('auto_matched')
  })

  it('flags a low-confidence match', () => {
    const extracted: ExtractedTicketData = {
      batchTicketNumber: '12345', date: null, supplier: null, mixId: null, confidence: 'low',
    }
    const results = matchTicketsToSampleSets([{ extractedData: extracted, pageStart: 0, pageEnd: 0 }], sampleSets)
    expect(results[0].matchedSampleSetId).toBe('ss-1')
    expect(results[0].matchStatus).toBe('flagged')
  })

  it('marks unmatched when ticket number not in sample sets', () => {
    const extracted: ExtractedTicketData = {
      batchTicketNumber: '99999', date: null, supplier: null, mixId: null, confidence: 'high',
    }
    const results = matchTicketsToSampleSets([{ extractedData: extracted, pageStart: 0, pageEnd: 0 }], sampleSets)
    expect(results[0].matchedSampleSetId).toBe(null)
    expect(results[0].matchStatus).toBe('unmatched')
  })

  it('flags when ticket number is null', () => {
    const extracted: ExtractedTicketData = {
      batchTicketNumber: null, date: null, supplier: null, mixId: null, confidence: 'low',
    }
    const results = matchTicketsToSampleSets([{ extractedData: extracted, pageStart: 0, pageEnd: 0 }], sampleSets)
    expect(results[0].matchedSampleSetId).toBe(null)
    expect(results[0].matchStatus).toBe('flagged')
  })
})
