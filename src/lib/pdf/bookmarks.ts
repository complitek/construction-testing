import { PDFDocument, PDFName, PDFString } from 'pdf-lib'

export interface BookmarkItem {
  /** Display title (e.g. "November 10, 2025") */
  title: string
  /** Zero-based page index this bookmark should jump to */
  pageIndex: number
}

/**
 * Adds a flat outline (bookmark panel entries) to a merged PDF. pdf-lib
 * doesn't expose outlines, so we build the /Outlines dict directly using
 * the low-level PDFContext API. Items are written in the order given.
 *
 * Each bookmark jumps to the page with `/Dest [<page ref> /Fit]` so most
 * PDF viewers (Adobe Reader, Preview, Chrome) auto-fit the page width.
 *
 * Sets `/PageMode /UseOutlines` on the catalog so the bookmarks panel
 * opens automatically when the file is opened.
 */
export function addOutlineBookmarks(doc: PDFDocument, items: BookmarkItem[]): void {
  if (items.length === 0) return

  const ctx = doc.context
  const pages = doc.getPages()

  // Pre-allocate refs so siblings can reference each other (Prev/Next).
  const outlinesRef = ctx.nextRef()
  const itemRefs = items.map(() => ctx.nextRef())

  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (it.pageIndex < 0 || it.pageIndex >= pages.length) continue
    const pageRef = pages[it.pageIndex].ref

    const dictEntries: Record<string, unknown> = {
      Title: PDFString.of(it.title),
      Parent: outlinesRef,
      Dest: ctx.obj([pageRef, PDFName.of('Fit')]),
    }
    if (i > 0) dictEntries.Prev = itemRefs[i - 1]
    if (i < items.length - 1) dictEntries.Next = itemRefs[i + 1]

    ctx.assign(itemRefs[i], ctx.obj(dictEntries))
  }

  ctx.assign(outlinesRef, ctx.obj({
    Type: PDFName.of('Outlines'),
    First: itemRefs[0],
    Last: itemRefs[itemRefs.length - 1],
    Count: items.length,
  }))

  doc.catalog.set(PDFName.of('Outlines'), outlinesRef)
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'))
}

/** Pretty-prints an ISO date string (YYYY-MM-DD) as "Month D, YYYY". */
export function formatBookmarkDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Pulls PFU numbers and Cell numbers out of a free-form location string.
 * Tickets / pour locations come through in many shapes:
 *   "PFU 1-Cell 23-Set 1"
 *   "PFU 6 Cells 1,2,3,4"
 *   "PFU 1-Cell 19"
 * We extract distinct numbers for both and let the caller format them.
 */
export function extractPfuCells(location: string | null | undefined): { pfus: string[]; cells: string[] } {
  if (!location) return { pfus: [], cells: [] }
  const pfus = new Set<string>()
  const cells = new Set<string>()
  for (const m of location.matchAll(/PFU\s*(\d+)/gi)) pfus.add(m[1])
  for (const m of location.matchAll(/Cells?\s*([\d,\s]+)/gi)) {
    for (const n of m[1].split(/[,\s]+/).map(s => s.trim()).filter(Boolean)) {
      // Stop reading once we hit a non-numeric token (e.g. "Set" continues the
      // string after the cell number — we don't want "1Set" pulled in).
      if (/^\d+$/.test(n)) cells.add(n)
    }
  }
  const numericSort = (a: string, b: string) => Number(a) - Number(b)
  return { pfus: [...pfus].sort(numericSort), cells: [...cells].sort(numericSort) }
}

/**
 * Builds a bookmark title that combines a date with the PFU/Cell coverage
 * across all locations for that day. Examples:
 *   "November 10, 2025 — PFU 1 — Cells 19, 23, 24"
 *   "January 5, 2026 — PFU 6 — Cells 1, 2, 3, 4"
 *   "November 14, 2025"  (when no PFU/Cell info parses out)
 */
export function buildDatePfuCellTitle(isoDate: string, locations: Array<string | null | undefined>): string {
  const allPfus = new Set<string>()
  const allCells = new Set<string>()
  for (const loc of locations) {
    const { pfus, cells } = extractPfuCells(loc)
    pfus.forEach(p => allPfus.add(p))
    cells.forEach(c => allCells.add(c))
  }
  const numericSort = (a: string, b: string) => Number(a) - Number(b)
  const pfus = [...allPfus].sort(numericSort)
  const cells = [...allCells].sort(numericSort)

  let title = formatBookmarkDate(isoDate)
  if (pfus.length > 0) {
    title += ' — ' + (pfus.length === 1 ? `PFU ${pfus[0]}` : `PFUs ${pfus.join(', ')}`)
  }
  if (cells.length > 0) {
    title += ' — ' + (cells.length === 1 ? `Cell ${cells[0]}` : `Cells ${cells.join(', ')}`)
  }
  return title
}
