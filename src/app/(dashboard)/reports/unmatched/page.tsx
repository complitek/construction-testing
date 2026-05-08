'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { UnmatchedReport, UnmatchedReportsResponse } from '@/app/api/reports/unmatched/route'

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function groupByMonth(rows: UnmatchedReport[]): Map<string, UnmatchedReport[]> {
  const out = new Map<string, UnmatchedReport[]>()
  for (const r of rows) {
    const ym = r.date.slice(0, 7)
    if (!out.has(ym)) out.set(ym, [])
    out.get(ym)!.push(r)
  }
  return out
}

export default function UnmatchedReportsPage() {
  const [data, setData] = useState<UnmatchedReportsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  // 'all' shows both sections; 'pw' or 'dd5' temporarily hides the other
  // section so window.print() captures only the chosen report.
  const [printScope, setPrintScope] = useState<'all' | 'pw' | 'dd5'>('all')

  useEffect(() => {
    fetch('/api/reports/unmatched')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [])

  function printOnly(scope: 'pw' | 'dd5' | 'all') {
    setPrintScope(scope)
    // Wait one tick so the DOM applies the hide-class before the print dialog.
    setTimeout(() => {
      window.print()
      setPrintScope('all')
    }, 50)
  }

  const pwByMonth = useMemo(() => data ? groupByMonth(data.pw) : new Map<string, UnmatchedReport[]>(), [data])
  const dd5ByMonth = useMemo(() => data ? groupByMonth(data.dd5) : new Map<string, UnmatchedReport[]>(), [data])
  const pwMonths = useMemo(() => [...pwByMonth.keys()].sort(), [pwByMonth])
  const dd5Months = useMemo(() => [...dd5ByMonth.keys()].sort(), [dd5ByMonth])

  if (loading) return <p className="text-gray-400 p-8">Loading…</p>
  if (!data) return <p className="text-red-600 p-8">Failed to load.</p>

  function MonthTable({ rows, ym }: { rows: UnmatchedReport[]; ym: string }) {
    return (
      <div className="month-group mb-5">
        <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-1 mb-1">
          {monthLabel(ym)}
          <span className="ml-2 text-xs font-normal text-gray-500">({rows.length})</span>
        </h3>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="px-2 py-1.5 border w-20">Date</th>
              <th className="px-2 py-1.5 border">Location / Description</th>
              <th className="px-2 py-1.5 border w-32">Batch Ticket #</th>
              <th className="px-2 py-1.5 border w-32">Mix ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-2 py-1 border whitespace-nowrap">{fmtDate(r.date)}</td>
                <td className="px-2 py-1 border">{r.location ?? '—'}</td>
                <td className="px-2 py-1 border font-mono">{r.batchTicketNumber ?? '—'}</td>
                <td className="px-2 py-1 border font-mono text-gray-600">{r.mixId ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // Build a header that reflects what's being printed — title + counts.
  const reportTitle =
    printScope === 'pw' ? 'Unmatched Project Wide Compression Reports'
    : printScope === 'dd5' ? 'Unmatched DD5 PFU Tremie Compression Reports'
    : 'Unmatched Compression Reports'

  return (
    <div className={
      printScope === 'pw' ? 'print-pw-only'
      : printScope === 'dd5' ? 'print-dd5-only'
      : ''
    }>
      {/* Print stylesheet — hides nav and per-section toggles for split prints */}
      <style jsx global>{`
        @media print {
          nav, .no-print { display: none !important; }
          main { max-width: none !important; padding: 0 !important; }
          body { background: white !important; }
          .month-group { break-inside: avoid; }
          .section-break { break-before: page; }
          .print-pw-only .dd5-section { display: none !important; }
          .print-pw-only .section-break { break-before: auto !important; }
          .print-dd5-only .pw-section { display: none !important; }
          .print-dd5-only .section-break { break-before: auto !important; }
          table { font-size: 10pt; }
          h1 { font-size: 16pt; }
          h2 { font-size: 14pt; }
          h3 { font-size: 11pt; }
        }
        @page { margin: 0.5in; }
      `}</style>

      {/* Breadcrumb + actions (hidden on print) */}
      <div className="no-print flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <Link href="/" className="hover:text-blue-600">Construction Testing</Link>
          <span>›</span>
          <Link href="/concrete" className="hover:text-blue-600">Concrete</Link>
          <span>›</span>
          <span className="text-gray-900 font-medium">Unmatched Reports</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => printOnly('pw')}
            disabled={data.pw.length === 0}
            className="bg-white hover:bg-blue-50 border border-blue-300 text-blue-700 px-3 py-2 rounded text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Print Project Wide ({data.pw.length})
          </button>
          <button
            onClick={() => printOnly('dd5')}
            disabled={data.dd5.length === 0}
            className="bg-white hover:bg-blue-50 border border-blue-300 text-blue-700 px-3 py-2 rounded text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Print DD5 PFU Tremie ({data.dd5.length})
          </button>
          <button
            onClick={() => printOnly('all')}
            disabled={data.pw.length + data.dd5.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Print All
          </button>
        </div>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">{reportTitle}</h1>
        <p className="text-sm text-gray-600">
          {printScope === 'pw' ? (
            <>Project Wide reports without a batch ticket scan attached, grouped by month. <span className="font-medium">{data.pw.length}</span> total</>
          ) : printScope === 'dd5' ? (
            <>DD5 PFU Tremie reports without a batch ticket scan attached, grouped by month. <span className="font-medium">{data.dd5.length}</span> total</>
          ) : (
            <>
              Reports without a batch ticket scan attached, separated by report type and grouped by month.{' '}
              <span className="font-medium">{data.pw.length}</span> PW &middot;{' '}
              <span className="font-medium">{data.dd5.length}</span> DD5 PFU Tremie &middot;{' '}
              <span className="font-medium">{data.pw.length + data.dd5.length}</span> total
            </>
          )}
        </p>
        <p className="text-xs text-gray-500 mt-1">Generated {new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}</p>
      </div>

      {data.pw.length === 0 && data.dd5.length === 0 ? (
        <p className="text-gray-500 py-8 text-center">All reports have a batch ticket attached. ✓</p>
      ) : (
        <>
          {/* Project Wide section */}
          <section className="pw-section mb-10">
            <h2 className="text-xl font-bold border-b-2 border-gray-800 pb-1 mb-4">
              Project Wide
              <span className="ml-3 text-sm font-normal text-gray-500">({data.pw.length} unmatched)</span>
            </h2>
            {pwMonths.length === 0
              ? <p className="text-sm text-gray-500 italic">All Project Wide reports have a batch ticket attached.</p>
              : pwMonths.map(ym => <MonthTable key={ym} rows={pwByMonth.get(ym)!} ym={ym} />)
            }
          </section>

          {/* DD5 PFU Tremie section — page break before it on print (when both visible) */}
          <section className="dd5-section section-break">
            <h2 className="text-xl font-bold border-b-2 border-gray-800 pb-1 mb-4">
              DD5 PFU Tremie
              <span className="ml-3 text-sm font-normal text-gray-500">({data.dd5.length} unmatched)</span>
            </h2>
            {dd5Months.length === 0
              ? <p className="text-sm text-gray-500 italic">All DD5 PFU Tremie reports have a batch ticket attached.</p>
              : dd5Months.map(ym => <MonthTable key={ym} rows={dd5ByMonth.get(ym)!} ym={ym} />)
            }
          </section>
        </>
      )}
    </div>
  )
}
