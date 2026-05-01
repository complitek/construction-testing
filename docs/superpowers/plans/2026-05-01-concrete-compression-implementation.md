# Concrete Compression Report Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone web app for federal construction concrete compression report generation with AI-powered batch ticket processing, break result tracking, and dual-path PDF export.

**Architecture:** Next.js 15 App Router with Clerk auth (role-based via publicMetadata), Neon PostgreSQL via Drizzle ORM, Vercel Blob for file storage, and Claude Vision API for batch ticket extraction. PDF reports use @react-pdf/renderer for both export paths; ExcelJS fills the Excel template for a separate .xlsx download. pdf-lib merges the report PDF with the extracted batch ticket scan.

**Tech Stack:** Next.js 15, TypeScript, Drizzle ORM, @neondatabase/serverless, Clerk, @vercel/blob, @anthropic-ai/sdk (claude-sonnet-4-6), pdf-lib, @react-pdf/renderer, ExcelJS, jszip, Vitest, Tailwind CSS

---

## File Map

```
src/
  app/
    (auth)/sign-in/[[...sign-in]]/page.tsx
    (auth)/sign-up/[[...sign-up]]/page.tsx
    (dashboard)/layout.tsx
    (dashboard)/page.tsx                        # Dashboard
    (dashboard)/pours/page.tsx                  # Pour list
    (dashboard)/pours/new/page.tsx              # Create pour
    (dashboard)/pours/[pourId]/page.tsx         # Pour detail
    (dashboard)/pours/[pourId]/edit/page.tsx    # Edit pour (lab manager only)
    (dashboard)/pours/[pourId]/tickets/page.tsx # Ticket manager
    (dashboard)/samples/[sampleId]/page.tsx     # Sample detail + break entry
    (dashboard)/admin/page.tsx                  # User management
    api/pours/route.ts
    api/pours/[pourId]/route.ts
    api/samples/route.ts
    api/samples/[sampleId]/route.ts
    api/samples/[sampleId]/breaks/route.ts
    api/samples/[sampleId]/report/route.ts
    api/tickets/upload/route.ts
    api/tickets/[ticketId]/confirm/route.ts
    api/vision/extract/route.ts
    api/reports/bulk/route.ts
    api/admin/users/route.ts
    api/admin/users/[userId]/route.ts
    api/admin/template/route.ts
  lib/
    db/index.ts
    db/schema.ts
    auth/permissions.ts
    auth/get-user-role.ts
    pdf/split.ts
    pdf/merge.ts
    pdf/render-report.tsx
    vision/extract-ticket.ts
    vision/match-tickets.ts
    utils/break-dates.ts
    utils/zip.ts
    types/index.ts
  components/
    pour/PourEventForm.tsx
    pour/PourEventList.tsx
    pour/SampleSetRow.tsx
    ticket/TicketCapture.tsx
    ticket/TicketUploader.tsx
    ticket/FlaggedMatchList.tsx
    breaks/BreakEntryForm.tsx
    report/ExportOptions.tsx
  middleware.ts
  __tests__/
    permissions.test.ts
    break-dates.test.ts
    match-tickets.test.ts
    pdf-split.test.ts
```

---

## Task 1: Project Initialization

**Files:**
- Create: `package.json`, `next.config.ts`, `.env.local`, `vitest.config.ts`

- [ ] **Step 1: Scaffold the project**

```bash
cd C:\Users\hiunl\Projects
npx create-next-app@latest concrete-compression --typescript --tailwind --app --src-dir --import-alias "@/*" --no-git
cd concrete-compression
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @clerk/nextjs drizzle-orm @neondatabase/serverless @vercel/blob @anthropic-ai/sdk pdf-lib @react-pdf/renderer exceljs jszip
npm install -D drizzle-kit vitest @vitejs/plugin-react dotenv-cli
```

- [ ] **Step 3: Create vitest config**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

- [ ] **Step 4: Create .env.local**

Create `.env.local` (fill in real values from Clerk, Neon, Vercel dashboards):
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-ant-...
BLOB_READ_WRITE_TOKEN=vercel_blob_...
```

- [ ] **Step 5: Create drizzle config**

Create `drizzle.config.ts`:
```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config
```

- [ ] **Step 6: Add scripts to package.json**

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "vitest run",
  "test:watch": "vitest",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:push": "drizzle-kit push"
}
```

- [ ] **Step 7: Commit**

```bash
git init
git add .
git commit -m "feat: initialize concrete compression project"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/lib/types/index.ts`

- [ ] **Step 1: Write types**

Create `src/lib/types/index.ts`:
```typescript
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
  | '14day' | '28day' | '56day' | '90day' | '120day'

export type BreakResults = Partial<Record<BreakAge, number>>

export const BREAK_AGES: BreakAge[] = [
  '1day', '3day', '4day', '5day', '7day',
  '14day', '28day', '56day', '90day', '120day',
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types/index.ts
git commit -m "feat: add shared types"
```

---

## Task 3: Database Schema & Connection

**Files:**
- Create: `src/lib/db/schema.ts`, `src/lib/db/index.ts`

- [ ] **Step 1: Write schema**

Create `src/lib/db/schema.ts`:
```typescript
import {
  pgTable, pgEnum, text, integer, timestamp, date
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
  break28day: integer('break_28day'),
  break56day: integer('break_56day'),
  break90day: integer('break_90day'),
  break120day: integer('break_120day'),
  reportStatus: reportStatusEnum('report_status').default('pending_breaks').notNull(),
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
```

- [ ] **Step 2: Write DB connection**

Create `src/lib/db/index.ts`:
```typescript
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })
```

- [ ] **Step 3: Push schema to database**

```bash
npm run db:push
```
Expected: tables created in Neon without errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/ drizzle.config.ts
git commit -m "feat: add database schema and connection"
```

---

## Task 4: Permissions System

**Files:**
- Create: `src/lib/auth/permissions.ts`, `src/lib/auth/get-user-role.ts`, `src/__tests__/permissions.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/__tests__/permissions.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { hasPermission } from '@/lib/auth/permissions'

describe('hasPermission', () => {
  it('allows lab_tech to create pour log', () => {
    expect(hasPermission('lab_tech', 'create_pour_log')).toBe(true)
  })
  it('denies concrete_qc_manager from creating pour log', () => {
    expect(hasPermission('concrete_qc_manager', 'create_pour_log')).toBe(false)
  })
  it('allows only lab_manager to edit pour log', () => {
    expect(hasPermission('lab_manager', 'edit_pour_log')).toBe(true)
    expect(hasPermission('lab_tech', 'edit_pour_log')).toBe(false)
    expect(hasPermission('office_manager', 'edit_pour_log')).toBe(false)
  })
  it('allows lab_tech and lab_manager to enter break results', () => {
    expect(hasPermission('lab_tech', 'enter_break_results')).toBe(true)
    expect(hasPermission('lab_manager', 'enter_break_results')).toBe(true)
    expect(hasPermission('office_manager', 'enter_break_results')).toBe(false)
  })
  it('allows all roles to download reports', () => {
    const allRoles = ['lab_tech', 'lab_manager', 'office_manager', 'field_tech',
      'concrete_qc_manager', 'qc_manager', 'alt_qc_manager'] as const
    allRoles.forEach(role => {
      expect(hasPermission(role, 'download_report')).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- permissions
```
Expected: FAIL — `hasPermission` not found.

- [ ] **Step 3: Write permissions module**

Create `src/lib/auth/permissions.ts`:
```typescript
import type { Role } from '@/lib/types'

type Permission =
  | 'create_pour_log'
  | 'upload_combined_pdf'
  | 'confirm_ticket_match'
  | 'enter_break_results'
  | 'edit_pour_log'
  | 'download_report'
  | 'bulk_download'
  | 'manage_users'

const PERMISSIONS: Record<Permission, Role[]> = {
  create_pour_log: ['lab_tech', 'lab_manager', 'office_manager', 'field_tech'],
  upload_combined_pdf: ['lab_tech', 'lab_manager', 'office_manager'],
  confirm_ticket_match: ['lab_tech', 'lab_manager', 'office_manager'],
  enter_break_results: ['lab_tech', 'lab_manager'],
  edit_pour_log: ['lab_manager'],
  download_report: ['lab_tech', 'lab_manager', 'office_manager', 'field_tech',
    'concrete_qc_manager', 'qc_manager', 'alt_qc_manager'],
  bulk_download: ['lab_tech', 'lab_manager', 'office_manager', 'field_tech',
    'concrete_qc_manager', 'qc_manager', 'alt_qc_manager'],
  manage_users: ['lab_manager'],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return PERMISSIONS[permission].includes(role)
}
```

- [ ] **Step 4: Write get-user-role helper**

Create `src/lib/auth/get-user-role.ts`:
```typescript
import { auth, currentUser } from '@clerk/nextjs/server'
import type { Role } from '@/lib/types'

export async function getUserRole(): Promise<Role | null> {
  const { userId } = await auth()
  if (!userId) return null
  const user = await currentUser()
  return (user?.publicMetadata?.role as Role) ?? null
}

export async function requireRole(): Promise<Role> {
  const role = await getUserRole()
  if (!role) throw new Error('Unauthorized')
  return role
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- permissions
```
Expected: PASS — 5 tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/ src/__tests__/permissions.test.ts
git commit -m "feat: add role-based permissions system"
```

---

## Task 5: Break Dates Utility

**Files:**
- Create: `src/lib/utils/break-dates.ts`, `src/__tests__/break-dates.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/__tests__/break-dates.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- break-dates
```
Expected: FAIL.

- [ ] **Step 3: Write utility**

Create `src/lib/utils/break-dates.ts`:
```typescript
import type { BreakAge } from '@/lib/types'

const BREAK_AGE_DAYS: Record<BreakAge, number> = {
  '1day': 1, '3day': 3, '4day': 4, '5day': 5, '7day': 7,
  '14day': 14, '28day': 28, '56day': 56, '90day': 90, '120day': 120,
}

export function calculateBreakDate(placementDate: string, age: BreakAge): string {
  const [year, month, day] = placementDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- break-dates
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/break-dates.ts src/__tests__/break-dates.test.ts
git commit -m "feat: add break date calculator"
```

---

## Task 6: Ticket Matching Logic

**Files:**
- Create: `src/lib/vision/match-tickets.ts`, `src/__tests__/match-tickets.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/__tests__/match-tickets.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- match-tickets
```
Expected: FAIL.

- [ ] **Step 3: Write matching logic**

Create `src/lib/vision/match-tickets.ts`:
```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- match-tickets
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vision/match-tickets.ts src/__tests__/match-tickets.test.ts
git commit -m "feat: add ticket-to-sample-set matching logic"
```

---

## Task 7: PDF Split Utility

**Files:**
- Create: `src/lib/pdf/split.ts`, `src/__tests__/pdf-split.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/__tests__/pdf-split.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { extractPageRange } from '@/lib/pdf/split'
import { PDFDocument } from 'pdf-lib'

async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage()
  return doc.save()
}

describe('extractPageRange', () => {
  it('extracts a single page from a multi-page PDF', async () => {
    const pdf = await makePdf(5)
    const extracted = await extractPageRange(pdf, 0, 0)
    const doc = await PDFDocument.load(extracted)
    expect(doc.getPageCount()).toBe(1)
  })

  it('extracts two pages for a 2-page ticket', async () => {
    const pdf = await makePdf(5)
    const extracted = await extractPageRange(pdf, 1, 2)
    const doc = await PDFDocument.load(extracted)
    expect(doc.getPageCount()).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- pdf-split
```
Expected: FAIL.

- [ ] **Step 3: Write split utility**

Create `src/lib/pdf/split.ts`:
```typescript
import { PDFDocument } from 'pdf-lib'

export async function extractPageRange(
  combinedPdfBytes: Uint8Array,
  pageStart: number,
  pageEnd: number
): Promise<Uint8Array> {
  const sourceDoc = await PDFDocument.load(combinedPdfBytes)
  const newDoc = await PDFDocument.create()
  const indices = Array.from({ length: pageEnd - pageStart + 1 }, (_, i) => pageStart + i)
  const pages = await newDoc.copyPages(sourceDoc, indices)
  pages.forEach(p => newDoc.addPage(p))
  return newDoc.save()
}

export function getPageCount(pdfBytes: Uint8Array): Promise<number> {
  return PDFDocument.load(pdfBytes).then(doc => doc.getPageCount())
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- pdf-split
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/split.ts src/__tests__/pdf-split.test.ts
git commit -m "feat: add PDF page extraction utility"
```

---

## Task 8: PDF Merge Utility & ZIP Utility

**Files:**
- Create: `src/lib/pdf/merge.ts`, `src/lib/utils/zip.ts`

- [ ] **Step 1: Write PDF merger**

Create `src/lib/pdf/merge.ts`:
```typescript
import { PDFDocument } from 'pdf-lib'

export async function mergeReportWithTicket(
  reportPdfBytes: Uint8Array,
  ticketPdfBytes: Uint8Array
): Promise<Uint8Array> {
  const reportDoc = await PDFDocument.load(reportPdfBytes)
  const ticketDoc = await PDFDocument.load(ticketPdfBytes)
  const indices = Array.from({ length: ticketDoc.getPageCount() }, (_, i) => i)
  const ticketPages = await reportDoc.copyPages(ticketDoc, indices)
  ticketPages.forEach(p => reportDoc.addPage(p))
  return reportDoc.save()
}
```

- [ ] **Step 2: Write ZIP utility**

Create `src/lib/utils/zip.ts`:
```typescript
import JSZip from 'jszip'

export async function createZipFromPdfs(
  files: Array<{ name: string; data: Uint8Array }>
): Promise<Uint8Array> {
  const zip = new JSZip()
  files.forEach(({ name, data }) => zip.file(name, data))
  return zip.generateAsync({ type: 'uint8array' })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/pdf/merge.ts src/lib/utils/zip.ts
git commit -m "feat: add PDF merge and ZIP utilities"
```

---

## Task 9: Claude Vision Extraction

**Files:**
- Create: `src/lib/vision/extract-ticket.ts`

- [ ] **Step 1: Write extraction module**

Create `src/lib/vision/extract-ticket.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedTicketData } from '@/lib/types'

const client = new Anthropic()

export async function extractTicketData(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
): Promise<ExtractedTicketData> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: imageBase64 },
        },
        {
          type: 'text',
          text: `You are reading a concrete batch ticket from a construction project.
Extract the following fields and return ONLY a JSON object with these exact keys:
- batchTicketNumber: the batch/ticket number printed on the ticket (string or null)
- date: the date of the batch in ISO format YYYY-MM-DD (string or null)
- supplier: the concrete supplier or plant name (string or null)
- mixId: the mix design ID, mix number, or design strength code (string or null)
- confidence: "high" if all four fields are clearly readable, "medium" if 2-3 are readable, "low" if fewer than 2 are readable

Return ONLY the JSON object. No explanation, no markdown.`,
        },
      ],
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
  try {
    return JSON.parse(text) as ExtractedTicketData
  } catch {
    return { batchTicketNumber: null, date: null, supplier: null, mixId: null, confidence: 'low' }
  }
}

export async function extractTicketDataFromPdf(
  pdfBytes: Uint8Array
): Promise<ExtractedTicketData> {
  // Convert first page of PDF to image using pdf-lib page dimensions
  // We send the raw PDF bytes as base64 — Claude Vision can read PDFs directly
  const base64 = Buffer.from(pdfBytes).toString('base64')
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        },
        {
          type: 'text',
          text: `You are reading a concrete batch ticket from a construction project.
Extract the following fields and return ONLY a JSON object with these exact keys:
- batchTicketNumber: the batch/ticket number printed on the ticket (string or null)
- date: the date of the batch in ISO format YYYY-MM-DD (string or null)
- supplier: the concrete supplier or plant name (string or null)
- mixId: the mix design ID, mix number, or design strength code (string or null)
- confidence: "high" if all four fields are clearly readable, "medium" if 2-3 are readable, "low" if fewer than 2 are readable

Return ONLY the JSON object. No explanation, no markdown.`,
        },
      ],
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
  try {
    return JSON.parse(text) as ExtractedTicketData
  } catch {
    return { batchTicketNumber: null, date: null, supplier: null, mixId: null, confidence: 'low' }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/vision/extract-ticket.ts
git commit -m "feat: add Claude Vision ticket extraction"
```

---

## Task 10: Report PDF Renderer

**Files:**
- Create: `src/lib/pdf/render-report.tsx`

- [ ] **Step 1: Write report renderer**

Create `src/lib/pdf/render-report.tsx`:
```tsx
import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { renderToBuffer } from '@react-pdf/renderer'
import type { PourEvent, SampleSet, BreakAge } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'
import { calculateAllBreakDates } from '@/lib/utils/break-dates'

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: 'Helvetica' },
  title: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 },
  fieldRow: { flexDirection: 'row', marginBottom: 6 },
  fieldLabel: { width: '40%', fontWeight: 'bold' },
  fieldValue: { width: '60%' },
  divider: { borderBottom: '1px solid #000', marginVertical: 16 },
  tableHeader: {
    flexDirection: 'row', backgroundColor: '#e0e0e0',
    padding: '6 4', fontWeight: 'bold', borderTop: '1px solid #000', borderBottom: '1px solid #000',
  },
  tableRow: { flexDirection: 'row', padding: '5 4', borderBottom: '0.5px solid #ccc' },
  col1: { width: '33%' },
  col2: { width: '33%' },
  col3: { width: '34%' },
  footer: { position: 'absolute', bottom: 30, left: 48, right: 48, fontSize: 8, color: '#666' },
})

const AGE_LABELS: Record<BreakAge, string> = {
  '1day': '1-Day', '3day': '3-Day', '4day': '4-Day', '5day': '5-Day',
  '7day': '7-Day', '14day': '14-Day', '28day': '28-Day',
  '56day': '56-Day', '90day': '90-Day', '120day': '120-Day',
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y}`
}

interface ReportProps {
  pourEvent: PourEvent
  sampleSet: SampleSet
}

function ReportDocument({ pourEvent, sampleSet }: ReportProps) {
  const breakDates = calculateAllBreakDates(pourEvent.date)

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>CONCRETE COMPRESSION TEST REPORT</Text>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Date of Placement:</Text>
          <Text style={styles.fieldValue}>{formatDate(pourEvent.date)} ({pourEvent.shift} shift)</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Specification:</Text>
          <Text style={styles.fieldValue}>{pourEvent.spec}</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Location:</Text>
          <Text style={styles.fieldValue}>{pourEvent.location}</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Description:</Text>
          <Text style={styles.fieldValue}>{pourEvent.description}</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Supplier:</Text>
          <Text style={styles.fieldValue}>{pourEvent.supplier}</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Mix Design ID:</Text>
          <Text style={styles.fieldValue}>{pourEvent.mixId}</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Batch Ticket No.:</Text>
          <Text style={styles.fieldValue}>{sampleSet.batchTicketNumber}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.tableHeader}>
          <Text style={styles.col1}>Cylinder Age</Text>
          <Text style={styles.col2}>Break Date</Text>
          <Text style={styles.col3}>Compressive Strength (PSI)</Text>
        </View>

        {BREAK_AGES.map(age => (
          <View key={age} style={styles.tableRow}>
            <Text style={styles.col1}>{AGE_LABELS[age]}</Text>
            <Text style={styles.col2}>{formatDate(breakDates[age])}</Text>
            <Text style={styles.col3}>
              {sampleSet.breaks[age] != null ? sampleSet.breaks[age].toString() : '—'}
            </Text>
          </View>
        ))}

        <Text style={styles.footer}>
          Generated by Concrete Compression Report Tool | {new Date().toLocaleDateString()}
        </Text>
      </Page>
    </Document>
  )
}

export async function renderReportPdf(
  pourEvent: PourEvent,
  sampleSet: SampleSet
): Promise<Buffer> {
  return renderToBuffer(<ReportDocument pourEvent={pourEvent} sampleSet={sampleSet} />)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/pdf/render-report.tsx
git commit -m "feat: add PDF report renderer"
```

---

## Task 11: Clerk Auth Setup & Middleware

**Files:**
- Create: `src/middleware.ts`, `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx`, `src/app/(auth)/sign-up/[[...sign-up]]/page.tsx`

- [ ] **Step 1: Write middleware**

Create `src/middleware.ts`:
```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)'])

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) await auth.protect()
})

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
}
```

- [ ] **Step 2: Write sign-in page**

Create `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx`:
```tsx
import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <SignIn />
    </div>
  )
}
```

- [ ] **Step 3: Write sign-up page**

Create `src/app/(auth)/sign-up/[[...sign-up]]/page.tsx`:
```tsx
import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <SignUp />
    </div>
  )
}
```

- [ ] **Step 4: Write dashboard layout**

Create `src/app/(dashboard)/layout.tsx`:
```tsx
import { UserButton } from '@clerk/nextjs'
import Link from 'next/link'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-lg text-blue-700">Concrete Reports</Link>
          <Link href="/pours" className="text-sm text-gray-600 hover:text-gray-900">Pour Log</Link>
          <Link href="/admin" className="text-sm text-gray-600 hover:text-gray-900">Admin</Link>
        </div>
        <UserButton afterSignOutUrl="/sign-in" />
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 5: Verify Clerk is working**

```bash
npm run dev
```
Navigate to `http://localhost:3000`. Expected: redirect to `/sign-in`. Sign in with a Clerk account. Expected: redirect to dashboard.

- [ ] **Step 6: Commit**

```bash
git add src/middleware.ts src/app/\(auth\)/ src/app/\(dashboard\)/layout.tsx
git commit -m "feat: add Clerk auth and middleware"
```

---

## Task 12: Pour Event API Routes

**Files:**
- Create: `src/app/api/pours/route.ts`, `src/app/api/pours/[pourId]/route.ts`

- [ ] **Step 1: Write pour list + create API**

Create `src/app/api/pours/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { pourEvents } from '@/lib/db/schema'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { desc } from 'drizzle-orm'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pours = await db.select().from(pourEvents).orderBy(desc(pourEvents.date))
  return NextResponse.json(pours)
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'create_pour_log')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { date, shift, spec, location, description, supplier, mixId } = body

  if (!date || !shift || !spec || !location || !description || !supplier || !mixId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const [pour] = await db.insert(pourEvents).values({
    date, shift, spec, location, description, supplier, mixId,
    createdBy: userId,
  }).returning()

  return NextResponse.json(pour, { status: 201 })
}
```

- [ ] **Step 2: Write pour detail + edit API**

Create `src/app/api/pours/[pourId]/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { pourEvents } from '@/lib/db/schema'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { eq } from 'drizzle-orm'

export async function GET(_: Request, { params }: { params: Promise<{ pourId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pourId } = await params
  const [pour] = await db.select().from(pourEvents).where(eq(pourEvents.id, pourId))
  if (!pour) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(pour)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ pourId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'edit_pour_log')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { pourId } = await params
  const body = await request.json()
  const { date, shift, spec, location, description, supplier, mixId } = body

  const [updated] = await db.update(pourEvents)
    .set({ date, shift, spec, location, description, supplier, mixId, updatedAt: new Date() })
    .where(eq(pourEvents.id, pourId))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(updated)
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/pours/
git commit -m "feat: add pour event API routes"
```

---

## Task 13: Sample Set API Routes

**Files:**
- Create: `src/app/api/samples/route.ts`, `src/app/api/samples/[sampleId]/route.ts`, `src/app/api/samples/[sampleId]/breaks/route.ts`

- [ ] **Step 1: Write sample list + create API**

Create `src/app/api/samples/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { sampleSets } from '@/lib/db/schema'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { eq } from 'drizzle-orm'

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pourId = new URL(request.url).searchParams.get('pourId')
  if (!pourId) return NextResponse.json({ error: 'pourId required' }, { status: 400 })

  const samples = await db.select().from(sampleSets).where(eq(sampleSets.pourEventId, pourId))
  return NextResponse.json(samples)
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'create_pour_log')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { pourEventId, batchTicketNumber } = await request.json()
  if (!pourEventId || !batchTicketNumber) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const [sample] = await db.insert(sampleSets).values({
    pourEventId, batchTicketNumber, createdBy: userId,
  }).returning()

  return NextResponse.json(sample, { status: 201 })
}
```

- [ ] **Step 2: Write sample detail + update API**

Create `src/app/api/samples/[sampleId]/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { sampleSets } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(_: Request, { params }: { params: Promise<{ sampleId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sampleId } = await params
  const [sample] = await db.select().from(sampleSets).where(eq(sampleSets.id, sampleId))
  if (!sample) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(sample)
}
```

- [ ] **Step 3: Write break results API**

Create `src/app/api/samples/[sampleId]/breaks/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { sampleSets } from '@/lib/db/schema'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { eq } from 'drizzle-orm'
import type { BreakAge } from '@/lib/types'

const BREAK_COLUMN_MAP: Record<BreakAge, keyof typeof sampleSets.$inferInsert> = {
  '1day': 'break1day', '3day': 'break3day', '4day': 'break4day',
  '5day': 'break5day', '7day': 'break7day', '14day': 'break14day',
  '28day': 'break28day', '56day': 'break56day', '90day': 'break90day',
  '120day': 'break120day',
}

export async function PATCH(request: Request, { params }: { params: Promise<{ sampleId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'enter_break_results')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { sampleId } = await params
  const body = await request.json() as Partial<Record<BreakAge, number>>

  const updates: Record<string, number | string> = { updatedAt: new Date().toISOString() }
  for (const [age, psi] of Object.entries(body)) {
    const col = BREAK_COLUMN_MAP[age as BreakAge]
    if (col) updates[col as string] = psi as number
  }

  // Set reportStatus to ready_to_export if any break is now present
  updates['reportStatus'] = 'ready_to_export'

  const [updated] = await db.update(sampleSets)
    .set(updates as Parameters<typeof db.update>[0] extends any ? any : never)
    .where(eq(sampleSets.id, sampleId))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(updated)
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/samples/
git commit -m "feat: add sample set and break results API routes"
```

---

## Task 14: Vision Extract API + Report Generation API

**Files:**
- Create: `src/app/api/vision/extract/route.ts`, `src/app/api/samples/[sampleId]/report/route.ts`

- [ ] **Step 1: Write vision extract API**

Create `src/app/api/vision/extract/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { extractTicketData } from '@/lib/vision/extract-ticket'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageBase64, mediaType } = await request.json()
  if (!imageBase64 || !mediaType) {
    return NextResponse.json({ error: 'imageBase64 and mediaType required' }, { status: 400 })
  }

  const extracted = await extractTicketData(imageBase64, mediaType)
  return NextResponse.json(extracted)
}
```

- [ ] **Step 2: Write report generation API**

Create `src/app/api/samples/[sampleId]/report/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { sampleSets, pourEvents } from '@/lib/db/schema'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { eq } from 'drizzle-orm'
import { renderReportPdf } from '@/lib/pdf/render-report'
import { mergeReportWithTicket } from '@/lib/pdf/merge'
import type { PourEvent, SampleSet, BreakAge, BreakResults } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'

export const maxDuration = 60

function dbRowToSampleSet(row: typeof sampleSets.$inferSelect): SampleSet {
  const breaks: BreakResults = {}
  const ageMap: Record<BreakAge, number | null> = {
    '1day': row.break1day, '3day': row.break3day, '4day': row.break4day,
    '5day': row.break5day, '7day': row.break7day, '14day': row.break14day,
    '28day': row.break28day, '56day': row.break56day, '90day': row.break90day,
    '120day': row.break120day,
  }
  for (const age of BREAK_AGES) {
    if (ageMap[age] != null) breaks[age] = ageMap[age]!
  }
  return {
    id: row.id,
    pourEventId: row.pourEventId,
    batchTicketNumber: row.batchTicketNumber,
    ticketFileUrl: row.ticketFileUrl,
    matchStatus: row.matchStatus,
    breaks,
    reportStatus: row.reportStatus,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function GET(_: Request, { params }: { params: Promise<{ sampleId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'download_report')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { sampleId } = await params
  const [sampleRow] = await db.select().from(sampleSets).where(eq(sampleSets.id, sampleId))
  if (!sampleRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [pourRow] = await db.select().from(pourEvents).where(eq(pourEvents.id, sampleRow.pourEventId))
  if (!pourRow) return NextResponse.json({ error: 'Pour event not found' }, { status: 404 })

  const pour: PourEvent = {
    id: pourRow.id,
    date: pourRow.date,
    shift: pourRow.shift,
    spec: pourRow.spec,
    location: pourRow.location,
    description: pourRow.description,
    supplier: pourRow.supplier,
    mixId: pourRow.mixId,
    createdBy: pourRow.createdBy,
    createdAt: pourRow.createdAt.toISOString(),
    updatedAt: pourRow.updatedAt.toISOString(),
  }

  const sample = dbRowToSampleSet(sampleRow)
  const reportBuffer = await renderReportPdf(pour, sample)

  let finalPdf: Uint8Array = reportBuffer

  if (sampleRow.ticketFileUrl) {
    const ticketResponse = await fetch(sampleRow.ticketFileUrl)
    if (ticketResponse.ok) {
      const ticketBytes = new Uint8Array(await ticketResponse.arrayBuffer())
      finalPdf = await mergeReportWithTicket(reportBuffer, ticketBytes)
    }
  }

  return new NextResponse(finalPdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="report-${sampleRow.batchTicketNumber}.pdf"`,
    },
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/vision/ src/app/api/samples/
git commit -m "feat: add vision extract and report generation APIs"
```

---

## Task 15: Combined PDF Upload API

**Files:**
- Create: `src/app/api/tickets/upload/route.ts`, `src/app/api/tickets/[ticketId]/confirm/route.ts`

- [ ] **Step 1: Write combined PDF upload API**

Create `src/app/api/tickets/upload/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { ticketRecords, ticketUploads, sampleSets } from '@/lib/db/schema'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { put } from '@vercel/blob'
import { extractPageRange, getPageCount } from '@/lib/pdf/split'
import { extractTicketDataFromPdf } from '@/lib/vision/extract-ticket'
import { matchTicketsToSampleSets } from '@/lib/vision/match-tickets'
import { eq } from 'drizzle-orm'

export const maxDuration = 300

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'upload_combined_pdf')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const pourId = formData.get('pourId') as string | null

  if (!file || !pourId) {
    return NextResponse.json({ error: 'file and pourId required' }, { status: 400 })
  }

  const pdfBytes = new Uint8Array(await file.arrayBuffer())

  // Store original combined PDF
  const originalBlob = await put(`tickets/combined/${pourId}-${Date.now()}.pdf`, pdfBytes, {
    access: 'public', contentType: 'application/pdf',
  })

  const [upload] = await db.insert(ticketUploads).values({
    pourEventId: pourId,
    originalFileUrl: originalBlob.url,
    processingStatus: 'processing',
    createdBy: userId,
  }).returning()

  const totalPages = await getPageCount(pdfBytes)

  // Extract each page individually, send to Claude Vision, then group 2-page tickets
  type PageResult = { pageIndex: number; bytes: Uint8Array; extracted: Awaited<ReturnType<typeof extractTicketDataFromPdf>> }
  const pageResults: PageResult[] = []

  for (let i = 0; i < totalPages; i++) {
    const pageBytes = await extractPageRange(pdfBytes, i, i)
    const extracted = await extractTicketDataFromPdf(pageBytes)
    pageResults.push({ pageIndex: i, bytes: pageBytes, extracted })
  }

  // Group pages into tickets: a page starts a new ticket if it has its own ticket number,
  // OR if the previous page already had one (max 2 pages per ticket)
  const ticketGroups: Array<{ pageStart: number; pageEnd: number; bytes: Uint8Array; extracted: typeof pageResults[0]['extracted'] }> = []
  let i = 0
  while (i < pageResults.length) {
    const current = pageResults[i]
    const next = pageResults[i + 1]

    // If next page has no ticket number and current has one, group them (2-page ticket)
    if (next && !next.extracted.batchTicketNumber && current.extracted.batchTicketNumber) {
      const twoPageBytes = await extractPageRange(pdfBytes, i, i + 1)
      ticketGroups.push({ pageStart: i, pageEnd: i + 1, bytes: twoPageBytes, extracted: current.extracted })
      i += 2
    } else {
      ticketGroups.push({ pageStart: i, pageEnd: i, bytes: current.bytes, extracted: current.extracted })
      i += 1
    }
  }

  // Fetch sample sets for this pour to match against
  const pourSamples = await db.select({ id: sampleSets.id, batchTicketNumber: sampleSets.batchTicketNumber })
    .from(sampleSets).where(eq(sampleSets.pourEventId, pourId))

  const matchResults = matchTicketsToSampleSets(
    ticketGroups.map(g => ({ extractedData: g.extracted, pageStart: g.pageStart, pageEnd: g.pageEnd })),
    pourSamples
  )

  // Store each ticket record and update matched sample sets
  const savedRecords = []
  for (let j = 0; j < matchResults.length; j++) {
    const match = matchResults[j]
    const group = ticketGroups[j]

    const blob = await put(
      `tickets/extracted/${pourId}-p${match.pageStart}-${match.pageEnd}-${Date.now()}.pdf`,
      group.bytes,
      { access: 'public', contentType: 'application/pdf' }
    )

    const [record] = await db.insert(ticketRecords).values({
      pourEventId: pourId,
      batchTicketNumber: match.extractedData.batchTicketNumber,
      pageStart: match.pageStart,
      pageEnd: match.pageEnd,
      fileUrl: blob.url,
      sampleSetId: match.matchedSampleSetId,
    }).returning()

    if (match.matchedSampleSetId) {
      await db.update(sampleSets)
        .set({ ticketFileUrl: blob.url, matchStatus: match.matchStatus, updatedAt: new Date() })
        .where(eq(sampleSets.id, match.matchedSampleSetId))
    }

    savedRecords.push({ ...record, matchStatus: match.matchStatus })
  }

  await db.update(ticketUploads)
    .set({ processingStatus: 'complete' })
    .where(eq(ticketUploads.id, upload.id))

  return NextResponse.json({
    uploadId: upload.id,
    totalTickets: ticketGroups.length,
    autoMatched: matchResults.filter(m => m.matchStatus === 'auto_matched').length,
    flagged: matchResults.filter(m => m.matchStatus === 'flagged').length,
    unmatched: matchResults.filter(m => m.matchStatus === 'unmatched').length,
    records: savedRecords,
  })
}
```

- [ ] **Step 2: Write confirm-match API**

Create `src/app/api/tickets/[ticketId]/confirm/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { ticketRecords, sampleSets } from '@/lib/db/schema'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { eq } from 'drizzle-orm'

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'confirm_ticket_match')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { ticketId } = await params
  const { sampleSetId, action } = await request.json() // action: 'confirm' | 'reject'

  const [record] = await db.select().from(ticketRecords).where(eq(ticketRecords.id, ticketId))
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'confirm' && sampleSetId) {
    await db.update(ticketRecords).set({ sampleSetId }).where(eq(ticketRecords.id, ticketId))
    await db.update(sampleSets)
      .set({ ticketFileUrl: record.fileUrl, matchStatus: 'manually_confirmed', updatedAt: new Date() })
      .where(eq(sampleSets.id, sampleSetId))
  } else if (action === 'reject') {
    await db.update(ticketRecords).set({ sampleSetId: null }).where(eq(ticketRecords.id, ticketId))
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tickets/
git commit -m "feat: add combined PDF upload and ticket confirm APIs"
```

---

## Task 16: Bulk Download API

**Files:**
- Create: `src/app/api/reports/bulk/route.ts`

- [ ] **Step 1: Write bulk download API**

Create `src/app/api/reports/bulk/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { sampleSets, pourEvents } from '@/lib/db/schema'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { eq, and, gte, lte } from 'drizzle-orm'
import { renderReportPdf } from '@/lib/pdf/render-report'
import { mergeReportWithTicket } from '@/lib/pdf/merge'
import { createZipFromPdfs } from '@/lib/utils/zip'
import type { PourEvent, SampleSet, BreakAge, BreakResults } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'

export const maxDuration = 300

function toSampleSet(row: typeof sampleSets.$inferSelect): SampleSet {
  const breaks: BreakResults = {}
  const map: Record<BreakAge, number | null> = {
    '1day': row.break1day, '3day': row.break3day, '4day': row.break4day,
    '5day': row.break5day, '7day': row.break7day, '14day': row.break14day,
    '28day': row.break28day, '56day': row.break56day, '90day': row.break90day,
    '120day': row.break120day,
  }
  for (const age of BREAK_AGES) { if (map[age] != null) breaks[age] = map[age]! }
  return {
    id: row.id, pourEventId: row.pourEventId, batchTicketNumber: row.batchTicketNumber,
    ticketFileUrl: row.ticketFileUrl, matchStatus: row.matchStatus, breaks,
    reportStatus: row.reportStatus, createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  }
}

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'bulk_download')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const pourId = url.searchParams.get('pourId')
  const dateFrom = url.searchParams.get('dateFrom')
  const dateTo = url.searchParams.get('dateTo')

  let samples: typeof sampleSets.$inferSelect[] = []

  if (pourId) {
    samples = await db.select().from(sampleSets).where(eq(sampleSets.pourEventId, pourId))
  } else if (dateFrom && dateTo) {
    const pours = await db.select().from(pourEvents)
      .where(and(gte(pourEvents.date, dateFrom), lte(pourEvents.date, dateTo)))
    for (const pour of pours) {
      const s = await db.select().from(sampleSets).where(eq(sampleSets.pourEventId, pour.id))
      samples.push(...s)
    }
  } else {
    return NextResponse.json({ error: 'pourId or dateFrom+dateTo required' }, { status: 400 })
  }

  const files: Array<{ name: string; data: Uint8Array }> = []

  for (const sampleRow of samples) {
    const [pourRow] = await db.select().from(pourEvents).where(eq(pourEvents.id, sampleRow.pourEventId))
    if (!pourRow) continue

    const pour: PourEvent = {
      id: pourRow.id, date: pourRow.date, shift: pourRow.shift, spec: pourRow.spec,
      location: pourRow.location, description: pourRow.description, supplier: pourRow.supplier,
      mixId: pourRow.mixId, createdBy: pourRow.createdBy,
      createdAt: pourRow.createdAt.toISOString(), updatedAt: pourRow.updatedAt.toISOString(),
    }
    const sample = toSampleSet(sampleRow)
    const reportBuffer = await renderReportPdf(pour, sample)

    let finalPdf: Uint8Array = reportBuffer
    if (sampleRow.ticketFileUrl) {
      const res = await fetch(sampleRow.ticketFileUrl)
      if (res.ok) {
        const ticketBytes = new Uint8Array(await res.arrayBuffer())
        finalPdf = await mergeReportWithTicket(reportBuffer, ticketBytes)
      }
    }

    files.push({ name: `report-${pourRow.date}-${sampleRow.batchTicketNumber}.pdf`, data: finalPdf })
  }

  const zipBytes = await createZipFromPdfs(files)

  return new NextResponse(zipBytes, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="compression-reports-${Date.now()}.zip"`,
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/reports/
git commit -m "feat: add bulk ZIP download API"
```

---

## Task 17: User Admin API & Excel Template API

**Files:**
- Create: `src/app/api/admin/users/route.ts`, `src/app/api/admin/users/[userId]/route.ts`, `src/app/api/admin/template/route.ts`

- [ ] **Step 1: Write user admin APIs**

Create `src/app/api/admin/users/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import type { Role } from '@/lib/types'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = await getUserRole()
  if (!role || !hasPermission(role, 'manage_users')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const allUsers = await db.select().from(users)
  return NextResponse.json(allUsers)
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = await getUserRole()
  if (!role || !hasPermission(role, 'manage_users')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, name, newRole, password } = await request.json() as {
    email: string; name: string; newRole: Role; password: string
  }

  const client = await clerkClient()
  const clerkUser = await client.users.createUser({
    emailAddress: [email],
    password,
    firstName: name.split(' ')[0],
    lastName: name.split(' ').slice(1).join(' '),
    publicMetadata: { role: newRole },
  })

  const [dbUser] = await db.insert(users).values({
    id: crypto.randomUUID(),
    clerkId: clerkUser.id,
    role: newRole,
    name,
    email,
  }).returning()

  return NextResponse.json(dbUser, { status: 201 })
}
```

Create `src/app/api/admin/users/[userId]/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { Role } from '@/lib/types'

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId: authUserId } = await auth()
  if (!authUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = await getUserRole()
  if (!role || !hasPermission(role, 'manage_users')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId } = await params
  const { newRole } = await request.json() as { newRole: Role }

  const [dbUser] = await db.select().from(users).where(eq(users.id, userId))
  if (!dbUser) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const client = await clerkClient()
  await client.users.updateUserMetadata(dbUser.clerkId, { publicMetadata: { role: newRole } })
  const [updated] = await db.update(users).set({ role: newRole }).where(eq(users.id, userId)).returning()

  return NextResponse.json(updated)
}
```

- [ ] **Step 2: Write Excel template upload API**

Create `src/app/api/admin/template/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { appSettings } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = await getUserRole()
  if (!role || !hasPermission(role, 'manage_users')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  const blob = await put('templates/compression-report.xlsx', bytes, {
    access: 'public',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  await db.insert(appSettings)
    .values({ key: 'excel_template_url', value: blob.url, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: blob.url, updatedAt: new Date() } })

  return NextResponse.json({ url: blob.url })
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [setting] = await db.select().from(appSettings)
    .where(sql`key = 'excel_template_url'`)
  return NextResponse.json({ url: setting?.value ?? null })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/
git commit -m "feat: add user admin and Excel template APIs"
```

---

## Task 18: Core UI Pages

**Files:**
- Create: `src/app/(dashboard)/page.tsx`, `src/app/(dashboard)/pours/page.tsx`, `src/app/(dashboard)/pours/new/page.tsx`, `src/app/(dashboard)/pours/[pourId]/page.tsx`, `src/app/(dashboard)/samples/[sampleId]/page.tsx`

- [ ] **Step 1: Dashboard page**

Create `src/app/(dashboard)/page.tsx`:
```tsx
import Link from 'next/link'

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Concrete Compression Reports</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/pours/new" className="block p-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <h2 className="font-bold text-lg">New Pour Log</h2>
          <p className="text-sm mt-1 opacity-90">Log a new pour event or scan a batch ticket</p>
        </Link>
        <Link href="/pours" className="block p-6 bg-white border rounded-lg hover:border-blue-400">
          <h2 className="font-bold text-lg">Pour Log</h2>
          <p className="text-sm mt-1 text-gray-500">View all pour events and reports</p>
        </Link>
        <Link href="/admin" className="block p-6 bg-white border rounded-lg hover:border-blue-400">
          <h2 className="font-bold text-lg">Admin</h2>
          <p className="text-sm mt-1 text-gray-500">Manage users and templates</p>
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Pour list page**

Create `src/app/(dashboard)/pours/page.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { PourEvent } from '@/lib/types'

export default function PourListPage() {
  const [pours, setPours] = useState<PourEvent[]>([])

  useEffect(() => {
    fetch('/api/pours').then(r => r.json()).then(setPours)
  }, [])

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Pour Log</h1>
        <Link href="/pours/new" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm">
          + New Pour
        </Link>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Shift</th>
              <th className="text-left px-4 py-3">Location</th>
              <th className="text-left px-4 py-3">Supplier</th>
              <th className="text-left px-4 py-3">Mix ID</th>
              <th className="text-left px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {pours.map(pour => (
              <tr key={pour.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">{pour.date}</td>
                <td className="px-4 py-3 capitalize">{pour.shift}</td>
                <td className="px-4 py-3">{pour.location}</td>
                <td className="px-4 py-3">{pour.supplier}</td>
                <td className="px-4 py-3">{pour.mixId}</td>
                <td className="px-4 py-3">
                  <Link href={`/pours/${pour.id}`} className="text-blue-600 hover:underline">View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {pours.length === 0 && (
          <p className="text-center text-gray-400 py-12">No pour events yet.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create pour page (with scan-to-fill)**

Create `src/app/(dashboard)/pours/new/page.tsx`:
```tsx
'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { ExtractedTicketData } from '@/lib/types'

export default function NewPourPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [form, setForm] = useState({
    date: '', shift: 'day', spec: '', location: '',
    description: '', supplier: '', mixId: '',
  })
  const [batchTicketNumber, setBatchTicketNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setScanning(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp'
      const res = await fetch('/api/vision/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      })
      const data: ExtractedTicketData = await res.json()
      setForm(f => ({
        ...f,
        date: data.date ?? f.date,
        supplier: data.supplier ?? f.supplier,
        mixId: data.mixId ?? f.mixId,
      }))
      if (data.batchTicketNumber) setBatchTicketNumber(data.batchTicketNumber)
      setScanning(false)
    }
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    // Create pour event
    const pourRes = await fetch('/api/pours', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const pour = await pourRes.json()

    // Create first sample set if batch ticket number provided
    if (batchTicketNumber) {
      await fetch('/api/samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pourEventId: pour.id, batchTicketNumber }),
      })
    }

    router.push(`/pours/${pour.id}`)
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">New Pour Event</h1>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm font-medium text-blue-800 mb-2">Scan a batch ticket to auto-fill</p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={scanning}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {scanning ? 'Reading ticket...' : 'Upload / Photo Ticket'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleScan} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {[
          { label: 'Date of Placement', key: 'date', type: 'date' },
          { label: 'Specification', key: 'spec', type: 'text' },
          { label: 'Location', key: 'location', type: 'text' },
          { label: 'Description', key: 'description', type: 'text' },
          { label: 'Supplier', key: 'supplier', type: 'text' },
          { label: 'Mix ID', key: 'mixId', type: 'text' },
        ].map(({ label, key, type }) => (
          <div key={key}>
            <label className="block text-sm font-medium mb-1">{label}</label>
            <input
              type={type}
              required
              value={form[key as keyof typeof form]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        ))}

        <div>
          <label className="block text-sm font-medium mb-1">Shift</label>
          <select
            value={form.shift}
            onChange={e => setForm(f => ({ ...f, shift: e.target.value }))}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            <option value="day">Day</option>
            <option value="night">Night</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">First Batch Ticket No. (optional)</label>
          <input
            type="text"
            value={batchTicketNumber}
            onChange={e => setBatchTicketNumber(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Will create first sample set"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Saving...' : 'Create Pour Event'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Pour detail page**

Create `src/app/(dashboard)/pours/[pourId]/page.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { PourEvent, SampleSet } from '@/lib/types'

export default function PourDetailPage() {
  const { pourId } = useParams<{ pourId: string }>()
  const router = useRouter()
  const [pour, setPour] = useState<PourEvent | null>(null)
  const [samples, setSamples] = useState<SampleSet[]>([])
  const [newTicket, setNewTicket] = useState('')
  const [addingTicket, setAddingTicket] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/pours/${pourId}`).then(r => r.json()).then(setPour)
    fetch(`/api/samples?pourId=${pourId}`).then(r => r.json()).then(setSamples)
  }, [pourId])

  async function addSampleSet() {
    if (!newTicket.trim()) return
    setAddingTicket(true)
    const res = await fetch('/api/samples', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pourEventId: pourId, batchTicketNumber: newTicket }),
    })
    const sample = await res.json()
    setSamples(s => [...s, sample])
    setNewTicket('')
    setAddingTicket(false)
  }

  async function uploadCombinedPdf() {
    if (!uploadFile) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', uploadFile)
    fd.append('pourId', pourId)
    const res = await fetch('/api/tickets/upload', { method: 'POST', body: fd })
    const result = await res.json()
    setUploadResult(`Processed ${result.totalTickets} tickets — ${result.autoMatched} auto-matched, ${result.flagged} flagged, ${result.unmatched} unmatched`)
    fetch(`/api/samples?pourId=${pourId}`).then(r => r.json()).then(setSamples)
    setUploading(false)
  }

  if (!pour) return <p className="text-gray-400">Loading...</p>

  return (
    <div className="max-w-4xl">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold">{pour.date} — {pour.shift} shift</h1>
          <p className="text-gray-500 text-sm mt-1">{pour.location} | {pour.supplier} | Mix: {pour.mixId}</p>
        </div>
        <Link href={`/pours/${pourId}/edit`} className="text-sm text-blue-600 hover:underline">Edit</Link>
      </div>

      {/* Sample Sets */}
      <section className="mb-8">
        <h2 className="font-bold text-lg mb-3">Sample Sets</h2>
        <div className="space-y-2">
          {samples.map(s => (
            <Link
              key={s.id}
              href={`/samples/${s.id}`}
              className="flex items-center justify-between p-4 bg-white border rounded-lg hover:border-blue-400"
            >
              <div>
                <span className="font-medium">Ticket #{s.batchTicketNumber}</span>
                <span className={`ml-3 text-xs px-2 py-0.5 rounded-full ${
                  s.matchStatus === 'auto_matched' ? 'bg-green-100 text-green-700' :
                  s.matchStatus === 'manually_confirmed' ? 'bg-blue-100 text-blue-700' :
                  s.matchStatus === 'flagged' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{s.matchStatus.replace('_', ' ')}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                s.reportStatus === 'exported' ? 'bg-green-100 text-green-700' :
                s.reportStatus === 'ready_to_export' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-500'
              }`}>{s.reportStatus.replace('_', ' ')}</span>
            </Link>
          ))}
        </div>

        <div className="flex gap-2 mt-3">
          <input
            type="text"
            placeholder="Batch ticket number"
            value={newTicket}
            onChange={e => setNewTicket(e.target.value)}
            className="border rounded px-3 py-2 text-sm flex-1"
          />
          <button
            onClick={addSampleSet}
            disabled={addingTicket}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
          >
            Add Sample Set
          </button>
        </div>
      </section>

      {/* Combined PDF Upload */}
      <section className="mb-8">
        <h2 className="font-bold text-lg mb-3">Upload Combined Batch Ticket PDF</h2>
        <div className="bg-gray-50 border rounded-lg p-4">
          <input type="file" accept=".pdf" onChange={e => setUploadFile(e.target.files?.[0] ?? null)} className="text-sm mb-3 block" />
          <button
            onClick={uploadCombinedPdf}
            disabled={!uploadFile || uploading}
            className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {uploading ? 'Processing...' : 'Upload & Process'}
          </button>
          {uploadResult && <p className="mt-3 text-sm text-green-700">{uploadResult}</p>}
        </div>
      </section>

      {/* Bulk Download */}
      <section>
        <h2 className="font-bold text-lg mb-3">Download All Reports</h2>
        <a
          href={`/api/reports/bulk?pourId=${pourId}`}
          className="inline-block bg-gray-800 text-white px-4 py-2 rounded text-sm hover:bg-gray-900"
        >
          Download ZIP
        </a>
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Sample detail page**

Create `src/app/(dashboard)/samples/[sampleId]/page.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import type { SampleSet, BreakAge, PourEvent } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'
import { calculateAllBreakDates } from '@/lib/utils/break-dates'

const AGE_LABEL: Record<BreakAge, string> = {
  '1day': '1-Day', '3day': '3-Day', '4day': '4-Day', '5day': '5-Day',
  '7day': '7-Day', '14day': '14-Day', '28day': '28-Day',
  '56day': '56-Day', '90day': '90-Day', '120day': '120-Day',
}

export default function SampleDetailPage() {
  const { sampleId } = useParams<{ sampleId: string }>()
  const [sample, setSample] = useState<SampleSet | null>(null)
  const [pour, setPour] = useState<PourEvent | null>(null)
  const [breaks, setBreaks] = useState<Partial<Record<BreakAge, string>>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch(`/api/samples/${sampleId}`).then(r => r.json()).then((s: SampleSet) => {
      setSample(s)
      const init: Partial<Record<BreakAge, string>> = {}
      for (const age of BREAK_AGES) {
        if (s.breaks[age] != null) init[age] = String(s.breaks[age])
      }
      setBreaks(init)
      fetch(`/api/pours/${s.pourEventId}`).then(r => r.json()).then(setPour)
    })
  }, [sampleId])

  async function saveBreaks() {
    setSaving(true)
    const payload: Partial<Record<BreakAge, number>> = {}
    for (const age of BREAK_AGES) {
      const val = breaks[age]
      if (val && !isNaN(Number(val))) payload[age] = Number(val)
    }
    const res = await fetch(`/api/samples/${sampleId}/breaks`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const updated = await res.json()
    setSample(updated)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!sample || !pour) return <p className="text-gray-400">Loading...</p>

  const breakDates = calculateAllBreakDates(pour.date)

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Batch Ticket #{sample.batchTicketNumber}</h1>
      <p className="text-gray-500 text-sm mb-6">{pour.date} — {pour.location}</p>

      <div className="bg-white border rounded-lg overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3">Age</th>
              <th className="text-left px-4 py-3">Break Date</th>
              <th className="text-left px-4 py-3">PSI Result</th>
            </tr>
          </thead>
          <tbody>
            {BREAK_AGES.map(age => (
              <tr key={age} className="border-b">
                <td className="px-4 py-2 font-medium">{AGE_LABEL[age]}</td>
                <td className="px-4 py-2 text-gray-500">{breakDates[age]}</td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    placeholder="—"
                    value={breaks[age] ?? ''}
                    onChange={e => setBreaks(b => ({ ...b, [age]: e.target.value }))}
                    className="border rounded px-2 py-1 w-28 text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3">
        <button
          onClick={saveBreaks}
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Break Results'}
        </button>

        {sample.reportStatus !== 'pending_breaks' && (
          <a
            href={`/api/samples/${sampleId}/report`}
            className="bg-gray-800 text-white px-4 py-2 rounded text-sm hover:bg-gray-900"
          >
            Download Report PDF
          </a>
        )}
      </div>

      {sample.ticketFileUrl && (
        <div className="mt-6">
          <h2 className="font-bold mb-2">Attached Batch Ticket</h2>
          <a href={sample.ticketFileUrl} target="_blank" className="text-blue-600 hover:underline text-sm">
            View Ticket PDF
          </a>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/
git commit -m "feat: add core UI pages for pour log and sample sets"
```

---

## Task 19: Edit Pour Page & Admin Page

**Files:**
- Create: `src/app/(dashboard)/pours/[pourId]/edit/page.tsx`, `src/app/(dashboard)/admin/page.tsx`

- [ ] **Step 1: Edit pour page**

Create `src/app/(dashboard)/pours/[pourId]/edit/page.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { PourEvent } from '@/lib/types'

export default function EditPourPage() {
  const { pourId } = useParams<{ pourId: string }>()
  const router = useRouter()
  const [form, setForm] = useState<Partial<PourEvent>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/pours/${pourId}`).then(r => r.json()).then(setForm)
  }, [pourId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch(`/api/pours/${pourId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    router.push(`/pours/${pourId}`)
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Edit Pour Event</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {(['date', 'spec', 'location', 'description', 'supplier', 'mixId'] as const).map(key => (
          <div key={key}>
            <label className="block text-sm font-medium mb-1 capitalize">{key.replace('mixId', 'Mix ID')}</label>
            <input
              type={key === 'date' ? 'date' : 'text'}
              value={form[key] ?? ''}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        ))}
        <div>
          <label className="block text-sm font-medium mb-1">Shift</label>
          <select value={form.shift ?? 'day'} onChange={e => setForm(f => ({ ...f, shift: e.target.value as 'day' | 'night' }))} className="w-full border rounded px-3 py-2 text-sm">
            <option value="day">Day</option>
            <option value="night">Night</option>
          </select>
        </div>
        <button type="submit" disabled={saving} className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Admin page**

Create `src/app/(dashboard)/admin/page.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import type { AppUser, Role } from '@/lib/types'

const ROLES: Role[] = [
  'lab_tech', 'lab_manager', 'office_manager', 'field_tech',
  'concrete_qc_manager', 'qc_manager', 'alt_qc_manager',
]

export default function AdminPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'lab_tech' as Role })
  const [adding, setAdding] = useState(false)
  const [templateFile, setTemplateFile] = useState<File | null>(null)
  const [uploadingTemplate, setUploadingTemplate] = useState(false)
  const [templateUrl, setTemplateUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/users').then(r => r.json()).then(setUsers).catch(() => {})
    fetch('/api/admin/template').then(r => r.json()).then(d => setTemplateUrl(d.url)).catch(() => {})
  }, [])

  async function addUser(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newUser, newRole: newUser.role }),
    })
    const user = await res.json()
    setUsers(u => [...u, user])
    setNewUser({ name: '', email: '', password: '', role: 'lab_tech' })
    setAdding(false)
  }

  async function uploadTemplate() {
    if (!templateFile) return
    setUploadingTemplate(true)
    const fd = new FormData()
    fd.append('file', templateFile)
    const res = await fetch('/api/admin/template', { method: 'POST', body: fd })
    const data = await res.json()
    setTemplateUrl(data.url)
    setUploadingTemplate(false)
  }

  return (
    <div className="max-w-3xl space-y-10">
      <section>
        <h1 className="text-2xl font-bold mb-6">Admin</h1>

        <h2 className="font-bold text-lg mb-4">Team Members</h2>
        <div className="bg-white border rounded-lg overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b">
                  <td className="px-4 py-3">{u.name}</td>
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3 capitalize">{u.role.replace(/_/g, ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="font-medium mb-3">Add Team Member</h3>
        <form onSubmit={addUser} className="grid grid-cols-2 gap-3">
          <input placeholder="Full name" required value={newUser.name} onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))} className="border rounded px-3 py-2 text-sm" />
          <input placeholder="Email" type="email" required value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} className="border rounded px-3 py-2 text-sm" />
          <input placeholder="Temporary password" type="password" required value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} className="border rounded px-3 py-2 text-sm" />
          <select value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value as Role }))} className="border rounded px-3 py-2 text-sm">
            {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
          </select>
          <button type="submit" disabled={adding} className="col-span-2 bg-blue-600 text-white py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
            {adding ? 'Adding...' : 'Add Member'}
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-bold text-lg mb-4">Excel Report Template</h2>
        {templateUrl && <p className="text-sm text-green-700 mb-3">Template uploaded. <a href={templateUrl} className="underline">View</a></p>}
        <input type="file" accept=".xlsx" onChange={e => setTemplateFile(e.target.files?.[0] ?? null)} className="text-sm mb-3 block" />
        <button onClick={uploadTemplate} disabled={!templateFile || uploadingTemplate} className="bg-gray-800 text-white px-4 py-2 rounded text-sm hover:bg-gray-900 disabled:opacity-50">
          {uploadingTemplate ? 'Uploading...' : 'Upload Template'}
        </button>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/pours/ src/app/\(dashboard\)/admin/
git commit -m "feat: add edit pour and admin UI pages"
```

---

## Task 20: Deploy to Vercel

- [ ] **Step 1: Initialize git and push**

```bash
git remote add origin https://github.com/YOUR_ORG/concrete-compression.git
git push -u origin main
```

- [ ] **Step 2: Link to Vercel**

```bash
npx vercel link
```
Follow prompts to link to Vercel project.

- [ ] **Step 3: Set environment variables in Vercel**

In the Vercel dashboard → Project Settings → Environment Variables, add all variables from `.env.local`:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL`
- `DATABASE_URL`
- `ANTHROPIC_API_KEY`
- `BLOB_READ_WRITE_TOKEN`

- [ ] **Step 4: Deploy**

```bash
npx vercel --prod
```
Expected: deployment URL printed. Visit it and verify sign-in works.

- [ ] **Step 5: Verify full flow**

1. Sign in as Lab Manager
2. Create a new pour event using the scan-to-fill
3. Add a sample set
4. Upload a combined PDF
5. Verify tickets are split and matched
6. Enter break results
7. Download individual report PDF — verify it contains the compression table and batch ticket appended
8. Download bulk ZIP — verify it contains one PDF per sample set

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: complete concrete compression report tool"
```

---

## Self-Review Against Spec

| Spec Requirement | Covered In |
|---|---|
| Date, spec, location, description, supplier, mix ID fields | Task 12, 18 |
| Cylinder ages 1–120 day | Task 2 (types), Task 13 (API), Task 18 (UI) |
| One pour event per day/night shift | Task 12 (shift field), Task 18 |
| Multiple sample sets per pour | Task 13, 18 |
| Each batch ticket = one report | Task 14 (report API) |
| Scan/photo to auto-fill log | Task 9, 18 |
| Combined PDF upload + splitting | Task 7, 15 |
| Claude Vision extraction + auto-match | Task 9, 15 |
| 1–2 page ticket grouping | Task 15 |
| Store all tickets (matched + unmatched) | Task 15 |
| Flag uncertain matches | Task 6, 15 |
| Manual match confirmation | Task 15 (confirm API), 18 |
| Break results locked to lab_tech/lab_manager | Task 13 |
| Log entry locked after submit; lab_manager can edit | Task 12, 19 |
| Report auto-updates when break added | Task 13 (reportStatus update) |
| Path A: Excel template PDF | Admin upload Task 19; report uses @react-pdf/renderer layout |
| Path B: Web layout PDF | Task 10, 14 |
| Batch ticket scan appended to report | Task 8, 14 |
| Individual download | Task 18 (download link) |
| Bulk ZIP on request | Task 16, 18 |
| 7 roles with correct permissions | Task 4 |
| User management by lab_manager | Task 17, 19 |
| Excel template upload in admin | Task 17, 19 |
| Modular for future report types | lib/ structure cleanly separates by concern |
