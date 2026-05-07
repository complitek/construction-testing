'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'

// ─── Field labels ─────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  date: 'Pour Date',
  shift: 'Shift (day/night)',
  spec: 'Specification',
  definableFeature: 'Definable Feature (DFOW)',
  location: 'Location',
  description: 'Description',
  area: 'Area',
  pfuLocation: 'PFU Location',
  wallPanelControlNo: 'Wall Panel Control #',
  structure: 'Structure',
  element: 'Element',
  supplier: 'Supplier',
  mixId: 'Mix Design ID',
  batchTicketNumber: 'Batch Ticket #',
  sampleType: 'Sample Type',
  sampledBy: 'Sampled By',
  testedBy: 'Tested By',
  sampleIdRange: 'Lab Sample ID Range',
  quantitySize: 'Quantity / Size',
  temperature: 'Temperature (°F)',
  slump: 'Slump (in)',
  airContent: 'Air Content (%)',
  unitWeight: 'Unit Weight (pcf)',
  wcRatio: 'W/C Ratio',
  astmC1611Flow: 'C1611 Flow',
  vsi: 'VSI',
  ambientTemp: 'Ambient Temp',
  volumeCy: 'Volume (CY)',
  totalDailyVol: 'Total Daily Volume',
  marineConcreteCumulative: 'Marine Concrete Cumulative',
  marineConcreteLoNumber: 'Marine Lot #',
  requiredCompStrength: 'Required Strength (psi)',
  compliance: 'Compliance (PASS/FAIL)',
  break1day: '1-Day Break (psi)',
  break3day: '3-Day Break (psi)',
  break7day: '7-Day Break (psi)',
  break14day: '14-Day Break (psi)',
  break21day: '21-Day Break (psi)',
  break28day: '28-Day Break (psi)',
  break56day: '56-Day Break (psi)',
  break90day: '90-Day Break (psi)',
  break120day: '120-Day Break (psi)',
  date1day: '1-Day Break Date',
  date7day: '7-Day Break Date',
  date14day: '14-Day Break Date',
  date21day: '21-Day Break Date',
  date28day: '28-Day Break Date',
  date56day: '56-Day Break Date',
  date90day: '90-Day Break Date',
  date120day: '120-Day Break Date',
}

// ─── Editable mapping row ─────────────────────────────────────────────────────

function MappingRow({ field, sheetName, cell, onSave }: {
  field: string
  sheetName: string
  cell: string
  onSave: (field: string, sheet: string, cell: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState(cell)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.select() }, [editing])

  async function save() {
    if (input.trim() === cell) { setEditing(false); return }
    setSaving(true)
    await onSave(field, sheetName, input.trim())
    setSaving(false)
    setEditing(false)
  }

  return (
    <tr className="border-b last:border-0 hover:bg-gray-50">
      <td className="px-3 py-2 text-sm text-gray-700">{FIELD_LABELS[field] ?? field}</td>
      <td className="px-3 py-2 text-xs text-gray-400 font-mono">{sheetName}</td>
      <td className="px-3 py-2">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              ref={ref}
              value={input}
              onChange={e => setInput(e.target.value.toUpperCase())}
              onBlur={save}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setInput(cell); setEditing(false) } }}
              className="border border-blue-400 rounded px-2 py-0.5 text-xs font-mono w-20 focus:outline-none"
              placeholder="e.g. B4"
            />
            {saving && <span className="text-xs text-gray-400">Saving…</span>}
          </div>
        ) : (
          <button
            onClick={() => { setInput(cell); setEditing(true) }}
            className="font-mono text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded hover:bg-blue-100 transition-colors"
            title="Click to edit cell address"
          >
            {cell}
          </button>
        )}
      </td>
    </tr>
  )
}

// ─── Mapping table ─────────────────────────────────────────────────────────────

function MappingTable({ onUpdate }: { onUpdate: (count: number) => void }) {
  const [mapping, setMapping] = useState<Record<string, { sheet: string; cell: string }>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    fetch('/api/admin/template/mapping')
      .then(r => r.json())
      .then(d => { setMapping(d.mapping ?? {}); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function saveField(field: string, sheet: string, cell: string) {
    const res = await fetch('/api/admin/template/mapping', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, sheet, cell }),
    })
    const data = await res.json()
    if (res.ok) {
      setMapping(data.mapping)
      onUpdate(data.fieldCount)
    }
  }

  const fields = Object.entries(mapping).sort(([a], [b]) =>
    (FIELD_LABELS[a] ?? a).localeCompare(FIELD_LABELS[b] ?? b)
  )

  if (loading) return <p className="text-xs text-gray-400 mt-3">Loading field map…</p>
  if (fields.length === 0) return null

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-700">Field Mapping — click any cell address to correct it</p>
        <span className="text-xs text-gray-400">{fields.length} fields</span>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Field</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Sheet</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Cell</th>
            </tr>
          </thead>
          <tbody>
            {fields.map(([field, loc]) => (
              <MappingRow
                key={field}
                field={field}
                sheetName={loc.sheet}
                cell={loc.cell}
                onSave={saveField}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-1.5">To remove a field from the map, click its cell address and clear the value.</p>
    </div>
  )
}

// ─── Template section row ─────────────────────────────────────────────────────

function TemplateRow({ section }: { section: { key: string; label: string; description: string; accept: string; available: boolean } }) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [mappedFields, setMappedFields] = useState<number | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [showMapping, setShowMapping] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (section.available) {
      fetch('/api/admin/template')
        .then(r => r.json())
        .then(d => { setUrl(d.url ?? null); setFileName(d.fileName ?? null); setMappedFields(d.mappedFields ?? null) })
        .catch(() => {})
    }
  }, [section.available])

  async function deleteTemplate() {
    if (!confirm('Delete the uploaded template? Reports will fall back to the default PDF format until a new template is uploaded.')) return
    setError(null)
    try {
      const res = await fetch('/api/admin/template', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Delete failed'); return }
      setUrl(null); setFileName(null); setMappedFields(null); setShowMapping(false)
    } catch { setError('Network error — try again.') }
  }

  async function analyze() {
    setAnalyzing(true); setError(null)
    try {
      const res = await fetch('/api/admin/template/analyze', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Analysis failed'); return }
      setMappedFields(data.fieldCount)
      setShowMapping(true)
    } catch { setError('Network error — try again.') }
    finally { setAnalyzing(false) }
  }

  async function upload() {
    if (!file) return
    setUploading(true); setError(null); setSuccess(false)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/template', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? `Upload failed (${res.status})`); return }
      setUrl(data.url); setFileName(data.fileName ?? file.name); setMappedFields(null); setFile(null)
      setAnalyzing(true)
      try {
        const ar = await fetch('/api/admin/template/analyze', { method: 'POST' })
        const ad = await ar.json()
        if (ar.ok) { setMappedFields(ad.fieldCount); setShowMapping(true) }
      } finally { setAnalyzing(false) }
      setSuccess(true); setTimeout(() => setSuccess(false), 5000)
    } catch { setError('Network error — check your connection and try again.')
    } finally { setUploading(false) }
  }

  return (
    <div className={`bg-white border rounded-lg p-5 ${!section.available ? 'opacity-60' : ''}`}>
      <div className="flex justify-between items-start mb-1">
        <h3 className="font-semibold text-gray-900">{section.label}</h3>
        {!section.available && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Coming soon</span>}
      </div>
      <p className="text-sm text-gray-500 mb-3">{section.description}</p>

      {section.available ? (
        <>
          {url && (
            <div className="bg-green-50 border border-green-200 rounded px-3 py-2.5 mb-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-green-800 font-medium">
                  Template on file{fileName ? `: ${fileName}` : ''}.{' '}
                  <a href="/api/admin/template/download" className="underline" target="_blank" rel="noreferrer">Download</a>
                </span>
                <button onClick={deleteTemplate} className="text-xs text-red-600 hover:text-red-800 hover:underline ml-4 shrink-0">Delete</button>
              </div>
              <div className="flex items-center gap-3">
                {analyzing ? (
                  <span className="text-xs text-blue-600">Analyzing template — reading your field labels…</span>
                ) : mappedFields != null ? (
                  <span className="text-xs text-green-700">{mappedFields} fields mapped.</span>
                ) : (
                  <span className="text-xs text-yellow-700">Not yet analyzed.</span>
                )}
                {!analyzing && (
                  <>
                    <button onClick={analyze} className="text-xs text-blue-600 hover:underline shrink-0">
                      {mappedFields != null ? 'Re-analyze' : 'Analyze now'}
                    </button>
                    {mappedFields != null && (
                      <button onClick={() => setShowMapping(v => !v)} className="text-xs text-gray-500 hover:underline shrink-0">
                        {showMapping ? 'Hide mapping' : 'View / edit mapping'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{error}</p>}
          {success && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 mb-3">Template uploaded and analyzed. Reports will now use your template.</p>}

          <div className="flex items-center gap-3">
            <input ref={inputRef} type="file" accept={section.accept} className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = '' }} />
            <button type="button" onClick={() => inputRef.current?.click()}
              className="border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 px-4 py-2 rounded text-sm transition-colors">
              Choose File…
            </button>
            {file
              ? <span className="text-sm text-blue-700 font-medium truncate max-w-xs">{file.name}</span>
              : <span className="text-sm text-gray-400">No file selected</span>}
          </div>
          <button onClick={upload} disabled={!file || uploading}
            className="mt-3 w-full bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {uploading ? 'Uploading…' : url ? 'Replace Template' : 'Upload Template'}
          </button>

          {showMapping && url && <MappingTable onUpdate={setMappedFields} />}
        </>
      ) : (
        <p className="text-xs text-gray-400">Template management for this discipline will be available when the module is built.</p>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TEMPLATE_SECTIONS = [
  { key: 'compression', label: 'Concrete Compression Report', description: 'Excel (.xlsx) template used to generate compression reports', accept: '.xlsx,.xls', available: true },
  { key: 'soils', label: 'Soils Compaction Report', description: 'Template for soil compaction test reports', accept: '.xlsx', available: false },
  { key: 'welding', label: 'Welding Inspection Report', description: 'Template for weld inspection records', accept: '.xlsx,.pdf', available: false },
  { key: 'structural', label: 'Structural Inspection Report', description: 'Template for structural testing records', accept: '.xlsx,.pdf', available: false },
]

export default function TemplatesPage() {
  const { user, isLoaded } = useUser()
  const role = user?.publicMetadata?.role as string | undefined
  const canAccess = role === 'admin'

  return (
    <div>
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 flex-wrap">
        <Link href="/" className="hover:text-blue-600">Construction Testing</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Templates</span>
      </div>

      <h1 className="text-2xl font-bold mb-2">Report Templates</h1>
      <p className="text-gray-500 text-sm mb-8">
        Upload your Excel report template. The program reads your existing field labels and automatically maps them — no modifications to your template needed.
      </p>

      {!isLoaded ? (
        <p className="text-gray-400">Loading...</p>
      ) : !canAccess ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
          <p className="text-red-800 font-medium text-lg mb-2">Access Restricted</p>
          <p className="text-red-600 text-sm">Template management is restricted to administrators only.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {TEMPLATE_SECTIONS.map(section => (
            <TemplateRow key={section.key} section={section} />
          ))}
        </div>
      )}
    </div>
  )
}
