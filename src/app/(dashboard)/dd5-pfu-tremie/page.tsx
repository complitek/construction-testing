'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import DropZone from '@/components/DropZone'
import type { SummaryRow } from '@/app/api/summary/route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function d(v: string | null | undefined) { return v ?? '—' }
function n(v: number | null | undefined, dec = 0) {
  if (v == null) return '—'
  return dec > 0 ? v.toFixed(dec) : String(v)
}
function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
}

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function formatMonthLabel(key: string): string {
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const COMP: Record<string, string> = {
  YES: 'bg-green-100 text-green-700',
  NO: 'bg-red-100 text-red-700 font-semibold',
  NA: 'bg-gray-100 text-gray-500',
}

function complianceBadge(val: string | null) {
  if (!val) return <span className="text-gray-400 text-xs">pending</span>
  const upper = val.toUpperCase()
  const key = upper.includes('YES') ? 'YES' : upper.includes('NO') ? 'NO' : upper.includes('N/A') || upper.includes('NA') ? 'NA' : null
  if (!key) return <span className="text-gray-500 text-xs">{val}</span>
  const label = key === 'YES' ? 'PASS' : key === 'NO' ? 'FAIL' : 'N/A'
  return <span className={`px-2 py-0.5 rounded-full text-xs ${COMP[key]}`}>{label}</span>
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DD5PFUTremiePage() {
  const [rows, setRows] = useState<SummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/summary').then(r => r.json()).then((data: SummaryRow[]) => {
      setRows(Array.isArray(data) ? data : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  function toggleMonth(key: string) {
    setOpenMonths(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  async function importSummary() {
    if (!importFile) return
    setImporting(true)
    setImportResult(null)
    try {
      const fd = new FormData()
      fd.append('file', importFile)
      const res = await fetch('/api/summary/import', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error ?? 'Import failed')
        return
      }
      const data = await res.json()
      setImportResult(data)
      setImportFile(null)
      fetch('/api/summary').then(r => r.json()).then((d: SummaryRow[]) => setRows(Array.isArray(d) ? d : []))
    } finally {
      setImporting(false)
    }
  }

  const filtered = rows.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return [r.locationDescription, r.batchTicketNumber, r.mixId, r.area, r.structure, r.dfow]
      .some(v => v?.toLowerCase().includes(q))
  })

  // Build month groups
  const monthMap = new Map<string, SummaryRow[]>()
  for (const row of filtered) {
    const key = getMonthKey(row.shiftDate)
    if (!monthMap.has(key)) monthMap.set(key, [])
    monthMap.get(key)!.push(row)
  }
  const monthGroups = [...monthMap.entries()].map(([key, monthRows]) => ({ key, monthRows }))
  const allMonthKeys = monthGroups.map(g => g.key)

  if (loading) return <p className="text-gray-400 p-8">Loading…</p>

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-blue-600">Construction Testing</Link>
        <span>›</span>
        <Link href="/concrete" className="hover:text-blue-600">Concrete</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">DD5 PFU Tremie</span>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">DD5 PFU Tremie</h1>
        <span className="text-sm text-gray-500">{filtered.length} of {rows.length} records</span>
      </div>

      {/* Import panel */}
      <div className="bg-white border rounded-lg p-4 mb-5 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <h2 className="font-semibold text-sm mb-2">Import / Replace Summary Sheet</h2>
          <p className="text-xs text-gray-500 mb-3">
            Upload the master log Excel file — data is read from the <strong>Summary</strong> sheet.
            Importing replaces all existing DD5 PFU Tremie records.
          </p>
          <DropZone accept=".xlsx" onFile={f => { setImportFile(f); setImportResult(null) }}
            label="Drag & drop master log Excel" currentFileName={importFile?.name ?? null} />
          <button onClick={importSummary} disabled={!importFile || importing}
            className="mt-3 w-full bg-gray-700 text-white px-3 py-2 rounded text-sm hover:bg-gray-800 disabled:opacity-50">
            {importing ? 'Importing…' : 'Import Summary Sheet'}
          </button>
          {importing && (
            <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Importing — do not close this page…
            </div>
          )}
          {importResult && (
            <div className="mt-2 bg-green-50 border border-green-200 rounded px-3 py-2 text-sm text-green-800">
              Import complete — <strong>{importResult.imported}</strong> records imported.
              {importResult.skipped > 0 && ` ${importResult.skipped} rows skipped (no date).`}
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search location, ticket, mix ID…"
          className="border rounded px-3 py-1.5 text-sm w-56" />
        {search && <button onClick={() => setSearch('')} className="text-xs text-gray-500 hover:text-gray-800 underline">Clear</button>}
      </div>

      {rows.length === 0 ? (
        <p className="text-gray-400 py-12 text-center">No records yet — import the Summary sheet above.</p>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-3 text-xs text-gray-500">
            <span>{filtered.length} records</span>
            <span className="text-gray-300">|</span>
            <button onClick={() => setOpenMonths(new Set(allMonthKeys))} className="text-blue-600 hover:underline">Expand all</button>
            <button onClick={() => setOpenMonths(new Set())} className="text-blue-600 hover:underline">Collapse all</button>
          </div>

          <div className="overflow-y-auto max-h-[60vh] space-y-3 pr-1">
            {monthGroups.map(({ key, monthRows }) => {
              const isOpen = openMonths.has(key)
              const passCount = monthRows.filter(r => r.complianceStrength?.toUpperCase().includes('YES')).length
              const failCount = monthRows.filter(r => r.complianceStrength?.toUpperCase().includes('NO')).length
              const pendingCount = monthRows.filter(r => !r.complianceStrength).length

              return (
                <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button onClick={() => toggleMonth(key)}
                    className="w-full flex items-center gap-4 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left transition-colors">
                    <span className={`text-gray-400 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} style={{ display: 'inline-block' }}>&#9654;</span>
                    <span className="font-semibold text-sm text-gray-900 min-w-[120px]">{formatMonthLabel(key)}</span>
                    <span className="text-xs text-gray-500 bg-gray-200 rounded-full px-2 py-0.5">{monthRows.length}</span>
                    <div className="flex items-center gap-3 text-xs ml-2">
                      {passCount > 0 && <span className="bg-green-100 text-green-700 rounded px-1.5 py-0.5 font-medium">{passCount} PASS</span>}
                      {failCount > 0 && <span className="bg-red-100 text-red-700 rounded px-1.5 py-0.5 font-medium">{failCount} FAIL</span>}
                      {pendingCount > 0 && <span className="text-gray-400">{pendingCount} pending</span>}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse min-w-max">
                        <thead>
                          <tr className="bg-gray-800 text-white text-left">
                            <th className="px-2 py-2 whitespace-nowrap">Date</th>
                            <th className="px-2 py-2 whitespace-nowrap">Location / Description</th>
                            <th className="px-2 py-2 whitespace-nowrap">DFOW</th>
                            <th className="px-2 py-2 whitespace-nowrap">Spec</th>
                            <th className="px-2 py-2 whitespace-nowrap">Area</th>
                            <th className="px-2 py-2 whitespace-nowrap">Structure</th>
                            <th className="px-2 py-2 whitespace-nowrap">Batch Ticket</th>
                            <th className="px-2 py-2 whitespace-nowrap">Mix ID</th>
                            <th className="px-2 py-2 text-center whitespace-nowrap">Slump</th>
                            <th className="px-2 py-2 text-center whitespace-nowrap">Air</th>
                            <th className="px-2 py-2 text-center whitespace-nowrap">Temp</th>
                            <th className="px-2 py-2 text-center whitespace-nowrap">Unit Wt</th>
                            <th className="px-2 py-2 text-center whitespace-nowrap">7d</th>
                            <th className="px-2 py-2 text-center whitespace-nowrap">14d</th>
                            <th className="px-2 py-2 text-center whitespace-nowrap">28d</th>
                            <th className="px-2 py-2 text-center whitespace-nowrap">56d</th>
                            <th className="px-2 py-2 text-center whitespace-nowrap">90d</th>
                            <th className="px-2 py-2 text-center whitespace-nowrap">Req (psi)</th>
                            <th className="px-2 py-2 text-center whitespace-nowrap">Compliance</th>
                            <th className="px-2 py-2 whitespace-nowrap">Comments</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthRows.map((row, i) => (
                            <tr key={row.id} className={i % 2 === 0 ? 'bg-white hover:bg-blue-50' : 'bg-gray-50 hover:bg-blue-50'}>
                              <td className="px-2 py-1.5 border-b whitespace-nowrap font-medium">{fmtDate(row.shiftDate)}</td>
                              <td className="px-2 py-1.5 border-b max-w-[200px] truncate" title={row.locationDescription ?? undefined}>
                                {d(row.locationDescription)}
                              </td>
                              <td className="px-2 py-1.5 border-b whitespace-nowrap text-gray-600">{d(row.dfow)}</td>
                              <td className="px-2 py-1.5 border-b whitespace-nowrap text-gray-600">{d(row.spec)}</td>
                              <td className="px-2 py-1.5 border-b whitespace-nowrap">{d(row.area)}</td>
                              <td className="px-2 py-1.5 border-b whitespace-nowrap text-gray-600">{d(row.structure)}</td>
                              <td className="px-2 py-1.5 border-b whitespace-nowrap font-mono">{d(row.batchTicketNumber)}</td>
                              <td className="px-2 py-1.5 border-b whitespace-nowrap font-mono text-gray-600">{d(row.mixId)}</td>
                              <td className="px-2 py-1.5 border-b text-center">{d(row.slump)}</td>
                              <td className="px-2 py-1.5 border-b text-center">{row.airContent != null ? `${Number(row.airContent).toFixed(1)}%` : '—'}</td>
                              <td className="px-2 py-1.5 border-b text-center">{n(row.temperature)}</td>
                              <td className="px-2 py-1.5 border-b text-center">{n(row.unitWeight, 1)}</td>
                              <td className="px-2 py-1.5 border-b text-center">{row.break7day != null ? <span className={row.requiredStrength && row.break7day < row.requiredStrength ? 'text-red-500' : ''}>{row.break7day}</span> : <span className="text-gray-300">—</span>}</td>
                              <td className="px-2 py-1.5 border-b text-center">{row.break14day != null ? row.break14day : <span className="text-gray-300">—</span>}</td>
                              <td className="px-2 py-1.5 border-b text-center">{row.break28day != null ? <span className={row.requiredStrength && row.break28day < row.requiredStrength ? 'text-red-500 font-semibold' : 'font-medium'}>{row.break28day}</span> : <span className="text-gray-300">—</span>}</td>
                              <td className="px-2 py-1.5 border-b text-center">{row.break56day != null ? row.break56day : <span className="text-gray-300">—</span>}</td>
                              <td className="px-2 py-1.5 border-b text-center">{row.break90day != null ? row.break90day : <span className="text-gray-300">—</span>}</td>
                              <td className="px-2 py-1.5 border-b text-center text-gray-600">{n(row.requiredStrength)}</td>
                              <td className="px-2 py-1.5 border-b text-center">{complianceBadge(row.complianceStrength)}</td>
                              <td className="px-2 py-1.5 border-b max-w-[180px] truncate text-gray-500" title={row.comments ?? undefined}>{d(row.comments)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
