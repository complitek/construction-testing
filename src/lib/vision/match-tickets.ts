import type { ExtractedTicketData, MatchStatus } from '@/lib/types'

interface TicketInput {
  extractedData: ExtractedTicketData
  pageStart: number
  pageEnd: number
}

export interface MatchResult {
  pageStart: number
  pageEnd: number
  extractedData: ExtractedTicketData
  matchedSampleSetId: string | null
  matchStatus: MatchStatus
}

export function matchTicketsToSampleSets(
  tickets: TicketInput[],
  sampleSets: Array<{ id: string; batchTicketNumber: string }>
): MatchResult[] {
  return tickets.map(({ extractedData, pageStart, pageEnd }) => {
    const { batchTicketNumber, confidence } = extractedData

    if (!batchTicketNumber) {
      return { pageStart, pageEnd, extractedData, matchedSampleSetId: null, matchStatus: 'flagged' }
    }

    const matched = sampleSets.find(
      s => s.batchTicketNumber.trim().toLowerCase() === batchTicketNumber.trim().toLowerCase()
    )

    if (!matched) {
      return { pageStart, pageEnd, extractedData, matchedSampleSetId: null, matchStatus: 'unmatched' }
    }

    const matchStatus: MatchStatus = confidence === 'low' ? 'flagged' : 'auto_matched'
    return { pageStart, pageEnd, extractedData, matchedSampleSetId: matched.id, matchStatus }
  })
}
