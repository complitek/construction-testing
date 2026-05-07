'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import DropZone from '@/components/DropZone'
import type { BreakAge } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'
import type { LogRow } from '@/app/api/log/route'
import type { TicketListItem } from '@/app/api/tickets/all/route'
import type { SummaryRow } from '@/app/api/summary/route'

// ─── Editable break cell ─────────────────────────────────────────────────────

function EditableBreakCell({ sampleId, age, value, onSaved }: {
  sampleId: string; age: BreakAge; value: number | undefined
  onSaved: (age: BreakAge, newValue: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState(value != null ? String(value) : '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  async function save() {
    setSaving(true); setEditing(false)
    const num = input.trim() === '' ? null : Number(input)
    try {
      const res = await fetch(`/api/samples/${sampleId}/breaks`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [age]: num }),
      })
      if (res.ok) { onSaved(age, num); setSaved(true); setTimeout(() => setSaved(false), 1500) }
    } finally { setSaving(false) }
  }

  if (editing) return (
    <input ref={ref} type="number" value={input}
      onChange={e => setInput(e.target.value)} onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
      className="w-14 border border-blue-400 rounded px-1 py-0.5 text-xs text-center focus:outline-none"
    />
  )
  return (
    <span onClick={() => { setInput(value != null ? String(value) : ''); setEditing(true) }}
      className={`cursor-pointer px-1 py-0.5 rounded hover:bg-blue-50 hover:text-blue-700 transition-colors ${saving ? 'opacity-50' : ''}`}
      title="Click to edit">
      {saved ? <span className="text-green-600 font-bold">✓</span>
        : value != null ? <span className="font-medium">{value}</span>
        : <span className="text-gray-300 hover:text-blue-400">—</span>}
    </span>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AGE_LABEL: Record<BreakAge, string> = {
  '1day': '1d', '3day': '3d', '4day': '4d', '5day': '5d', '7day': '7d',
  '14day': '14d', '21day': '21d', '28day': '28d', '56day': '56d', '90day': '90d', '120day': '120d',
}
const KEY_AGES: BreakAge[] = ['7day', '28day', '56day', '90day', '120day']

function d(v: string | null | undefined) { return v ?? '—' }
function n(v: number | null | undefined, dec = 0) {
  if (v == null) return '—'
  return dec > 0 ? v.toFixed(dec) : String(v)
}
function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
}

const COMP: Record<string, string> = {
  YES: 'bg-green-100 text-green-700',
  NO: 'bg-red-100 text-red-700 font-semibold',
  NA: 'bg-gray-100 text-gray-500',
}

function GH({ label, span }: { label: string; span: number }) {
  return <th colSpan={span} className="px-2 py-1 text-left text-gray-400 text-xs font-semibold uppercase tracking-wide border-b border-gray-600 bg-gray-900 whitespace-nowrap">{label}</th>
}

type Tab = 'master' | 'master-dd5' | 'reports' | 'reports-dd5' | 'tickets'

// ─── Month grouping helpers ───────────────────────────────────────────────────

function getMonthKey(dateStr: string | null | undefined): string {
  if (!dateStr) return 'unknown'
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(key: string): string {
  if (key === 'unknown') return 'Unknown Date'
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MasterLogPage() {
  const [rows, setRows] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('master')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [uploadedAt, setUploadedAt] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'date' | 'mixId'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [filterCompliance, setFilterCompliance] = useState('ALL')
  const [filterTicket, setFilterTicket] = useState('ALL')
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set())

  // Bulk report generation state
  const [bulkGenMode, setBulkGenMode] = useState<'month' | 'week' | 'all'>('month')
  const [bulkGenMonth, setBulkGenMonth] = useState('')
  const [bulkGenWeek, setBulkGenWeek] = useState('')
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [bulkPrinting, setBulkPrinting] = useState(false)

  const [hasTemplate, setHasTemplate] = useState(false)

  // Summary bulk generation state (DD5 PFU Tremie reports)
  const [summaryBulkMode, setSummaryBulkMode] = useState<'month' | 'week' | 'all'>('month')
  const [summaryBulkMonth, setSummaryBulkMonth] = useState('')
  const [summaryBulkWeek, setSummaryBulkWeek] = useState('')
  const [summaryBulkGenerating, setSummaryBulkGenerating] = useState(false)
  const [summaryBulkPrinting, setSummaryBulkPrinting] = useState(false)

  // Combined import state (processes both Compressive Strength + Summary sheets in one upload)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    cs: { imported: number; samples: number; skipped: number; existing: number }
    summary: { imported: number; skipped: number; existing: number }
  } | null>(null)

  // DD5 PFU Tremie tab state
  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>([])
  const [summaryLoaded, setSummaryLoaded] = useState(false)
  const [dd5Search, setDd5Search] = useState('')
  const [openDD5Months, setOpenDD5Months] = useState<Set<string>>(new Set())
  const [generatingDD5Id, setGeneratingDD5Id] = useState<string | null>(null)

  // Batch Tickets tab state
  const [ticketItems, setTicketItems] = useState<TicketListItem[]>([])
  const [ticketsLoaded, setTicketsLoaded] = useState(false)
  const [openTicketMonths, setOpenTicketMonths] = useState<Set<string>>(new Set())
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [linkSearch, setLinkSearch] = useState('')
  const [linkSaving, setLinkSaving] = useState(false)
  const [deletingTicketId, setDeletingTicketId] = useState<string | null>(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Bulk ticket upload state
  const [bulkFile, setBulkFile] = useState<File | null>(null)
  const [bulkMonth, setBulkMonth] = useState('')
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkInputKey, setBulkInputKey] = useState(0)
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null)
  const [bulkResult, setBulkResult] = useState<{
    totalTickets: number; matched: number; unmatched: number; flagged: number;
    results: Array<{ batchTicketNumber: string | null; status: string; matchedBatchTicket: string | null; confidence: string }>
  } | null>(null)

  useEffect(() => {
    fetch('/api/log').then(r => r.json()).then((data: LogRow[]) => {
      setRows(data)
      setLoading(false)
    })
    fetch('/api/log/upload').then(r => r.json()).then(d => {
      setUploadedUrl(d.url); setUploadedFileName(d.fileName); setUploadedAt(d.uploadedAt)
    }).catch(() => {})
    fetch('/api/admin/template').then(r => r.json()).then(d => {
      setHasTemplate(!!d.url)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === 'tickets' && !ticketsLoaded) {
      fetch('/api/tickets/all').then(r => r.json()).then((data: TicketListItem[]) => {
        setTicketItems(data)
        setTicketsLoaded(true)
      })
    }
    if ((tab === 'master-dd5' || tab === 'reports-dd5') && !summaryLoaded) {
      fetch('/api/summary').then(r => r.json()).then((data: SummaryRow[]) => {
        setSummaryRows(Array.isArray(data) ? data : [])
        setSummaryLoaded(true)
      })
    }
  }, [tab])

  function toggleSort(field: 'date' | 'mixId') {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortDir('asc') }
  }

  // Project Wide = all records from the Compressive Strength sheet (pourEvents/sampleSets)
  const filtered = rows.filter(r => {
    if (filterCompliance !== 'ALL') {
      if (filterCompliance === 'PENDING' && r.compliance) return false
      if (filterCompliance !== 'PENDING' && r.compliance !== filterCompliance) return false
    }
    if (filterTicket === 'NO_TICKET' && r.ticketFileUrl) return false
    if (filterTicket === 'HAS_TICKET' && !r.ticketFileUrl) return false
    if (search) {
      const q = search.toLowerCase()
      return [r.batchTicketNumber, r.location, r.description, r.pfuLocation, r.mixId, r.area, r.definableFeature]
        .some(v => v?.toLowerCase().includes(q))
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortBy] ?? '', bv = b[sortBy] ?? ''
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
  })

  function updateBreak(sampleId: string, age: BreakAge, newValue: number | null) {
    setRows(prev => prev.map(row => {
      if (row.sampleId !== sampleId) return row
      const breaks = { ...row.breaks }
      if (newValue == null) delete breaks[age]; else breaks[age] = newValue
      return { ...row, breaks }
    }))
  }

  function toggleMonth(key: string) {
    setOpenMonths(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // Build ordered month groups from the sorted+filtered rows
  const monthGroups: Array<{ key: string; monthRows: LogRow[] }> = []
  const monthMap = new Map<string, LogRow[]>()
  for (const row of sorted) {
    const key = getMonthKey(row.date)
    if (!monthMap.has(key)) monthMap.set(key, [])
    monthMap.get(key)!.push(row)
  }
  // Keep insertion order (sorted is desc by date, so most-recent month first)
  for (const [key, monthRows] of monthMap) {
    monthGroups.push({ key, monthRows })
  }
  const allMonthKeys = monthGroups.map(g => g.key)

  async function uploadMasterLog() {
    if (!uploadFile) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', uploadFile)
    const res = await fetch('/api/log/upload', { method: 'POST', body: fd })
    const data = await res.json()
    setUploadedUrl(data.url); setUploadedFileName(data.fileName); setUploadedAt(data.uploadedAt)
    setUploading(false)
    setUploadFile(null)
  }

  async function deleteMasterLog() {
    if (!confirm('Remove the uploaded master log file? This only removes the stored file reference — it does not delete any records from the database.')) return
    const res = await fetch('/api/log/upload', { method: 'DELETE' })
    if (res.ok) { setUploadedUrl(null); setUploadedFileName(null); setUploadedAt(null) }
  }

  function weekToDateRange(weekStr: string): { dateFrom: string; dateTo: string } {
    const [yearStr, weekStr2] = weekStr.split('-W')
    const y = parseInt(yearStr), w = parseInt(weekStr2)
    // ISO week: find Monday of week 1 (week containing Jan 4)
    const jan4 = new Date(y, 0, 4)
    const dayOfWeek = jan4.getDay() || 7  // 1=Mon…7=Sun
    const monday1 = new Date(jan4)
    monday1.setDate(jan4.getDate() - dayOfWeek + 1)
    const monday = new Date(monday1)
    monday.setDate(monday1.getDate() + (w - 1) * 7)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return {
      dateFrom: monday.toISOString().split('T')[0],
      dateTo: sunday.toISOString().split('T')[0],
    }
  }

  async function downloadBulkReports(params: { month?: string; week?: string; all?: boolean }) {
    setBulkGenerating(true)
    try {
      let url = '/api/reports/bulk'
      let label = 'all'

      if (params.month) {
        const [y, m] = params.month.split('-')
        const dateFrom = `${y}-${m}-01`
        const lastDay = new Date(Number(y), Number(m), 0).getDate()
        const dateTo = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
        url += `?dateFrom=${dateFrom}&dateTo=${dateTo}`
        label = params.month
      } else if (params.week) {
        const { dateFrom, dateTo } = weekToDateRange(params.week)
        url += `?dateFrom=${dateFrom}&dateTo=${dateTo}`
        label = `week-${params.week.replace('-W', '-W')}`
      }

      const res = await fetch(url)
      if (!res.ok) { alert('Generation failed — check that file storage (Vercel Blob) is configured.'); return }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `compression-reports-${label}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setBulkGenerating(false)
    }
  }

  async function downloadBulkPrint(params: { month?: string; week?: string; all?: boolean }) {
    setBulkPrinting(true)
    try {
      let url = '/api/reports/bulk-print'
      let label = 'all'

      if (params.month) {
        const [y, m] = params.month.split('-')
        const dateFrom = `${y}-${m}-01`
        const lastDay = new Date(Number(y), Number(m), 0).getDate()
        const dateTo = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
        url += `?dateFrom=${dateFrom}&dateTo=${dateTo}`
        label = params.month
      } else if (params.week) {
        const { dateFrom, dateTo } = weekToDateRange(params.week)
        url += `?dateFrom=${dateFrom}&dateTo=${dateTo}`
        label = `week-${params.week}`
      }

      const res = await fetch(url)
      if (!res.ok) { alert('PDF generation failed — check that file storage is configured.'); return }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `compression-reports-${label}.pdf`
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setBulkPrinting(false)
    }
  }

  async function deleteTicket(ticketId: string) {
    setDeletingTicketId(ticketId)
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, { method: 'DELETE' })
      if (res.ok) {
        setTicketItems(prev => prev.filter(t => t.id !== ticketId))
        // Clear ticketFileUrl in rows if this ticket was linked
        setRows(prev => prev.map(r =>
          r.ticketFileUrl ? { ...r, ticketFileUrl: null } : r
        ))
      }
    } finally { setDeletingTicketId(null) }
  }

  async function bulkDeleteTickets(mode: 'all' | 'unmatched' | 'no_number') {
    const msg = mode === 'all'
      ? 'Delete ALL uploaded batch tickets? This will remove all ticket files and reset all ticket links on your compression reports.'
      : mode === 'no_number'
      ? 'Delete all tickets where the batch number could not be read?'
      : 'Delete all unmatched batch tickets?'
    if (!confirm(msg)) return
    setBulkDeleting(true)
    try {
      const res = await fetch('/api/tickets/bulk-delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      if (res.ok) {
        if (mode === 'all') {
          setTicketItems([])
          setTicketsLoaded(false)
          setRows(prev => prev.map(r => ({ ...r, ticketFileUrl: null })))
        } else if (mode === 'no_number') {
          setTicketItems(prev => prev.filter(t => t.batchTicketNumber !== null))
        } else {
          setTicketItems(prev => prev.filter(t => t.matchStatus === 'auto_matched' || t.matchStatus === 'manually_confirmed'))
        }
      }
    } finally { setBulkDeleting(false) }
  }

  async function downloadMonthTickets(monthKey: string) {
    setDownloadingMonth(monthKey)
    try {
      const res = await fetch(`/api/tickets/bulk-month?month=${monthKey}`)
      if (!res.ok) { alert('No tickets found for this month or download failed.'); return }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `batch-tickets-${monthKey}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setDownloadingMonth(null)
    }
  }

  async function uploadBulkTickets() {
    if (!bulkFile) return
    setBulkUploading(true)
    setBulkResult(null)
    try {
      const fd = new FormData()
      fd.append('file', bulkFile)
      if (bulkMonth) fd.append('month', bulkMonth)
      const res = await fetch('/api/tickets/bulk-upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error ?? 'Upload failed')
        return
      }
      const data = await res.json()
      setBulkResult(data)
      setBulkFile(null)
      setBulkInputKey(k => k + 1)  // reset file input so the same file can be re-selected
      // Refresh log rows and ticket list
      fetch('/api/log').then(r => r.json()).then((d: LogRow[]) => setRows(d))
      fetch('/api/tickets/all').then(r => r.json()).then((d: TicketListItem[]) => {
        setTicketItems(d)
        setTicketsLoaded(true)
      })
    } catch (err) {
      alert('Upload failed — ' + (err instanceof Error ? err.message : 'unknown error'))
    } finally {
      setBulkUploading(false)
    }
  }

  // ─── Summary bulk generation (DD5 PFU Tremie) ────────────────────────────

  async function downloadSummaryBulk(params: { month?: string; week?: string; all?: boolean }, format: 'zip' | 'pdf') {
    if (format === 'zip') setSummaryBulkGenerating(true)
    else setSummaryBulkPrinting(true)
    try {
      const base = format === 'zip' ? '/api/summary/bulk' : '/api/summary/bulk-print'
      let url = base
      let label = 'all'

      if (params.month) {
        const [y, m] = params.month.split('-')
        const lastDay = new Date(Number(y), Number(m), 0).getDate()
        url += `?dateFrom=${y}-${m}-01&dateTo=${y}-${m}-${String(lastDay).padStart(2, '0')}`
        label = params.month
      } else if (params.week) {
        const { dateFrom, dateTo } = weekToDateRange(params.week)
        url += `?dateFrom=${dateFrom}&dateTo=${dateTo}`
        label = `week-${params.week}`
      }

      const res = await fetch(url)
      if (!res.ok) { alert('Generation failed'); return }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `compression-reports-dd5-${label}.${format === 'zip' ? 'zip' : 'pdf'}`
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setSummaryBulkGenerating(false)
      setSummaryBulkPrinting(false)
    }
  }

  // ─── Combined import (reads both Compressive Strength + Summary sheets) ──

  async function importCombined() {
    if (!importFile) return
    if (!confirm(`Import new records from "${importFile.name}"? Existing records will be preserved — only new batch ticket numbers will be added.`)) return
    setImporting(true)
    setImportResult(null)
    try {
      const fd = new FormData()
      fd.append('file', importFile)
      const res = await fetch('/api/log/import', { method: 'POST', body: fd })
      if (!res.ok) { const e = await res.json(); alert(e.error ?? 'Import failed'); return }
      const data = await res.json()
      setImportResult(data)
      setImportFile(null)
      fetch('/api/log').then(r => r.json()).then((d: LogRow[]) => setRows(d))
      fetch('/api/summary').then(r => r.json()).then((d: SummaryRow[]) => {
        setSummaryRows(Array.isArray(d) ? d : [])
        setSummaryLoaded(true)
      })
    } finally { setImporting(false) }
  }

  async function generateDD5Report(recordId: string) {
    setGeneratingDD5Id(recordId)
    try {
      const res = await fetch(`/api/summary/${recordId}/report`)
      if (!res.ok) { alert('Report generation failed'); return }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition')
      const match = disposition?.match(/filename="([^"]+)"/)
      const fileName = match?.[1] ?? `DD5_Report.pdf`
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl; a.download = fileName; a.click()
      URL.revokeObjectURL(objUrl)
    } finally { setGeneratingDD5Id(null) }
  }

  function toggleDD5Month(key: string) {
    setOpenDD5Months(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  // DD5 PFU Tremie: only Mix ID HD5KMDD1 from the Summary sheet
  const filteredDD5 = summaryRows.filter(r => {
    if (r.mixId?.toUpperCase() !== 'HD5KMDD1') return false
    if (!dd5Search) return true
    const q = dd5Search.toLowerCase()
    return [r.locationDescription, r.batchTicketNumber, r.mixId, r.area, r.structure, r.dfow]
      .some(v => v?.toLowerCase().includes(q))
  })

  const dd5MonthMap = new Map<string, SummaryRow[]>()
  for (const row of filteredDD5) {
    const key = getMonthKey(row.shiftDate)
    if (!dd5MonthMap.has(key)) dd5MonthMap.set(key, [])
    dd5MonthMap.get(key)!.push(row)
  }
  const dd5MonthGroups = [...dd5MonthMap.entries()].map(([key, monthRows]) => ({ key, monthRows }))
  const allDD5MonthKeys = dd5MonthGroups.map(g => g.key)

  function dd5ComplianceBadge(val: string | null) {
    if (!val) return <span className="text-gray-400 text-xs">pending</span>
    const upper = val.toUpperCase()
    const key = upper.includes('YES') ? 'YES' : upper.includes('NO') ? 'NO' : upper.includes('N/A') || upper.includes('NA') ? 'NA' : null
    if (!key) return <span className="text-gray-500 text-xs">{val}</span>
    const label = key === 'YES' ? 'PASS' : key === 'NO' ? 'FAIL' : 'N/A'
    const cls = key === 'YES' ? 'bg-green-100 text-green-700' : key === 'NO' ? 'bg-red-100 text-red-700 font-semibold' : 'bg-gray-100 text-gray-500'
    return <span className={`px-2 py-0.5 rounded-full text-xs ${cls}`}>{label}</span>
  }

  async function generateReport(sampleId: string, batchTicket: string) {
    setGeneratingId(sampleId)
    try {
      const res = await fetch(`/api/samples/${sampleId}/report`)
      if (!res.ok) { alert('Report generation failed'); return }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition')
      const match = disposition?.match(/filename="([^"]+)"/)
      const fileName = match?.[1] ?? `Report_${batchTicket}.pdf`
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl; a.download = fileName; a.click()
      URL.revokeObjectURL(objUrl)
    } finally { setGeneratingId(null) }
  }

  if (loading) return <p className="text-gray-400 p-8">Loading...</p>

  return (
    <div>
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 flex-wrap">
        <Link href="/" className="hover:text-blue-600">Construction Testing</Link>
        <span>›</span>
        <Link href="/concrete" className="hover:text-blue-600">Concrete</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Concrete Log and Compression Reports</span>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Concrete Log and Compression Reports</h1>
        <div className="flex items-center gap-3">
          {(tab === 'master' || tab === 'reports') && (
            <span className="text-sm text-gray-500">{sorted.length} records</span>
          )}
          {(tab === 'master-dd5' || tab === 'reports-dd5') && (
            <span className="text-sm text-gray-500">{filteredDD5.length} records</span>
          )}
          <Link href="/pours/new" className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">+ New Pour</Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-gray-200 mb-5">
        {([
          { key: 'master',      label: 'Project Wide Log' },
          { key: 'master-dd5',  label: 'DD5 PFU Tremie Log' },
          { key: 'reports',     label: 'Reports — Project Wide' },
          { key: 'reports-dd5', label: 'Reports — DD5 PFU Tremie' },
          { key: 'tickets',     label: 'Batch Tickets' },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Filters — Project Wide tabs */}
      {(tab === 'master' || tab === 'reports') && (
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search ticket, location, mix ID…"
            className="border rounded px-3 py-1.5 text-sm w-56" />
          <select value={filterCompliance} onChange={e => setFilterCompliance(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm">
            <option value="ALL">All Compliance</option>
            <option value="YES">Pass</option>
            <option value="NO">Fail</option>
            <option value="NA">N/A</option>
            <option value="PENDING">Pending</option>
          </select>
          <select value={filterTicket} onChange={e => setFilterTicket(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm">
            <option value="ALL">All Tickets</option>
            <option value="NO_TICKET">No Ticket Attached</option>
            <option value="HAS_TICKET">Ticket Attached</option>
          </select>
          {filterTicket !== 'ALL' && (
            <button onClick={() => setFilterTicket('ALL')} className="text-xs text-gray-500 hover:text-gray-800 underline">Clear</button>
          )}
        </div>
      )}

      {/* Filters — DD5 tab */}
      {(tab === 'master-dd5' || tab === 'reports-dd5') && (
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <input value={dd5Search} onChange={e => setDd5Search(e.target.value)}
            placeholder="Search location, ticket, mix ID…"
            className="border rounded px-3 py-1.5 text-sm w-56" />
          {dd5Search && <button onClick={() => setDd5Search('')} className="text-xs text-gray-500 hover:text-gray-800 underline">Clear</button>}
        </div>
      )}

      {/* ── MASTER LOG TAB ─────────────────────────────────────────────────── */}
      {tab === 'master' && (
        <>
          {/* Import / download panel */}
          <div className="flex flex-col sm:flex-row gap-4 mb-5">
            {/* Combined import — reads both sheets */}
            <div className="bg-white border rounded-lg p-4 flex-1">
              <h2 className="font-semibold text-sm mb-1">Import / Replace All Concrete Log Data</h2>
              <p className="text-xs text-gray-500 mb-3">
                Upload the master log Excel. Automatically reads the <strong>Compressive Strength</strong> sheet (Project Wide) and
                the <strong>Summary</strong> sheet (DD5 PFU Tremie). Replaces all existing records in both logs.
              </p>
              <DropZone accept=".xlsx" onFile={f => { setImportFile(f); setImportResult(null) }}
                label="Drag & drop master log Excel" currentFileName={importFile?.name ?? null} />
              <button onClick={importCombined} disabled={!importFile || importing}
                className="mt-3 w-full bg-gray-700 text-white px-3 py-2 rounded text-sm hover:bg-gray-800 disabled:opacity-50">
                {importing ? 'Importing…' : 'Import Both Sheets'}
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
                <div className="mt-2 bg-green-50 border border-green-200 rounded px-3 py-2 text-sm text-green-800 space-y-1">
                  <div>Project Wide — <strong>{importResult.cs.imported}</strong> new records added.{importResult.cs.existing > 0 && ` ${importResult.cs.existing} already existed (skipped).`}</div>
                  <div>DD5 PFU Tremie — <strong>{importResult.summary.imported}</strong> new records added.{importResult.summary.existing > 0 && ` ${importResult.summary.existing} already existed (skipped).`}</div>
                </div>
              )}
            </div>

            {/* Download current log */}
            <div className="bg-white border rounded-lg p-4 flex-shrink-0">
              <h2 className="font-semibold text-sm mb-2">Download Current Log</h2>
              <div className="flex gap-2">
                <a href="/api/log/download?format=xlsx" className="bg-green-600 text-white px-3 py-1.5 rounded text-xs hover:bg-green-700">Excel</a>
                <a href="/api/log/download?format=pdf" className="bg-gray-800 text-white px-3 py-1.5 rounded text-xs hover:bg-gray-900">PDF</a>
              </div>
            </div>
          </div>



          {rows.length === 0 ? (
            <p className="text-gray-400 py-12 text-center">No records yet.</p>
          ) : (
            <>
              {/* Expand / Collapse all controls */}
              <div className="flex items-center gap-3 mb-3 text-xs text-gray-500">
                <span>{sorted.length} of {rows.length} records</span>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() => setOpenMonths(new Set(allMonthKeys))}
                  className="text-blue-600 hover:underline"
                >
                  Expand all
                </button>
                <button
                  onClick={() => setOpenMonths(new Set())}
                  className="text-blue-600 hover:underline"
                >
                  Collapse all
                </button>
              </div>

              {/* Month groups */}
              <div className="overflow-y-auto max-h-[60vh] space-y-3 pr-1">
                {monthGroups.map(({ key, monthRows }) => {
                  const isOpen = openMonths.has(key)
                  const count = monthRows.length
                  const has28d = monthRows.filter(r => r.breaks['28day'] != null).length
                  const passCount = monthRows.filter(r => r.compliance === 'YES').length
                  const failCount = monthRows.filter(r => r.compliance === 'NO').length
                  const pendingCount = monthRows.filter(r => !r.compliance).length
                  const ticketCount = monthRows.filter(r => r.ticketFileUrl).length

                  return (
                    <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* Month header */}
                      <button
                        onClick={() => toggleMonth(key)}
                        className="w-full flex items-center gap-4 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left transition-colors"
                      >
                        <span className={`text-gray-400 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} style={{ display: 'inline-block' }}>
                          &#9654;
                        </span>
                        <span className="font-semibold text-sm text-gray-900 min-w-[120px]">
                          {formatMonthLabel(key)}
                        </span>
                        <span className="text-xs text-gray-500 bg-gray-200 rounded-full px-2 py-0.5">
                          {count} {count === 1 ? 'record' : 'records'}
                        </span>
                        <div className="flex items-center gap-3 text-xs ml-2 flex-wrap">
                          <span className="text-gray-500">
                            28d: <span className="font-medium text-gray-700">{has28d}/{count}</span>
                          </span>
                          {passCount > 0 && <span className="bg-green-100 text-green-700 rounded px-1.5 py-0.5 font-medium">{passCount} PASS</span>}
                          {failCount > 0 && <span className="bg-red-100 text-red-700 rounded px-1.5 py-0.5 font-medium">{failCount} FAIL</span>}
                          {pendingCount > 0 && <span className="text-gray-400">{pendingCount} pending</span>}
                          <span className="text-gray-500">Tickets: <span className="font-medium text-gray-700">{ticketCount}/{count}</span></span>
                        </div>
                      </button>

                      {/* Expanded table */}
                      {isOpen && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse min-w-max">
                            <thead>
                              <tr className="bg-gray-800 text-white text-left">
                                <th className="px-2 py-2 whitespace-nowrap cursor-pointer hover:bg-gray-700" onClick={() => toggleSort('date')}>
                                  Pour Date {sortBy === 'date' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                                </th>
                                <th className="px-2 py-2 whitespace-nowrap">Shift</th>
                                <th className="px-2 py-2 whitespace-nowrap">Spec</th>
                                <th className="px-2 py-2 whitespace-nowrap">DFOW</th>
                                <th className="px-2 py-2 whitespace-nowrap">Area</th>
                                <th className="px-2 py-2 whitespace-nowrap">Location / Description</th>
                                <th className="px-2 py-2 whitespace-nowrap">Batch Ticket #</th>
                                <th className="px-2 py-2 whitespace-nowrap cursor-pointer hover:bg-gray-700" onClick={() => toggleSort('mixId')}>
                                  Mix ID {sortBy === 'mixId' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                                </th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">Slump</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">Air</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">Temp</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">Unit Wt</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">W/C</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">7d</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">28d</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">56d</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">90d</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">Req (psi)</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">Compliance</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">Ticket</th>
                                <th className="px-2 py-2 whitespace-nowrap">Report</th>
                              </tr>
                            </thead>
                            <tbody>
                              {monthRows.map((row, i) => (
                                <tr key={row.sampleId} className={i % 2 === 0 ? 'bg-white hover:bg-blue-50' : 'bg-gray-50 hover:bg-blue-50'}>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap font-medium">{fmtDate(row.date)}</td>
                                  <td className="px-2 py-1.5 border-b capitalize whitespace-nowrap text-gray-600">{row.shift}</td>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap text-gray-600">{d(row.spec)}</td>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap text-gray-600">{d(row.definableFeature)}</td>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap">{d(row.area)}</td>
                                  <td className="px-2 py-1.5 border-b max-w-[200px] truncate" title={row.description ?? row.pfuLocation ?? undefined}>
                                    {d(row.description || row.pfuLocation)}
                                  </td>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap">
                                    <Link href={`/samples/${row.sampleId}`} className="text-blue-600 hover:underline font-mono">
                                      {row.batchTicketNumber}
                                    </Link>
                                  </td>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap font-mono text-gray-600">{d(row.mixId)}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{d(row.slump)}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{row.airContent != null ? `${Number(row.airContent).toFixed(1)}%` : '—'}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{n(row.temperature)}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{n(row.unitWeight, 1)}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{n(row.wcRatio, 2)}</td>
                                  {(['7day', '28day', '56day', '90day'] as const).map(age => (
                                    <td key={age} className="px-2 py-1.5 border-b text-center">
                                      <EditableBreakCell
                                        sampleId={row.sampleId}
                                        age={age}
                                        value={row.breaks[age]}
                                        onSaved={(a, v) => updateBreak(row.sampleId, a, v)}
                                      />
                                    </td>
                                  ))}
                                  <td className="px-2 py-1.5 border-b text-center text-gray-600">{n(row.requiredCompStrength)}</td>
                                  <td className="px-2 py-1.5 border-b text-center">
                                    {row.compliance ? (
                                      <span className={`px-2 py-0.5 rounded-full text-xs ${COMP[row.compliance] ?? 'bg-gray-100 text-gray-500'}`}>
                                        {row.compliance === 'YES' ? 'PASS' : row.compliance === 'NO' ? 'FAIL' : 'N/A'}
                                      </span>
                                    ) : <span className="text-gray-400 text-xs">pending</span>}
                                  </td>
                                  <td className="px-2 py-1.5 border-b text-center">
                                    {row.ticketFileUrl
                                      ? <a href={`/api/samples/${row.sampleId}/ticket`} target="_blank" rel="noreferrer" className="text-green-600 hover:text-green-800 font-medium" title="Download batch ticket">&#10003;</a>
                                      : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap">
                                    <button
                                      onClick={() => generateReport(row.sampleId, row.batchTicketNumber)}
                                      disabled={generatingId === row.sampleId}
                                      className="bg-gray-800 hover:bg-gray-700 text-white text-xs px-2.5 py-1 rounded disabled:opacity-50 transition-colors whitespace-nowrap"
                                    >
                                      {generatingId === row.sampleId ? 'Building…' : 'Generate PDF'}
                                    </button>
                                  </td>
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
        </>
      )}

      {/* ── MASTER LOG — DD5 PFU TREMIE ONLY ────────────────────────────── */}
      {tab === 'master-dd5' && (
        <>
          {/* Import panel — same combined import as Project Wide tab */}
          <div className="bg-white border rounded-lg p-4 mb-5">
            <h2 className="font-semibold text-sm mb-1">Import / Replace DD5 PFU Tremie Data</h2>
            <p className="text-xs text-gray-500 mb-3">
              Upload the master log Excel — reads the <strong>Summary</strong> sheet for DD5 PFU Tremie records
              and the <strong>Compressive Strength</strong> sheet for Project Wide. Both logs are updated at once.
            </p>
            <DropZone accept=".xlsx" onFile={f => { setImportFile(f); setImportResult(null) }}
              label="Drag & drop master log Excel" currentFileName={importFile?.name ?? null} />
            <button onClick={importCombined} disabled={!importFile || importing}
              className="mt-3 w-full bg-gray-700 text-white px-3 py-2 rounded text-sm hover:bg-gray-800 disabled:opacity-50">
              {importing ? 'Importing…' : 'Import Both Sheets'}
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
              <div className="mt-2 bg-green-50 border border-green-200 rounded px-3 py-2 text-sm text-green-800 space-y-1">
                <div>Project Wide — <strong>{importResult.cs.imported}</strong> new records added.{importResult.cs.existing > 0 && ` ${importResult.cs.existing} already existed (skipped).`}</div>
                <div>DD5 PFU Tremie — <strong>{importResult.summary.imported}</strong> new records added.{importResult.summary.existing > 0 && ` ${importResult.summary.existing} already existed (skipped).`}</div>
              </div>
            )}
          </div>

          {summaryRows.length === 0 ? (
            <p className="text-gray-400 py-12 text-center">{summaryLoaded ? 'No records yet — upload and import the master log Excel above.' : 'Loading…'}</p>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-3 text-xs text-gray-500">
                <span>{filteredDD5.length} of {summaryRows.length} records</span>
                <span className="text-gray-300">|</span>
                <button onClick={() => setOpenDD5Months(new Set(allDD5MonthKeys))} className="text-blue-600 hover:underline">Expand all</button>
                <button onClick={() => setOpenDD5Months(new Set())} className="text-blue-600 hover:underline">Collapse all</button>
              </div>
              <div className="overflow-y-auto max-h-[60vh] space-y-3 pr-1">
                {dd5MonthGroups.map(({ key, monthRows }) => {
                  const isOpen = openDD5Months.has(key)
                  const passCount = monthRows.filter(r => r.complianceStrength?.toUpperCase().includes('YES')).length
                  const failCount = monthRows.filter(r => r.complianceStrength?.toUpperCase().includes('NO')).length
                  const pendingCount = monthRows.filter(r => !r.complianceStrength).length
                  return (
                    <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
                      <button onClick={() => toggleDD5Month(key)}
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
                                  <td className="px-2 py-1.5 border-b max-w-[200px] truncate" title={row.locationDescription ?? undefined}>{row.locationDescription ?? '—'}</td>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap text-gray-600">{row.dfow ?? '—'}</td>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap text-gray-600">{row.spec ?? '—'}</td>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap">{row.area ?? '—'}</td>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap text-gray-600">{row.structure ?? '—'}</td>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap font-mono">{row.batchTicketNumber ?? '—'}</td>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap font-mono text-gray-600">{row.mixId ?? '—'}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{row.slump ?? '—'}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{row.airContent != null ? `${Number(row.airContent).toFixed(1)}%` : '—'}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{row.temperature ?? '—'}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{row.unitWeight != null ? Number(row.unitWeight).toFixed(1) : '—'}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{row.break7day ?? <span className="text-gray-300">—</span>}</td>
                                  <td className="px-2 py-1.5 border-b text-center font-medium">{row.break28day ?? <span className="text-gray-300">—</span>}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{row.break56day ?? <span className="text-gray-300">—</span>}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{row.break90day ?? <span className="text-gray-300">—</span>}</td>
                                  <td className="px-2 py-1.5 border-b text-center text-gray-600">{row.requiredStrength ?? '—'}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{dd5ComplianceBadge(row.complianceStrength)}</td>
                                  <td className="px-2 py-1.5 border-b max-w-[180px] truncate text-gray-500" title={row.comments ?? undefined}>{row.comments ?? '—'}</td>
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
        </>
      )}

      {/* ── COMPRESSION REPORTS TAB ───────────────────────────────────────── */}
      {tab === 'reports' && (
        <div>
          {/* No-ticket summary banner */}
          {(() => {
            const noTicket = rows.filter(r => !r.ticketFileUrl).length
            if (noTicket === 0) return null
            return (
              <div className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 mb-4">
                <p className="text-sm text-yellow-800">
                  <span className="font-semibold">{noTicket} of {rows.length} reports</span> have no batch ticket attached.
                </p>
                <button onClick={() => setFilterTicket('NO_TICKET')}
                  className="text-xs text-yellow-700 border border-yellow-300 rounded px-2.5 py-1 hover:bg-yellow-100 transition-colors ml-4 shrink-0">
                  Show only these
                </button>
              </div>
            )
          })()}

          {/* Bulk report generation panel */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
            <h2 className="font-semibold text-base mb-1">Generate Reports in Bulk</h2>
            <p className="text-xs text-gray-500 mb-3">
              Download all compression reports as a single ZIP — by week, by month, or all at once.
              Matched batch ticket scans are appended automatically to each report.
            </p>
            <div className="flex gap-1 mb-4 border-b border-gray-200">
              {(['week', 'month', 'all'] as const).map(m => (
                <button key={m} onClick={() => setBulkGenMode(m)}
                  className={`px-4 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    bulkGenMode === m ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  {m === 'week' ? 'By Week' : m === 'month' ? 'By Month' : 'All Records'}
                </button>
              ))}
            </div>
            {bulkGenMode === 'week' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Select week</label>
                    <input type="week" value={bulkGenWeek} onChange={e => setBulkGenWeek(e.target.value)} className="border rounded px-3 py-1.5 text-sm" />
                  </div>
                  <button onClick={() => bulkGenWeek && downloadBulkReports({ week: bulkGenWeek })} disabled={bulkGenerating || bulkPrinting || !bulkGenWeek}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2 rounded text-sm font-medium disabled:opacity-50 transition-colors whitespace-nowrap">
                    {bulkGenerating ? 'Building ZIP…' : 'Download Week as ZIP'}
                  </button>
                  <button onClick={() => bulkGenWeek && downloadBulkPrint({ week: bulkGenWeek })} disabled={bulkGenerating || bulkPrinting || !bulkGenWeek}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded text-sm font-medium disabled:opacity-50 transition-colors whitespace-nowrap">
                    {bulkPrinting ? 'Building PDF…' : 'Download Week as PDF (Print)'}
                  </button>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">Quick select:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 8 }, (_, i) => {
                      const d = new Date(); d.setDate(d.getDate() - i * 7)
                      const dow = d.getDay() || 7
                      const thu = new Date(d); thu.setDate(d.getDate() - dow + 4)
                      const jan1 = new Date(thu.getFullYear(), 0, 1)
                      const week = Math.ceil(((thu.getTime() - jan1.getTime()) / 86400000 + 1) / 7)
                      const val = `${thu.getFullYear()}-W${String(week).padStart(2, '0')}`
                      const mon = new Date(d); mon.setDate(d.getDate() - dow + 1)
                      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
                      const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
                      return (
                        <button key={val} onClick={() => { setBulkGenWeek(val); downloadBulkReports({ week: val }) }} disabled={bulkGenerating}
                          className="text-xs px-2.5 py-1 border rounded hover:bg-gray-100 disabled:opacity-50 transition-colors whitespace-nowrap">
                          {fmt(mon)}–{fmt(sun)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
            {bulkGenMode === 'month' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Select month</label>
                    <input type="month" value={bulkGenMonth} onChange={e => setBulkGenMonth(e.target.value)} className="border rounded px-3 py-1.5 text-sm" />
                  </div>
                  <button onClick={() => bulkGenMonth && downloadBulkReports({ month: bulkGenMonth })} disabled={bulkGenerating || bulkPrinting || !bulkGenMonth}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2 rounded text-sm font-medium disabled:opacity-50 transition-colors whitespace-nowrap">
                    {bulkGenerating ? 'Building ZIP…' : 'Download Month as ZIP'}
                  </button>
                  <button onClick={() => bulkGenMonth && downloadBulkPrint({ month: bulkGenMonth })} disabled={bulkGenerating || bulkPrinting || !bulkGenMonth}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded text-sm font-medium disabled:opacity-50 transition-colors whitespace-nowrap">
                    {bulkPrinting ? 'Building PDF…' : 'Download Month as PDF (Print)'}
                  </button>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">Quick select:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 6 }, (_, i) => {
                      const d = new Date(); d.setMonth(d.getMonth() - i)
                      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                      return (
                        <button key={val} onClick={() => { setBulkGenMonth(val); downloadBulkReports({ month: val }) }} disabled={bulkGenerating}
                          className="text-xs px-2.5 py-1 border rounded hover:bg-gray-100 disabled:opacity-50 transition-colors whitespace-nowrap">
                          {d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
            {bulkGenMode === 'all' && (
              <div>
                <p className="text-sm text-gray-600 mb-3">Downloads every compression report in the database.</p>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => downloadBulkReports({ all: true })} disabled={bulkGenerating || bulkPrinting}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded text-sm font-medium disabled:opacity-50 transition-colors">
                    {bulkGenerating ? 'Building ZIP…' : `Download All ${rows.length} as ZIP`}
                  </button>
                  <button onClick={() => downloadBulkPrint({ all: true })} disabled={bulkGenerating || bulkPrinting}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded text-sm font-medium disabled:opacity-50 transition-colors">
                    {bulkPrinting ? 'Building PDF…' : `Download All ${rows.length} as PDF (Print)`}
                  </button>
                </div>
              </div>
            )}
            {(bulkGenerating || bulkPrinting) && (
              <div className="mt-4 flex items-center gap-2 text-sm text-blue-600">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                {bulkGenerating ? 'Generating PDFs and building ZIP' : 'Generating PDFs and merging into single PDF'} — do not close this page…
              </div>
            )}
          </div>

          {sorted.length === 0 ? (
            <p className="text-gray-400 py-8 text-center">No records match the current filters.</p>
          ) : (
            <>
              <div className="flex gap-3 mb-3 text-sm">
                <button onClick={() => setOpenMonths(new Set(allMonthKeys))} className="text-gray-500 hover:text-gray-800">Expand all</button>
                <span className="text-gray-300">|</span>
                <button onClick={() => setOpenMonths(new Set())} className="text-gray-500 hover:text-gray-800">Collapse all</button>
              </div>
              <div className="overflow-y-auto max-h-[60vh] space-y-2 pr-1">
                {monthGroups.map(({ key: mk, monthRows }) => {
                  const isOpen = openMonths.has(mk)
                  const passCount = monthRows.filter(r => r.compliance === 'YES').length
                  const failCount = monthRows.filter(r => r.compliance === 'NO').length
                  const pendingCount = monthRows.filter(r => !r.compliance).length
                  const ticketCount = monthRows.filter(r => r.ticketFileUrl).length
                  return (
                    <div key={mk} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                      <div className="flex items-center">
                        <button onClick={() => toggleMonth(mk)}
                          className="flex-1 flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                          <span className="text-sm font-semibold text-gray-900">{formatMonthLabel(mk)}</span>
                          <span className="text-xs text-gray-500 bg-white border rounded px-1.5 py-0.5">{monthRows.length}</span>
                          {passCount > 0 && <span className="text-xs bg-green-100 text-green-700 rounded px-1.5 py-0.5 font-medium">{passCount} PASS</span>}
                          {failCount > 0 && <span className="text-xs bg-red-100 text-red-700 rounded px-1.5 py-0.5 font-medium">{failCount} FAIL</span>}
                          {pendingCount > 0 && <span className="text-xs text-gray-400">{pendingCount} pending</span>}
                          <span className="text-xs text-gray-500">Tickets: <span className="font-medium text-gray-700">{ticketCount}/{monthRows.length}</span></span>
                          <span className="ml-auto text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                        </button>
                        <button onClick={() => downloadBulkReports({ month: mk })} disabled={bulkGenerating || bulkPrinting}
                          className="px-3 py-3 bg-gray-50 hover:bg-gray-200 text-gray-600 hover:text-gray-900 text-xs border-l border-gray-200 whitespace-nowrap transition-colors disabled:opacity-40"
                          title={`Download ${formatMonthLabel(mk)} as ZIP`}>
                          ↓ ZIP
                        </button>
                        <button onClick={() => downloadBulkPrint({ month: mk })} disabled={bulkGenerating || bulkPrinting}
                          className="px-3 py-3 bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-800 text-xs border-l border-gray-200 whitespace-nowrap transition-colors disabled:opacity-40"
                          title={`Download ${formatMonthLabel(mk)} as merged PDF for printing`}>
                          ↓ PDF
                        </button>
                      </div>
                      {isOpen && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse min-w-max">
                            <thead>
                              <tr className="bg-gray-800 text-white text-left">
                                <th className="px-2 py-2 whitespace-nowrap">Pour Date</th>
                                <th className="px-2 py-2 whitespace-nowrap">Location / Description</th>
                                <th className="px-2 py-2 whitespace-nowrap">Spec</th>
                                <th className="px-2 py-2 whitespace-nowrap">Batch Ticket</th>
                                <th className="px-2 py-2 whitespace-nowrap">Mix ID</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">Slump</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">Air</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">Temp</th>
                                {KEY_AGES.map(age => <th key={age} className="px-2 py-2 text-center whitespace-nowrap">{AGE_LABEL[age]}</th>)}
                                <th className="px-2 py-2 text-center whitespace-nowrap">Req (psi)</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">Compliance</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">Ticket</th>
                                <th className="px-2 py-2 whitespace-nowrap">Report</th>
                              </tr>
                            </thead>
                            <tbody>
                              {monthRows.map((row, i) => (
                                <tr key={row.sampleId} className={
                                  !row.ticketFileUrl
                                    ? 'bg-amber-50 hover:bg-amber-100 border-l-2 border-l-amber-400'
                                    : i % 2 === 0 ? 'bg-white hover:bg-blue-50' : 'bg-gray-50 hover:bg-blue-50'
                                }>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap font-medium">{fmtDate(row.date)}</td>
                                  <td className="px-2 py-1.5 border-b max-w-[200px] truncate" title={row.description ?? row.location}>{row.description || row.location || '—'}</td>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap text-gray-600">{d(row.spec)}</td>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap font-mono">
                                    <Link href={`/samples/${row.sampleId}`} className="text-blue-600 hover:underline">{row.batchTicketNumber}</Link>
                                  </td>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap font-mono text-gray-600">{d(row.mixId)}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{d(row.slump)}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{row.airContent != null ? `${Number(row.airContent).toFixed(1)}%` : '—'}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{n(row.temperature)}</td>
                                  {KEY_AGES.map(age => {
                                    const val = row.breaks[age]
                                    const isFailingAt56 = age === '56day' && val != null && row.requiredCompStrength != null && val < row.requiredCompStrength
                                    const colorCls = isFailingAt56 ? 'text-red-600 font-semibold' : 'font-medium'
                                    return (
                                      <td key={age} className="px-2 py-1.5 border-b text-center">
                                        {val != null
                                          ? <span className={colorCls}>{val}</span>
                                          : <span className="text-gray-300">—</span>}
                                      </td>
                                    )
                                  })}
                                  <td className="px-2 py-1.5 border-b text-center text-gray-600">{n(row.requiredCompStrength)}</td>
                                  <td className="px-2 py-1.5 border-b text-center">
                                    {row.compliance
                                      ? <span className={`px-2 py-0.5 rounded-full text-xs ${COMP[row.compliance] ?? 'bg-gray-100 text-gray-500'}`}>
                                          {row.compliance === 'YES' ? 'PASS' : row.compliance === 'NO' ? 'FAIL' : 'N/A'}
                                        </span>
                                      : <span className="text-gray-400 text-xs">pending</span>}
                                  </td>
                                  <td className="px-2 py-1.5 border-b text-center">
                                    {row.ticketFileUrl
                                      ? <a href={`/api/samples/${row.sampleId}/ticket`} target="_blank" rel="noreferrer" className="text-green-600 hover:text-green-800 text-xs font-medium" title="Download batch ticket">✓</a>
                                      : <span className="text-gray-300 text-xs">—</span>}
                                  </td>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap">
                                    <button onClick={() => generateReport(row.sampleId, row.batchTicketNumber)} disabled={generatingId === row.sampleId}
                                      className="bg-gray-800 hover:bg-gray-700 text-white text-xs px-2.5 py-1 rounded disabled:opacity-50 transition-colors">
                                      {generatingId === row.sampleId ? 'Building…' : 'Generate PDF'}
                                    </button>
                                  </td>
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
      )}

      {/* ── COMPRESSION REPORTS — DD5 PFU TREMIE ONLY ───────────────────── */}
      {tab === 'reports-dd5' && (
        <div>
          {/* Bulk generation panel */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
            <h2 className="font-semibold text-base mb-1">Generate Reports in Bulk</h2>
            <p className="text-xs text-gray-500 mb-3">Download DD5 PFU Tremie compression reports as a ZIP or single printable PDF.</p>
            <div className="flex gap-1 mb-4 border-b border-gray-200">
              {(['week', 'month', 'all'] as const).map(m => (
                <button key={m} onClick={() => setSummaryBulkMode(m)}
                  className={`px-4 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${summaryBulkMode === m ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {m === 'week' ? 'By Week' : m === 'month' ? 'By Month' : 'All Records'}
                </button>
              ))}
            </div>
            {summaryBulkMode === 'week' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Select week</label>
                    <input type="week" value={summaryBulkWeek} onChange={e => setSummaryBulkWeek(e.target.value)} className="border rounded px-3 py-1.5 text-sm" />
                  </div>
                  <button onClick={() => summaryBulkWeek && downloadSummaryBulk({ week: summaryBulkWeek }, 'zip')} disabled={summaryBulkGenerating || summaryBulkPrinting || !summaryBulkWeek}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2 rounded text-sm font-medium disabled:opacity-50 transition-colors whitespace-nowrap">
                    {summaryBulkGenerating ? 'Building ZIP…' : 'Download Week as ZIP'}
                  </button>
                  <button onClick={() => summaryBulkWeek && downloadSummaryBulk({ week: summaryBulkWeek }, 'pdf')} disabled={summaryBulkGenerating || summaryBulkPrinting || !summaryBulkWeek}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded text-sm font-medium disabled:opacity-50 transition-colors whitespace-nowrap">
                    {summaryBulkPrinting ? 'Building PDF…' : 'Download Week as PDF (Print)'}
                  </button>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">Quick select:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 8 }, (_, i) => {
                      const d = new Date(); d.setDate(d.getDate() - i * 7)
                      const dow = d.getDay() || 7
                      const thu = new Date(d); thu.setDate(d.getDate() - dow + 4)
                      const jan1 = new Date(thu.getFullYear(), 0, 1)
                      const week = Math.ceil(((thu.getTime() - jan1.getTime()) / 86400000 + 1) / 7)
                      const val = `${thu.getFullYear()}-W${String(week).padStart(2, '0')}`
                      const mon = new Date(d); mon.setDate(d.getDate() - dow + 1)
                      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
                      const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
                      return (
                        <button key={val} onClick={() => { setSummaryBulkWeek(val); downloadSummaryBulk({ week: val }, 'zip') }} disabled={summaryBulkGenerating || summaryBulkPrinting}
                          className="text-xs px-2.5 py-1 border rounded hover:bg-gray-100 disabled:opacity-50 transition-colors whitespace-nowrap">
                          {fmt(mon)}–{fmt(sun)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
            {summaryBulkMode === 'month' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Select month</label>
                    <input type="month" value={summaryBulkMonth} onChange={e => setSummaryBulkMonth(e.target.value)} className="border rounded px-3 py-1.5 text-sm" />
                  </div>
                  <button onClick={() => summaryBulkMonth && downloadSummaryBulk({ month: summaryBulkMonth }, 'zip')} disabled={summaryBulkGenerating || summaryBulkPrinting || !summaryBulkMonth}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2 rounded text-sm font-medium disabled:opacity-50 transition-colors whitespace-nowrap">
                    {summaryBulkGenerating ? 'Building ZIP…' : 'Download Month as ZIP'}
                  </button>
                  <button onClick={() => summaryBulkMonth && downloadSummaryBulk({ month: summaryBulkMonth }, 'pdf')} disabled={summaryBulkGenerating || summaryBulkPrinting || !summaryBulkMonth}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded text-sm font-medium disabled:opacity-50 transition-colors whitespace-nowrap">
                    {summaryBulkPrinting ? 'Building PDF…' : 'Download Month as PDF (Print)'}
                  </button>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">Quick select:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 6 }, (_, i) => {
                      const d = new Date(); d.setMonth(d.getMonth() - i)
                      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                      return (
                        <button key={val} onClick={() => { setSummaryBulkMonth(val); downloadSummaryBulk({ month: val }, 'zip') }} disabled={summaryBulkGenerating || summaryBulkPrinting}
                          className="text-xs px-2.5 py-1 border rounded hover:bg-gray-100 disabled:opacity-50 transition-colors whitespace-nowrap">
                          {d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
            {summaryBulkMode === 'all' && (
              <div>
                <p className="text-sm text-gray-600 mb-3">Downloads all DD5 PFU Tremie compression reports.</p>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => downloadSummaryBulk({ all: true }, 'zip')} disabled={summaryBulkGenerating || summaryBulkPrinting}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded text-sm font-medium disabled:opacity-50 transition-colors">
                    {summaryBulkGenerating ? 'Building ZIP…' : `Download All ${filteredDD5.length} as ZIP`}
                  </button>
                  <button onClick={() => downloadSummaryBulk({ all: true }, 'pdf')} disabled={summaryBulkGenerating || summaryBulkPrinting}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded text-sm font-medium disabled:opacity-50 transition-colors">
                    {summaryBulkPrinting ? 'Building PDF…' : `Download All ${filteredDD5.length} as PDF (Print)`}
                  </button>
                </div>
              </div>
            )}
            {(summaryBulkGenerating || summaryBulkPrinting) && (
              <div className="mt-4 flex items-center gap-2 text-sm text-blue-600">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                {summaryBulkGenerating ? 'Generating PDFs and building ZIP' : 'Generating PDFs and merging'} — do not close this page…
              </div>
            )}
          </div>

          {/* No-ticket banner */}
          {(() => {
            const noTicket = filteredDD5.filter(r => !r.ticketFileUrl).length
            if (noTicket === 0 || filteredDD5.length === 0) return null
            return (
              <div className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 mb-4">
                <p className="text-sm text-yellow-800">
                  <span className="font-semibold">{noTicket} of {filteredDD5.length} reports</span> have no batch ticket scan attached.
                </p>
              </div>
            )
          })()}

          {summaryRows.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              {summaryLoaded
                ? <>No DD5 records. Go to <button onClick={() => setTab('master-dd5')} className="text-blue-600 underline">DD5 PFU Tremie Log</button> to import the Summary sheet.</>
                : 'Loading…'}
            </div>
          ) : (
            <>
              <div className="flex gap-3 mb-3 text-sm">
                <button onClick={() => setOpenDD5Months(new Set(allDD5MonthKeys))} className="text-gray-500 hover:text-gray-800">Expand all</button>
                <span className="text-gray-300">|</span>
                <button onClick={() => setOpenDD5Months(new Set())} className="text-gray-500 hover:text-gray-800">Collapse all</button>
              </div>
              <div className="overflow-y-auto max-h-[60vh] space-y-2 pr-1">
                {dd5MonthGroups.map(({ key: mk, monthRows }) => {
                  const isOpen = openDD5Months.has(mk)
                  const passCount = monthRows.filter(r => r.complianceStrength?.toUpperCase().includes('YES')).length
                  const failCount = monthRows.filter(r => r.complianceStrength?.toUpperCase().includes('NO')).length
                  const pendingCount = monthRows.filter(r => !r.complianceStrength).length
                  return (
                    <div key={mk} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                      <button onClick={() => toggleDD5Month(mk)}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                        <span className="text-sm font-semibold text-gray-900">{formatMonthLabel(mk)}</span>
                        <span className="text-xs text-gray-500 bg-white border rounded px-1.5 py-0.5">{monthRows.length}</span>
                        {passCount > 0 && <span className="text-xs bg-green-100 text-green-700 rounded px-1.5 py-0.5 font-medium">{passCount} PASS</span>}
                        {failCount > 0 && <span className="text-xs bg-red-100 text-red-700 rounded px-1.5 py-0.5 font-medium">{failCount} FAIL</span>}
                        {pendingCount > 0 && <span className="text-xs text-gray-400">{pendingCount} pending</span>}
                        <span className="ml-auto text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                      </button>
                      {isOpen && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse min-w-max">
                            <thead>
                              <tr className="bg-gray-800 text-white text-left">
                                <th className="px-2 py-2 whitespace-nowrap">Pour Date</th>
                                <th className="px-2 py-2 whitespace-nowrap">Location / Description</th>
                                <th className="px-2 py-2 whitespace-nowrap">Spec</th>
                                <th className="px-2 py-2 whitespace-nowrap">Batch Ticket</th>
                                <th className="px-2 py-2 whitespace-nowrap">Mix ID</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">Slump</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">Air</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">Temp</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">7d</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">28d</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">56d</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">90d</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">Req (psi)</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">Compliance</th>
                                <th className="px-2 py-2 whitespace-nowrap">Report</th>
                              </tr>
                            </thead>
                            <tbody>
                              {monthRows.map((row, i) => (
                                <tr key={row.id} className={i % 2 === 0 ? 'bg-white hover:bg-blue-50' : 'bg-gray-50 hover:bg-blue-50'}>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap font-medium">{fmtDate(row.shiftDate)}</td>
                                  <td className="px-2 py-1.5 border-b max-w-[200px] truncate" title={row.locationDescription ?? undefined}>{row.locationDescription ?? '—'}</td>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap text-gray-600">{row.spec ?? '—'}</td>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap font-mono">{row.batchTicketNumber ?? '—'}</td>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap font-mono text-gray-600">{row.mixId ?? '—'}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{row.slump ?? '—'}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{row.airContent != null ? `${Number(row.airContent).toFixed(1)}%` : '—'}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{row.temperature ?? '—'}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{row.break7day ?? <span className="text-gray-300">—</span>}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{row.break28day ?? <span className="text-gray-300">—</span>}</td>
                                  <td className="px-2 py-1.5 border-b text-center font-medium">{row.break56day != null ? <span className={row.requiredStrength && row.break56day < row.requiredStrength ? 'text-red-600 font-semibold' : ''}>{row.break56day}</span> : <span className="text-gray-300">—</span>}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{row.break90day ?? <span className="text-gray-300">—</span>}</td>
                                  <td className="px-2 py-1.5 border-b text-center text-gray-600">{row.requiredStrength ?? '—'}</td>
                                  <td className="px-2 py-1.5 border-b text-center">{dd5ComplianceBadge(row.complianceStrength)}</td>
                                  <td className="px-2 py-1.5 border-b whitespace-nowrap">
                                    <button onClick={() => generateDD5Report(row.id)} disabled={generatingDD5Id === row.id}
                                      className="bg-gray-800 hover:bg-gray-700 text-white text-xs px-2.5 py-1 rounded disabled:opacity-50 transition-colors">
                                      {generatingDD5Id === row.id ? 'Building…' : 'Generate PDF'}
                                    </button>
                                  </td>
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
      )}

      {/* ── BATCH TICKETS TAB ─────────────────────────────────────────────── */}
      {tab === 'tickets' && (
        <div className="overflow-y-auto max-h-[calc(100vh-310px)] pr-1">
          {/* Bulk ticket upload panel */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
            <h2 className="font-semibold text-base mb-1">Upload Batch Tickets (Bulk)</h2>
            <p className="text-xs text-gray-500 mb-4">
              Upload a scanned PDF of batch tickets — one month at a time or all at once.
              The program will read each ticket using AI, extract the batch ticket number,
              and link it to the matching compression report automatically.
              When you Generate a report, the matched ticket will be appended as the last page.
            </p>

            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Month label (optional)</label>
                <input
                  type="month"
                  value={bulkMonth}
                  onChange={e => setBulkMonth(e.target.value)}
                  className="border rounded px-3 py-1.5 text-sm"
                  placeholder="2025-11"
                />
              </div>
              <div className="flex-1 min-w-[260px]">
                <label className="block text-xs font-medium text-gray-600 mb-1">Scanned batch ticket PDF</label>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded px-4 py-1.5 text-sm transition-colors">
                    {bulkFile ? bulkFile.name : 'Choose PDF…'}
                    <input key={bulkInputKey} type="file" accept=".pdf" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) setBulkFile(f) }} />
                  </label>
                  {bulkFile && <span className="text-xs text-gray-500">{(bulkFile.size / 1024 / 1024).toFixed(1)} MB</span>}
                </div>
              </div>
              <button
                onClick={uploadBulkTickets}
                disabled={!bulkFile || bulkUploading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded text-sm font-medium disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {bulkUploading ? 'Processing… (this may take a few minutes)' : 'Upload & Match'}
              </button>
            </div>

            {bulkUploading && (
              <div className="mt-4 flex items-center gap-3 text-sm text-blue-600">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Reading batch tickets with AI — do not close this page…
              </div>
            )}

            {bulkResult && (
              <div className="mt-4 space-y-3">
                <div className="flex gap-4 text-sm">
                  <span className="font-semibold">{bulkResult.totalTickets} tickets found</span>
                  <span className="text-green-700">&#10003; {bulkResult.matched} matched</span>
                  {bulkResult.flagged > 0 && <span className="text-yellow-700">&#9888; {bulkResult.flagged} flagged (low confidence)</span>}
                  {bulkResult.unmatched > 0 && <span className="text-red-700">&#10007; {bulkResult.unmatched} unmatched</span>}
                </div>

                {(bulkResult.flagged > 0 || bulkResult.unmatched > 0) && (
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">Tickets needing review:</p>
                    <div className="border rounded overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-3 py-1.5 text-left">Extracted Ticket #</th>
                            <th className="px-3 py-1.5 text-left">Status</th>
                            <th className="px-3 py-1.5 text-left">AI Confidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bulkResult.results
                            .filter(r => r.status !== 'matched')
                            .map((r, i) => (
                              <tr key={i} className="border-b last:border-0">
                                <td className="px-3 py-1.5 font-mono">{r.batchTicketNumber ?? '(not found)'}</td>
                                <td className="px-3 py-1.5">
                                  <span className={`px-2 py-0.5 rounded-full text-xs ${r.status === 'flagged' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                    {r.status}
                                  </span>
                                </td>
                                <td className="px-3 py-1.5 text-gray-500">{r.confidence}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {bulkResult.matched === bulkResult.totalTickets && (
                  <p className="text-sm text-green-700 font-medium">All tickets matched successfully.</p>
                )}
              </div>
            )}
          </div>

          {/* Ticket list */}
          {!ticketsLoaded ? (
            <p className="text-gray-400 py-8 text-center">Loading tickets…</p>
          ) : ticketItems.length === 0 ? (
            <p className="text-gray-400 py-8 text-center">No batch tickets uploaded yet.</p>
          ) : (() => {
            const ticketMatched = ticketItems.filter(t => t.matchStatus === 'auto_matched' || t.matchStatus === 'manually_confirmed').length
            const ticketUnmatched = ticketItems.filter(t => !t.matchStatus || t.matchStatus === 'unmatched').length

            // Build month groups — pourDate (matched) → ticketDate (extracted) → upload date
            const ticketMonthMap = new Map<string, TicketListItem[]>()
            for (const item of ticketItems) {
              const key = getMonthKey(item.pourDate ?? item.ticketDate ?? item.createdAt)
              if (!ticketMonthMap.has(key)) ticketMonthMap.set(key, [])
              ticketMonthMap.get(key)!.push(item)
            }
            const ticketMonthGroups: Array<{ key: string; items: TicketListItem[] }> = []
            for (const [key, items] of ticketMonthMap) {
              ticketMonthGroups.push({ key, items })
            }
            const allTicketMonthKeys = ticketMonthGroups.map(g => g.key)

            function toggleTicketMonth(key: string) {
              setOpenTicketMonths(prev => {
                const next = new Set(prev)
                if (next.has(key)) next.delete(key); else next.add(key)
                return next
              })
            }

            async function confirmLink(ticketId: string, row: LogRow) {
              setLinkSaving(true)
              try {
                const res = await fetch(`/api/tickets/${ticketId}/confirm`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sampleSetId: row.sampleId, action: 'confirm' }),
                })
                if (res.ok) {
                  setTicketItems(prev => prev.map(t =>
                    t.id === ticketId ? { ...t, matchStatus: 'manually_confirmed', sampleSetId: row.sampleId } : t
                  ))
                  setRows(prev => prev.map(r =>
                    r.sampleId === row.sampleId ? { ...r, ticketFileUrl: `/api/tickets/${ticketId}/file` } : r
                  ))
                  setLinkingId(null)
                  setLinkSearch('')
                }
              } finally {
                setLinkSaving(false)
              }
            }

            const linkResults = linkSearch.trim()
              ? rows.filter(r => r.batchTicketNumber?.toLowerCase().includes(linkSearch.trim().toLowerCase())).slice(0, 5)
              : []

            const noNumberCount = ticketItems.filter(t => !t.batchTicketNumber).length

            return (
              <>
                {/* Summary + bulk delete */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="flex gap-4 text-sm">
                    <span className="font-semibold">{ticketItems.length} tickets uploaded</span>
                    <span className="text-gray-300">—</span>
                    <span className="text-green-700 font-medium">{ticketMatched} matched</span>
                    <span className="text-red-700 font-medium">{ticketUnmatched} unmatched</span>
                    {noNumberCount > 0 && <span className="text-yellow-700 font-medium">{noNumberCount} unreadable</span>}
                  </div>
                  <div className="flex gap-2">
                    {noNumberCount > 0 && (
                      <button onClick={() => bulkDeleteTickets('no_number')} disabled={bulkDeleting}
                        className="text-xs px-3 py-1.5 border border-yellow-300 text-yellow-700 rounded hover:bg-yellow-50 disabled:opacity-50 transition-colors">
                        Delete unreadable ({noNumberCount})
                      </button>
                    )}
                    <button onClick={() => bulkDeleteTickets('all')} disabled={bulkDeleting}
                      className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50 transition-colors">
                      Delete all
                    </button>
                  </div>
                </div>

                {/* Expand / Collapse all */}
                <div className="flex gap-3 mb-3 text-sm">
                  <button onClick={() => setOpenTicketMonths(new Set(allTicketMonthKeys))} className="text-gray-500 hover:text-gray-800">Expand all</button>
                  <span className="text-gray-300">|</span>
                  <button onClick={() => setOpenTicketMonths(new Set())} className="text-gray-500 hover:text-gray-800">Collapse all</button>
                </div>

                {/* Month groups */}
                <div className="overflow-y-auto max-h-[60vh] space-y-2 pr-1">
                  {ticketMonthGroups.map(({ key: monthKey, items: monthItems }) => {
                    const isOpen = openTicketMonths.has(monthKey)
                    const monthMatched = monthItems.filter(t => t.matchStatus === 'auto_matched' || t.matchStatus === 'manually_confirmed').length
                    const monthUnmatched = monthItems.filter(t => !t.matchStatus || t.matchStatus === 'unmatched').length

                    return (
                      <div key={monthKey} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                        <div className="flex items-center">
                          <button
                            onClick={() => toggleTicketMonth(monthKey)}
                            className="flex-1 flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                          >
                            <span className="text-sm font-semibold text-gray-900">{formatMonthLabel(monthKey)}</span>
                            <span className="text-xs text-gray-500 bg-white border rounded px-1.5 py-0.5">{monthItems.length}</span>
                            {monthMatched > 0 && (
                              <span className="text-xs bg-green-100 text-green-700 rounded px-1.5 py-0.5 font-medium">{monthMatched} matched</span>
                            )}
                            {monthUnmatched > 0 && (
                              <span className="text-xs bg-red-100 text-red-700 rounded px-1.5 py-0.5 font-medium">{monthUnmatched} unmatched</span>
                            )}
                            <span className="ml-auto text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                          </button>
                          <button
                            onClick={() => downloadMonthTickets(monthKey)}
                            disabled={downloadingMonth === monthKey}
                            className="px-3 py-3 bg-gray-50 hover:bg-gray-200 text-gray-600 hover:text-gray-900 text-xs border-l border-gray-200 whitespace-nowrap transition-colors disabled:opacity-40"
                            title={`Download all ${formatMonthLabel(monthKey)} tickets as ZIP`}
                          >
                            {downloadingMonth === monthKey ? '…' : '↓ ZIP'}
                          </button>
                        </div>

                        {isOpen && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse min-w-max">
                              <thead>
                                <tr className="bg-gray-800 text-white text-left">
                                  <th className="px-3 py-2 whitespace-nowrap">Ticket #</th>
                                  <th className="px-3 py-2 whitespace-nowrap">Pour Date</th>
                                  <th className="px-3 py-2 whitespace-nowrap">Location</th>
                                  <th className="px-3 py-2 whitespace-nowrap">Match Status</th>
                                  <th className="px-3 py-2 whitespace-nowrap">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {monthItems.map((item, i) => {
                                  const isMatched = item.matchStatus === 'auto_matched'
                                  const isConfirmed = item.matchStatus === 'manually_confirmed'
                                  const isUnmatched = !item.matchStatus || item.matchStatus === 'unmatched'
                                  const isLinking = linkingId === item.id

                                  return (
                                    <>
                                      <tr key={item.id} className={i % 2 === 0 ? 'bg-white hover:bg-blue-50' : 'bg-gray-50 hover:bg-blue-50'}>
                                        <td className="px-3 py-1.5 border-b whitespace-nowrap font-mono">
                                          {item.batchTicketNumber
                                            ? <a href={`/api/tickets/${item.id}/file`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{item.batchTicketNumber}</a>
                                            : <span className="text-gray-400 italic">(unreadable)</span>}
                                        </td>
                                        <td className="px-3 py-1.5 border-b whitespace-nowrap">
                                          {item.pourDate
                                            ? fmtDate(item.pourDate)
                                            : item.ticketDate
                                            ? fmtDate(item.ticketDate)
                                            : <span className="text-gray-400 text-xs">—</span>}
                                        </td>
                                        <td className="px-3 py-1.5 border-b max-w-[200px] truncate">
                                          {item.pourLocation ?? item.pourDescription ?? '—'}
                                        </td>
                                        <td className="px-3 py-1.5 border-b whitespace-nowrap">
                                          {isMatched && <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">Matched</span>}
                                          {isConfirmed && <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 font-medium">Confirmed</span>}
                                          {isUnmatched && <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-medium">Unmatched</span>}
                                        </td>
                                        <td className="px-3 py-1.5 border-b whitespace-nowrap">
                                          <div className="flex items-center gap-2">
                                            {(isMatched || isConfirmed) && (
                                              <span className="text-green-600 font-bold text-sm">&#10003;</span>
                                            )}
                                            {isUnmatched && !isLinking && (
                                              <button
                                                onClick={() => { setLinkingId(item.id); setLinkSearch('') }}
                                                className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2.5 py-1 rounded transition-colors"
                                              >
                                                Link
                                              </button>
                                            )}
                                            {isUnmatched && isLinking && (
                                              <button
                                                onClick={() => setLinkingId(null)}
                                                className="text-xs text-gray-500 hover:text-gray-700 underline"
                                              >
                                                Cancel
                                              </button>
                                            )}
                                            <button
                                              onClick={() => deleteTicket(item.id)}
                                              disabled={deletingTicketId === item.id}
                                              className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-40 ml-1"
                                              title="Delete this ticket"
                                            >
                                              {deletingTicketId === item.id ? '…' : 'Delete'}
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                      {isLinking && (
                                        <tr key={`${item.id}-link`}>
                                          <td colSpan={5} className="px-3 py-3 bg-blue-50 border-b">
                                            <div className="flex items-center gap-2 mb-2">
                                              <input
                                                type="text"
                                                value={linkSearch}
                                                onChange={e => setLinkSearch(e.target.value)}
                                                placeholder="Enter batch ticket # from your log"
                                                className="border rounded px-2 py-1 text-xs w-64 focus:outline-none focus:border-blue-400"
                                              />
                                              <span className="text-xs text-gray-500">{linkResults.length > 0 ? `${linkResults.length} result${linkResults.length > 1 ? 's' : ''}` : linkSearch.trim() ? 'No matches' : 'Type to search'}</span>
                                            </div>
                                            {linkResults.length > 0 && (
                                              <div className="border rounded overflow-hidden bg-white">
                                                <table className="w-full text-xs">
                                                  <thead className="bg-gray-100 border-b">
                                                    <tr>
                                                      <th className="px-2 py-1 text-left">Date</th>
                                                      <th className="px-2 py-1 text-left">Ticket #</th>
                                                      <th className="px-2 py-1 text-left">Location</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {linkResults.map(row => (
                                                      <tr
                                                        key={row.sampleId}
                                                        onClick={() => !linkSaving && confirmLink(item.id, row)}
                                                        className="border-b last:border-0 hover:bg-blue-50 cursor-pointer"
                                                      >
                                                        <td className="px-2 py-1.5">{fmtDate(row.date)}</td>
                                                        <td className="px-2 py-1.5 font-mono">{row.batchTicketNumber}</td>
                                                        <td className="px-2 py-1.5 text-gray-600">{row.description || row.location || '—'}</td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                              </div>
                                            )}
                                            {linkSaving && <p className="text-xs text-blue-600 mt-1">Saving…</p>}
                                          </td>
                                        </tr>
                                      )}
                                    </>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
