import {
  pgTable, pgEnum, text, integer, real, timestamp, date
} from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('role', [
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
  temperature: integer('temperature'),
  slump: text('slump'),
  unitWeight: real('unit_weight'),
  airContent: real('air_content'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const ticketRecords = pgTable('ticket_records', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  pourEventId: text('pour_event_id').notNull().references(() => pourEvents.id, { onDelete: 'cascade' }),
  batchTicketNumber: text('batch_ticket_number'),
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
