import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { ticketRecords, pourEvents } from '@/lib/db/schema'
import { eq, gte, lte, isNotNull, or, and } from 'drizzle-orm'
import { createZipFromPdfs } from '@/lib/utils/zip'


export const maxDuration = 120

function buildTicketFilename(
  ticketDate: string | null,
  pourDate: string | null,
  batchTicketNumber: string | null
): string {
  const date = ticketDate ?? pourDate
  const dateStr = date ? date.replace(/-/g, '') : 'UNKNOWN'
  const ticketStr = (batchTicketNumber ?? 'Unknown').replace(/[^a-zA-Z0-9\-]/g, '_')
  return `${dateStr}_Batch_ticket_${ticketStr}.pdf`
}

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const month = url.searchParams.get('month') // YYYY-MM
  if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 })

  const [y, m] = month.split('-')
  const dateFrom = `${y}-${m.padStart(2, '0')}-01`
  const lastDay = new Date(Number(y), Number(m), 0).getDate()
  const dateTo = `${y}-${m.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const rows = await db.select({
    id: ticketRecords.id,
    fileUrl: ticketRecords.fileUrl,
    batchTicketNumber: ticketRecords.batchTicketNumber,
    ticketDate: ticketRecords.ticketDate,
    pourDate: pourEvents.date,
    pourLocation: pourEvents.location,
  })
    .from(ticketRecords)
    .leftJoin(pourEvents, eq(ticketRecords.pourEventId, pourEvents.id))
    .where(
      or(
        and(isNotNull(pourEvents.date), gte(pourEvents.date, dateFrom), lte(pourEvents.date, dateTo)),
        and(isNotNull(ticketRecords.ticketDate), gte(ticketRecords.ticketDate, dateFrom), lte(ticketRecords.ticketDate, dateTo))
      )
    )

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No tickets found for this month' }, { status: 404 })
  }

  const files: Array<{ name: string; data: Uint8Array }> = []
  const seen = new Set<string>()

  async function fetchOne(url: string, attempts = 3): Promise<Uint8Array | null> {
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
        })
        if (!res.ok) return null
        return new Uint8Array(await res.arrayBuffer())
      } catch (e) {
        if (i === attempts - 1) {
          console.error(`[bulk-month] fetch failed after ${attempts} attempts:`, (e as Error).message)
          return null
        }
        await new Promise(r => setTimeout(r, 300 * (i + 1)))
      }
    }
    return null
  }

  // Bound concurrency to 8 — Vercel Blob drops connections when hammered.
  const POOL = 8
  let cursor = 0
  const t0 = Date.now()
  async function worker() {
    while (cursor < rows.length) {
      const i = cursor++
      const rec = rows[i]
      const bytes = await fetchOne(rec.fileUrl)
      if (!bytes) continue

      let filename = buildTicketFilename(rec.ticketDate, rec.pourDate, rec.batchTicketNumber)
      if (seen.has(filename)) {
        const base = filename.replace(/\.pdf$/, '')
        let n = 2
        while (seen.has(`${base}_${n}.pdf`)) n++
        filename = `${base}_${n}.pdf`
      }
      seen.add(filename)
      files.push({ name: filename, data: bytes })
    }
  }
  await Promise.all(Array.from({ length: POOL }, worker))
  console.log(`[bulk-month] fetched ${files.length}/${rows.length} tickets in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  if (files.length === 0) {
    return NextResponse.json({ error: 'Could not retrieve ticket files' }, { status: 500 })
  }

  const zipBytes = await createZipFromPdfs(files)
  const label = month.replace('-', '_')

  return new NextResponse(Buffer.from(zipBytes), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="batch-tickets-${label}.zip"`,
    },
  })
}
