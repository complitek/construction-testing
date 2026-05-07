import {
  pgTable, pgEnum, text, integer, real, timestamp, date, boolean
} from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('role', [
  'admin',
  'lab_tech', 'lab_manager', 'office_manager', 'field_tech',
  'concrete_qc_manager', 'qc_manager', 'alt_qc_manager',
])
export const shiftEnum = pgEnum('shift', ['day', 'night'])
export const matchStatusEnum = pgEnum('match_status', [
  'auto_matched', 'manually_confirmed', 'flagged', 'unmatched',
])
export const reportStatusEnum = pgEnum('report_status', [
  'pending_breaks', 'ready_to_export', 'exported',
])
export const processingStatusEnum = pgEnum('processing_status', [
  'pending', 'processing', 'complete', 'failed',
])

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  clerkId: text('clerk_id').notNull().unique(),
  role: roleEnum('role').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const pourEvents = pgTable('pour_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  date: date('date').notNull(),
  shift: shiftEnum('shift').notNull(),
  spec: text('spec').notNull(),
  location: text('location').notNull(),
  description: text('description').notNull(),
  supplier: text('supplier').notNull(),
  mixId: text('mix_id').notNull(),
  definableFeature: text('definable_feature'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const sampleSets = pgTable('sample_sets', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  pourEventId: text('pour_event_id').notNull().references(() => pourEvents.id, { onDelete: 'cascade' }),
  batchTicketNumber: text('batch_ticket_number').notNull(),
  ticketFileUrl: text('ticket_file_url'),
  matchStatus: matchStatusEnum('match_status').default('unmatched').notNull(),
  // Break results (psi per age)
  break1day: integer('break_1day'),
  break3day: integer('break_3day'),
  break4day: integer('break_4day'),
  break5day: integer('break_5day'),
  break7day: integer('break_7day'),
  break14day: integer('break_14day'),
  break21day: integer('break_21day'),
  break28day: integer('break_28day'),
  break56day: integer('break_56day'),
  break90day: integer('break_90day'),
  break120day: integer('break_120day'),
  reportStatus: reportStatusEnum('report_status').default('pending_breaks').notNull(),
  reportFileUrl: text('report_file_url'),
  // Field tests (existing)
  temperature: integer('temperature'),
  slump: text('slump'),
  unitWeight: real('unit_weight'),
  airContent: real('air_content'),
  // Field tests — additional (from Compressive Strength sheet)
  astmC1611Flow: real('astm_c1611_flow'),
  wcRatio: real('wc_ratio'),
  vsi: integer('vsi'),
  ambientTemp: real('ambient_temp'),
  // Location / placement details
  area: text('area'),
  pfuLocation: text('pfu_location'),
  wallPanelControlNo: text('wall_panel_control_no'),
  structure: text('structure'),
  element: text('element'),
  // Personnel / mix
  sampledBy: text('sampled_by'),
  sampleType: text('sample_type'),
  quantitySize: text('quantity_size'),
  testedBy: text('tested_by'),
  sampleIdRange: text('sample_id_range'),
  // Volume / marine lot tracking
  volumeCy: text('volume_cy'),
  totalDailyVol: real('total_daily_vol'),
  marineConcreteCumulative: real('marine_concrete_cumulative'),
  marineConcreteLoNumber: text('marine_concrete_lot_number_cyl'),
  // Acceptance / compliance
  requiredCompStrength: integer('required_comp_strength'),
  compliance: text('compliance'),
  retested: boolean('retested').default(false),
  ncrIssued: boolean('ncr_issued').default(false),
  dateSubmittedToGovt: date('date_submitted_to_govt'),
  comments: text('comments'),
  // Hold tracking
  holdActive: boolean('hold_active').default(false),
  holdPlacedDate: date('hold_placed_date'),
  holdReleasedDate: date('hold_released_date'),
  holdBrokenDate: date('hold_broken_date'),
  holdBrokenBy: text('hold_broken_by'),
  holdBrokenReason: text('hold_broken_reason'),
  holdRequiredBreakAge: text('hold_required_break_age'),
  holdNotes: text('hold_notes'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const ticketRecords = pgTable('ticket_records', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  pourEventId: text('pour_event_id').references(() => pourEvents.id, { onDelete: 'cascade' }),
  batchTicketNumber: text('batch_ticket_number'),
  ticketDate: date('ticket_date'),
  pageStart: integer('page_start').notNull(),
  pageEnd: integer('page_end').notNull(),
  fileUrl: text('file_url').notNull(),
  sampleSetId: text('sample_set_id').references(() => sampleSets.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const ticketUploads = pgTable('ticket_uploads', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  pourEventId: text('pour_event_id').notNull().references(() => pourEvents.id, { onDelete: 'cascade' }),
  originalFileUrl: text('original_file_url').notNull(),
  processingStatus: processingStatusEnum('processing_status').default('pending').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const summaryRecords = pgTable('summary_records', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  shiftDate: date('shift_date').notNull(),
  locationDescription: text('location_description'),
  dfow: text('dfow'),
  spec: text('spec'),
  area: text('area'),
  structure: text('structure'),
  element: text('element'),
  supplier: text('supplier'),
  mixId: text('mix_id'),
  batchTicketNumber: text('batch_ticket_number'),
  sampledBy: text('sampled_by'),
  slump: text('slump'),
  flow: real('flow'),
  airContent: real('air_content'),
  temperature: integer('temperature'),
  unitWeight: real('unit_weight'),
  break1day:   integer('break_1day'),
  break2day:   integer('break_2day'),
  break3day:   integer('break_3day'),
  break4day:   integer('break_4day'),
  break7day:   integer('break_7day'),
  break10day:  integer('break_10day'),
  break14day:  integer('break_14day'),
  break28day:  integer('break_28day'),
  break56day:  integer('break_56day'),
  break90day:  integer('break_90day'),
  break120day: integer('break_120day'),
  break150day: integer('break_150day'),
  requiredStrength: integer('required_strength'),
  c1202_1: text('c1202_1'),
  c1202_2: text('c1202_2'),
  c1202_3: text('c1202_3'),
  c1202_4: text('c1202_4'),
  c1202_5: text('c1202_5'),
  complianceStrength: text('compliance_strength'),
  complianceDurability: text('compliance_durability'),
  complianceOther: text('compliance_other'),
  comments: text('comments'),
  reportGenerated: boolean('report_generated').default(false),
  durabilityReport: boolean('durability_report').default(false),
  ticketFileUrl: text('ticket_file_url'),
  matchStatus: matchStatusEnum('match_status').default('unmatched').notNull(),
  importedAt: timestamp('imported_at').defaultNow().notNull(),
})
