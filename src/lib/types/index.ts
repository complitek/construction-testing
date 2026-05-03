export type Role =
  | 'lab_tech'
  | 'lab_manager'
  | 'office_manager'
  | 'field_tech'
  | 'concrete_qc_manager'
  | 'qc_manager'
  | 'alt_qc_manager'

export type Shift = 'day' | 'night'

export type MatchStatus =
  | 'auto_matched'
  | 'manually_confirmed'
  | 'flagged'
  | 'unmatched'

export type ReportStatus =
  | 'pending_breaks'
  | 'ready_to_export'
  | 'exported'

export type ProcessingStatus = 'pending' | 'processing' | 'complete' | 'failed'

export type BreakAge =
  | '1day' | '3day' | '4day' | '5day' | '7day'
  | '14day' | '21day' | '28day' | '56day' | '90day' | '120day'

export type BreakResults = Partial<Record<BreakAge, number>>

export const BREAK_AGES: BreakAge[] = [
  '1day', '3day', '4day', '5day', '7day',
  '14day', '21day', '28day', '56day', '90day', '120day',
]

export interface PourEvent {
  id: string
  date: string
  shift: Shift
  spec: string
  location: string
  description: string
  supplier: string
  mixId: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface SampleSet {
  id: string
  pourEventId: string
  batchTicketNumber: string
  ticketFileUrl: string | null
  matchStatus: MatchStatus
  breaks: BreakResults
  reportStatus: ReportStatus
  temperature: number | null
  slump: string | null
  unitWeight: number | null
  airContent: number | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface TicketRecord {
  id: string
  pourEventId: string
  batchTicketNumber: string | null
  pageStart: number
  pageEnd: number
  fileUrl: string
  sampleSetId: string | null
  createdAt: string
}

export interface ExtractedTicketData {
  batchTicketNumber: string | null
  date: string | null
  supplier: string | null
  mixId: string | null
  confidence: 'high' | 'medium' | 'low'
}

export interface AppUser {
  id: string
  clerkId: string
  role: Role
  name: string
  email: string
  createdAt: string
}
