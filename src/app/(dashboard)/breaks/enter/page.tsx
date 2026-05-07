'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { BreakAge } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'
import { calculateBreakDate } from '@/lib/utils/break-dates'
import type { LogRow } from '@/app/api/log/route'

const AGE_LABEL: Record<BreakAge, string> = {
  '1day': '1-Day', '3day': '3-Day', '4day': '4-Day', '5day': '5-Day',
  '7day': '7-Day', '14day': '14-Day', '21day': '21-Day', '28day': '28-Day',
  '56day': '56-Day', '90day': '90-Day', '120day': '120-Day',
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export default function EnterBreaksPage() {
  // Search state
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<LogRow[]>([])
  const [searched, setSearched] = useState(false)

  // Selected record
  const [selected, setSelected] = useState<LogRow | null>(null)

  // Break entry values: age → string input
  const [values, setValues] = useState<Partial<Record<BreakAge, string>>>({})

  // Save state
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ compliance: string | null; sampleId: string } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setSearched(false)
    setResults([])
    setSaveResult(null)
    setSaveError(null)
    setSelected(null)

    try {
      const res = await fetch('/api/log')
      const data: LogRow[] = await res.json()
      const lower = query.trim().toLowerCase()
      const filtered = data.filter(row =>
        row.batchTicketNumber?.toLowerCase().includes(lower)
      )
      setResults(filtered)
      setSearched(true)
    } finally {
      setSearching(false)
    }
  }

  function handleSelect(row: LogRow) {
    setSelected(row)
    setSaveResult(null)
    setSaveError(null)
    // Pre-fill inputs with existing break values
    const init: Partial<Record<BreakAge, string>> = {}
    for (const age of BREAK_AGES) {
      if (row.breaks[age] != null) {
        init[age] = String(row.breaks[age])
      }
    }
    setValues(init)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setSaving(true)
    setSaveError(null)
    setSaveResult(null)

    const payload: Partial<Record<BreakAge, number>> = {}
    for (const age of BREAK_AGES) {
      const v = values[age]
      if (v !== undefined && v !== '' && !isNaN(Number(v))) {
        payload[age] = Number(v)
      }
    }

    try {
      const res = await fetch(`/api/samples/${selected.sampleId}/breaks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        setSaveError(err.error ?? 'Save failed.')
        return
      }
      const updated = await res.json()
      setSaveResult({
        compliance: updated.compliance ?? null,
        sampleId: selected.sampleId,
      })
    } catch {
      setSaveError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setQuery('')
    setResults([])
    setSearched(false)
    setSelected(null)
    setValues({})
    setSaveResult(null)
    setSaveError(null)
  }

  const inp = 'border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400'

  return (
    <div className="max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6 flex-wrap">
        <Link href="/" className="hover:text-blue-600">Construction Testing</Link>
        <span>›</span>
        <Link href="/concrete" className="hover:text-blue-600">Concrete</Link>
        <span>›</span>
        <Link href="/breaks" className="hover:text-blue-600">Break Schedule</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Enter Breaks</span>
      </div>

      <h1 className="text-2xl font-bold mb-1">Enter Break Results</h1>
      <p className="text-sm text-gray-500 mb-8">
        Search by batch ticket number to find the sample, then enter the break results.
      </p>

      {/* Search section */}
      <div className="bg-white border rounded-lg p-5 mb-6">
        <form onSubmit={handleSearch} className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Batch Ticket #</label>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. 123456"
              className={`${inp} w-full`}
            />
          </div>
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="bg-blue-600 text-white px-5 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </form>

        {/* Results list */}
        {searched && results.length === 0 && (
          <p className="text-sm text-gray-400 mt-4 italic">No samples found matching &ldquo;{query}&rdquo;.</p>
        )}

        {results.length > 0 && (
          <div className="mt-4 space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {results.length} result{results.length !== 1 ? 's' : ''} — click to select
            </p>
            {results.map(row => (
              <button
                key={row.sampleId}
                type="button"
                onClick={() => handleSelect(row)}
                className={`w-full text-left px-4 py-3 rounded border text-sm transition-colors ${
                  selected?.sampleId === row.sampleId
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span className="font-semibold text-blue-700">{row.batchTicketNumber}</span>
                <span className="mx-2 text-gray-300">|</span>
                <span className="text-gray-600">{formatDate(row.date)}</span>
                <span className="mx-2 text-gray-300">|</span>
                <span className="text-gray-600">{row.location}</span>
                <span className="mx-2 text-gray-300">|</span>
                <span className="text-gray-500">Mix {row.mixId}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Break entry form */}
      {selected && !saveResult && (
        <form onSubmit={handleSave}>
          {/* Summary card */}
          <div className="bg-white border rounded-lg p-5 mb-5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Sample Summary</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <dt className="text-gray-500">Pour Date</dt>
                <dd className="font-medium text-gray-900">{formatDate(selected.date)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Batch Ticket #</dt>
                <dd className="font-medium text-gray-900">{selected.batchTicketNumber}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Location</dt>
                <dd className="font-medium text-gray-900">{selected.location}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Mix ID</dt>
                <dd className="font-medium text-gray-900">{selected.mixId}</dd>
              </div>
              {selected.requiredCompStrength != null && (
                <div>
                  <dt className="text-gray-500">Required Strength</dt>
                  <dd className="font-medium text-gray-900">{selected.requiredCompStrength.toLocaleString()} PSI</dd>
                </div>
              )}
              {selected.compliance && (
                <div>
                  <dt className="text-gray-500">Compliance</dt>
                  <dd className={`font-semibold ${selected.compliance === 'YES' ? 'text-green-700' : 'text-red-700'}`}>
                    {selected.compliance}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Break results table */}
          <div className="bg-white border rounded-lg overflow-hidden mb-5">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Age</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Break Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Current Result (PSI)</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">New Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {BREAK_AGES.map(age => {
                  const breakDate = calculateBreakDate(selected.date, age)
                  const existing = selected.breaks[age]
                  return (
                    <tr key={age} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{AGE_LABEL[age]}</td>
                      <td className="px-4 py-2.5 text-gray-500">{formatDate(breakDate)}</td>
                      <td className="px-4 py-2.5">
                        {existing != null ? (
                          <span className="text-gray-400">{existing.toLocaleString()} PSI</span>
                        ) : (
                          <span className="text-gray-300 italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="PSI"
                          value={values[age] ?? ''}
                          onChange={e => setValues(v => ({ ...v, [age]: e.target.value }))}
                          className="border rounded px-2 py-1.5 w-28 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {saveError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-4 py-3 mb-4">
              {saveError}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-6 py-2.5 rounded font-medium hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {saving ? 'Saving...' : 'Save Break Results'}
          </button>
        </form>
      )}

      {/* Post-save success state */}
      {saveResult && (
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm">
              ✓
            </div>
            <div>
              <p className="font-semibold text-gray-900">Break results saved.</p>
              {saveResult.compliance ? (
                <p className="text-sm text-gray-600 mt-0.5">
                  Compliance:{' '}
                  <span className={`font-semibold ${saveResult.compliance === 'YES' ? 'text-green-700' : 'text-red-700'}`}>
                    {saveResult.compliance}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-gray-500 mt-0.5">Compliance will be calculated when 28-day or 56-day break is entered.</p>
              )}
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <a
              href={`/api/samples/${saveResult.sampleId}/report`}
              className="bg-gray-800 text-white px-4 py-2 rounded text-sm font-medium hover:bg-gray-900"
            >
              Generate Report (PDF)
            </a>
            <button
              type="button"
              onClick={handleReset}
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
            >
              Enter another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
