export type Role =
  | 'admin'
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
  reportFileUrl: string | null
  // Field tests
  temperature: number | null
  slump: string | null
  unitWeight: number | null
  airContent: number | null
  astmC1611Flow: number | null
  wcRatio: number | null
  vsi: number | null
  ambientTemp: number | null
  // Location / placement
  area: string | null
  pfuLocation: string | null
  wallPanelControlNo: string | null
  structure: string | null
  element: string | null
  // Personnel / mix
  sampledBy: string | null
  sampleType: string | null
  quantitySize: string | null
  testedBy: string | null
  sampleIdRange: string | null
  // Volume / lot tracking
  volumeCy: string | null
  totalDailyVol: number | null
  marineConcreteCumulative: number | null
  marineConcreteLoNumber: string | null
  // Acceptance
  requiredCompStrength: number | null
  compliance: string | null
  retested: boolean
  ncrIssued: boolean
  dateSubmittedToGovt: string | null
  comments: string | null
  // Hold tracking
  holdActive: boolean
  holdPlacedDate: string | null
  holdReleasedDate: string | null
  holdBrokenDate: string | null
  holdBrokenBy: string | null
  holdBrokenReason: string | null
  holdRequiredBreakAge: string | null
  holdNotes: string | null
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
