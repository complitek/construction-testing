import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { pourEvents, sampleSets } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { BREAK_AGES } from '@/lib/types'
import type { BreakAge } from '@/lib/types'

export const maxDuration = 60

const AGE_LABEL: Record<BreakAge, string> = {
  '1day': '1d', '3day': '3d', '4day': '4d', '5day': '5d', '7day': '7d',
  '14day': '14d', '28day': '28d', '56day': '56d', '90day': '90d', '120day': '120d',
}

async function getLogRows() {
  const pours = await db.select().from(pourEvents).orderBy(desc(pourEvents.date))
  const rows = []
  for (const pour of pours) {
    const samples = await db.select().from(sampleSets).where(eq(sampleSets.pourEventId, pour.id))
    for (const s of samples) {
      const breaks: Partial<Record<BreakAge, number>> = {}
      const ageMap: Record<BreakAge, number | null> = {
        '1day': s.break1day, '3day': s.break3day, '4day': s.break4day,
        '5day': s.break5day, '7day': s.break7day, '14day': s.break14day,
        '28day': s.break28day, '56day': s.break56day, '90day': s.break90day,
        '120day': s.break120day,
      }
      for (const age of BREAK_AGES) {
        if (ageMap[age] != null) breaks[age] = ageMap[age]!
      }
      rows.push({ pour, sample: s, breaks })
    }
  }
  return rows
}

async function generatePdf(rows: Awaited<ReturnType<typeof getLogRows>>) {
  const { Document, Page, Text, View, StyleSheet, renderToBuffer } = await import('@react-pdf/renderer')
  const React = await import('react')

  const styles = StyleSheet.create({
    page: { padding: 24, fontSize: 7, fontFamily: 'Helvetica' },
    title: { fontSize: 11, fontWeight: 'bold', textAlign: 'center', marginBottom: 10 },
    header: { flexDirection: 'row', backgroundColor: '#1f2937', color: 'white', padding: '4 3', fontWeight: 'bold' },
    row: { flexDirection: 'row', padding: '3 3', borderBottom: '0.5px solid #e5e7eb' },
    rowAlt: { flexDirection: 'row', padding: '3 3', borderBottom: '0.5px solid #e5e7eb', backgroundColor: '#f9fafb' },
    c1: { width: '7%' },
    c2: { width: '4%' },
    c3: { width: '8%' },
    c4: { width: '10%' },
    c5: { width: '8%' },
    c6: { width: '6%' },
    c7: { width: '7%' },
    cBreak: { width: '4%', textAlign: 'center' },
    cStatus: { width: '10%' },
  })

  const doc = React.createElement(Document, null,
    React.createElement(Page, { size: 'LETTER', orientation: 'landscape', style: styles.page },
      React.createElement(Text, { style: styles.title }, 'MASTER CONCRETE COMPRESSION LOG'),
      React.createElement(View, { style: styles.header },
        React.createElement(Text, { style: styles.c1 }, 'Date'),
        React.createElement(Text, { style: styles.c2 }, 'Shft'),
        React.createElement(Text, { style: styles.c3 }, 'Spec'),
        React.createElement(Text, { style: styles.c4 }, 'Location'),
        React.createElement(Text, { style: styles.c5 }, 'Supplier'),
        React.createElement(Text, { style: styles.c6 }, 'Mix ID'),
        React.createElement(Text, { style: styles.c7 }, 'Ticket #'),
        ...BREAK_AGES.map(age => React.createElement(Text, { key: age, style: styles.cBreak }, AGE_LABEL[age])),
        React.createElement(Text, { style: styles.cStatus }, 'Status'),
      ),
      ...rows.map((r, i) =>
        React.createElement(View, { key: r.sample.id, style: i % 2 === 0 ? styles.row : styles.rowAlt },
          React.createElement(Text, { style: styles.c1 }, r.pour.date),
          React.createElement(Text, { style: styles.c2 }, r.pour.shift),
          React.createElement(Text, { style: styles.c3 }, r.pour.spec),
          React.createElement(Text, { style: styles.c4 }, r.pour.location),
          React.createElement(Text, { style: styles.c5 }, r.pour.supplier),
          React.createElement(Text, { style: styles.c6 }, r.pour.mixId),
          React.createElement(Text, { style: styles.c7 }, r.sample.batchTicketNumber),
          ...BREAK_AGES.map(age => React.createElement(Text, { key: age, style: styles.cBreak },
            r.breaks[age] != null ? String(r.breaks[age]) : ''
          )),
          React.createElement(Text, { style: styles.cStatus }, r.sample.reportStatus.replace(/_/g, ' ')),
        )
      )
    )
  )

  return renderToBuffer(doc)
}

async function generateXlsx(rows: Awaited<ReturnType<typeof getLogRows>>) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Master Concrete Log')

  const headers = [
    'Date', 'Shift', 'Spec', 'Location', 'Description', 'Supplier', 'Mix ID', 'Ticket #',
    'Temp (°F)', 'Slump/Spread (in)', 'Unit Weight (pcf)', 'Air Content (%)',
    ...BREAK_AGES.map(a => AGE_LABEL[a]),
    'Status',
  ]

  ws.addRow(headers)
  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
  headerRow.alignment = { horizontal: 'center' }

  for (const r of rows) {
    const row = [
      r.pour.date, r.pour.shift, r.pour.spec, r.pour.location, r.pour.description,
      r.pour.supplier, r.pour.mixId, r.sample.batchTicketNumber,
      r.sample.temperature ?? '', r.sample.slump ?? '', r.sample.unitWeight ?? '', r.sample.airContent ?? '',
      ...BREAK_AGES.map(age => r.breaks[age] ?? ''),
      r.sample.reportStatus.replace(/_/g, ' '),
    ]
    ws.addRow(row)
  }

  ws.columns.forEach(col => { col.width = 12 })
  ws.getColumn(4).width = 20
  ws.getColumn(5).width = 20

  return Buffer.from(await wb.xlsx.writeBuffer())
}

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const format = new URL(request.url).searchParams.get('format') ?? 'xlsx'
  const rows = await getLogRows()

  if (format === 'pdf') {
    const buf = await generatePdf(rows)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="master-concrete-log-${Date.now()}.pdf"`,
      },
    })
  }

  const buf = await generateXlsx(rows)
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="master-concrete-log-${Date.now()}.xlsx"`,
    },
  })
}
