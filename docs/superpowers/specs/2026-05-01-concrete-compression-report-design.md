# Concrete Compression Report Tool — Design Spec

**Date:** 2026-05-01
**Status:** Approved
**Project:** Standalone (feeds into Complitek later as file uploads)

---

## Overview

A standalone web application that automates the creation of concrete compression reports for federal construction projects. The system logs pour events, tracks cylinder break results over time, extracts and matches scanned batch tickets using Claude Vision AI, and generates ready-to-submit PDF reports. Built to eventually export files into Complitek, but operates independently for now.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend + API | Next.js (App Router) |
| Database | Neon (PostgreSQL, cloud-hosted) |
| Deployment | Vercel |
| AI | Claude API (Vision) |
| File Storage | Vercel Blob (scanned tickets, generated PDFs) |
| Auth | Clerk (team login with roles) |
| PDF manipulation | pdf-lib (split, merge, append) |
| Excel filling | ExcelJS |
| PDF rendering | @react-pdf/renderer (web layout path) |

---

## Core Concept

- One **Pour Event** per day or night shift
- Each pour event has multiple **Sample Sets** — one per batch ticket that had cylinders pulled
- Each pour event also stores all **Ticket Records** from the combined PDF upload (for company records), whether or not they have samples
- Each Sample Set generates exactly one compression report
- The batch ticket number is the key that links a scanned ticket to a sample set

---

## Data Structure

### Pour Event
- Date of placement
- Shift (day / night)
- Specification section
- Location
- Description
- Supplier
- Mix ID
- Created by (user)
- Created at (timestamp)

### Sample Set (one per batch ticket with cylinders pulled)
- Linked to Pour Event
- Batch ticket number
- Extracted batch ticket file (individual page(s) from combined PDF)
- Match status: `auto_matched` | `manually_confirmed` | `flagged` | `unmatched`
- Break results (PSI values, entered as lab results come in):
  - 1-day, 3-day, 4-day, 5-day, 7-day, 14-day, 28-day, 56-day, 90-day, 120-day
- Break dates (calculated from placement date + cylinder age)
- Report status: `pending_breaks` | `ready_to_export` | `exported`
  - A report becomes `ready_to_export` once at least one break result has been entered. Users can export at any point — the report always reflects whatever breaks have been entered so far.

### Ticket Record (all tickets from combined PDF)
- Linked to Pour Event
- Batch ticket number (extracted by Claude Vision)
- Page range within the original combined PDF
- Extracted individual file (stored for records)
- Linked Sample Set (nullable — null if no samples were taken from this truck)

---

## Workflow

### 1. Create a Pour Event & Log Samples

Any authorized user photographs or scans a batch ticket. Claude Vision reads the image and pre-fills the pour log form:
- Date, supplier, mix ID, batch ticket number, and any other readable fields

The user reviews, corrects if needed, and submits. This creates the Pour Event and the first Sample Set. Additional sample sets are added the same way — photograph the ticket for each truck that had cylinders pulled.

Once submitted, the log entry is locked. Only the Lab Manager can edit it.

### 2. Upload Combined Batch Ticket PDF

A user uploads the full day's batch ticket PDF (all trucks) and selects which Pour Event it belongs to. The system:
1. Splits the PDF page by page, grouping into individual tickets (1–2 pages per ticket)
2. Sends each ticket to Claude Vision to extract the batch ticket number and any other data
3. Compares each extracted number against the Sample Sets logged for that pour
4. Auto-matches tickets where the number is found in the log
5. Stores all tickets as Ticket Records (matched and unmatched) linked to the Pour Event
6. Flags any tickets Claude is not confident about for manual confirmation

### 3. Confirm Flagged Matches

Authorized users review flagged tickets — see the ticket image alongside the log entry — and confirm or reject the match. This is the only manual step in the matching process.

### 4. Enter Break Results

As cylinder break results come back from the lab, the Lab Tech or Lab Manager opens the sample set and enters the PSI value for the relevant cylinder age. The report updates automatically each time a result is entered.

### 5. Export Reports

When a sample set is ready (required breaks entered), a user generates the report. Two export paths:

**Path A — Excel Template:**
Fill the existing Excel template programmatically with all pour and break data, convert to PDF, then append the extracted batch ticket scan using pdf-lib. Output: one combined PDF. The Excel template file is uploaded once during initial setup and stored in the system.

**Path B — Web Layout:**
Render the report using the built-in web layout (mirrors the Excel format), export to PDF, then append the extracted batch ticket scan using pdf-lib. Output: one combined PDF.

Both paths produce an identical, self-contained PDF per sample set ready to submit to the government.

### 6. Download

- **Individual:** Download a single report PDF at any time from the sample set record
- **Bulk ZIP:** On request, download all reports for a pour event (or a date range) as a ZIP file — drop into any shared folder (OneDrive, Google Drive, Dropbox, SharePoint)

---

## Roles & Permissions

| Action | Lab Tech | Lab Manager | Office Manager | Field Tech | Concrete QC Mgr | QC Manager | Alt QC Manager |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Scan/photo ticket to create log entry | Yes | Yes | Yes | Yes | | | |
| Upload combined batch ticket PDF | Yes | Yes | Yes | | | | |
| Confirm flagged ticket matches | Yes | Yes | Yes | | | | |
| Enter break results | Yes | Yes | | | | | |
| Edit submitted log entry | | Yes only | | | | | |
| Download individual reports | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Bulk ZIP download | Yes | Yes | Yes | Yes | Yes | Yes | Yes |

Additional roles can be added without rebuilding the permission system.

**User Management:** Team member accounts are created and managed by the Lab Manager through an admin panel. Each account is assigned one role at creation.

---

## Batch Ticket Splitting Logic

- Claude Vision processes each page of the uploaded PDF
- A new ticket begins when Claude detects a new ticket header (supplier name, ticket number, date block)
- Tickets are 1 page in most cases, up to 2 pages
- Each extracted ticket is saved as an individual file in storage
- The original combined PDF is also retained for records

---

## Report Content

Each compression report PDF contains:
1. Pour event data (date, spec, location, description, supplier, mix ID)
2. Batch ticket number
3. All cylinder break results entered to date (PSI values + break dates)
4. Appended: the extracted batch ticket scan

---

## Future Extensibility

The system is built modularly so additional material testing report types can be added later following the same pattern:

- Soil compaction reports
- Aggregate testing reports
- Other material certifications

Each new type would have its own log form, break/result tracker, report template, and export path — sharing the same auth, file storage, and PDF generation infrastructure.

---

## Out of Scope (for now)

- Integration with Complitek (reports are exported as files for manual upload)
- Direct push to OneDrive, Google Drive, Dropbox, or SharePoint (bulk ZIP handles this)
- Soil, aggregate, or other report types (architecture supports them, not building yet)
- Additional roles beyond the seven defined above
