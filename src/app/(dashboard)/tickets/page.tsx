'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { TicketListItem } from '@/app/api/tickets/all/route'

function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const STATUS_STYLE: Record<string, string> = {
  auto_matched: 'bg-green-100 text-green-700',
  manually_confirmed: 'bg-blue-100 text-blue-700',
  unmatched: 'bg-red-100 text-red-700',
}
const STATUS_LABEL: Record<string, string> = {
  auto_matched: 'Matched',
  manually_confirmed: 'Confirmed',
  unmatched: 'Unmatched',
}

export default function BatchTicketsPage() {
  const [items, setItems] = useState<TicketListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set())
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null)

  async function downloadMonth(ym: string) {
    setDownloadingMonth(ym)
    try {
      const res = await fetch(`/api/tickets/bulk-month?month=${ym}`)
      if (!res.ok) {
        alert(`Download failed: ${res.status}`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `batch-tickets-${ym.replace('-', '_')}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloadingMonth(null)
    }
  }

  useEffect(() => {
    fetch('/api/tickets/all')
      .then(r => r.json())
      .then((data: TicketListItem[]) => {
        setItems(data)
        // Open the two most recent months by default
        const months = [...new Set(data.map(t => {
          const d = t.ticketDate ?? t.pourDate ?? t.createdAt.slice(0, 10)
          return d.slice(0, 7)
        }))].sort((a, b) => b.localeCompare(a))
        setOpenMonths(new Set(months.slice(0, 2)))
        setLoading(false)
      })
  }, [])

  // Group by ticket date (AI-extracted from PDF) → falls back to pour date or upload date.
  const grouped: Map<string, TicketListItem[]> = new Map()
  for (const item of items) {
    const d = item.ticketDate ?? item.pourDate ?? item.createdAt.slice(0, 10)
    const ym = d.slice(0, 7)
    if (!grouped.has(ym)) grouped.set(ym, [])
    grouped.get(ym)!.push(item)
  }
  const months = [...grouped.keys()].sort((a, b) => b.localeCompare(a))

  function toggleMonth(ym: string) {
    setOpenMonths(prev => {
      const next = new Set(prev)
      if (next.has(ym)) next.delete(ym)
      else next.add(ym)
      return next
    })
  }

  function expandAll() { setOpenMonths(new Set(months)) }
  function collapseAll() { setOpenMonths(new Set()) }

  const totalMatched = items.filter(t => t.matchStatus === 'auto_matched' || t.matchStatus === 'manually_confirmed').length
  const totalUnmatched = items.filter(t => !t.sampleSetId).length

  if (loading) return <p className="text-gray-400 p-8">Loading...</p>

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-blue-600">Construction Testing</Link>
        <span>›</span>
        <Link href="/concrete" className="hover:text-blue-600">Concrete</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Batch Tickets</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Batch Tickets</h1>
          <p className="text-sm text-gray-500 mt-1">
            {items.length} tickets total &middot;{' '}
            <span className="text-green-700">{totalMatched} matched</span>
            {totalUnmatched > 0 && (
              <> &middot; <span className="text-red-600">{totalUnmatched} unmatched</span></>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/log?tab=reports"
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 transition-colors"
          >
            + Upload Tickets
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">No batch tickets uploaded yet.</p>
          <Link href="/log" className="text-blue-600 hover:underline text-sm">
            Go to Compression Reports → Upload Batch Tickets
          </Link>
        </div>
      ) : (
        <>
          {/* Expand/collapse controls */}
          <div className="flex gap-3 mb-4 text-sm">
            <button onClick={expandAll} className="text-gray-500 hover:text-gray-800">Expand all</button>
            <span className="text-gray-300">|</span>
            <button onClick={collapseAll} className="text-gray-500 hover:text-gray-800">Collapse all</button>
          </div>

          <div className="overflow-y-auto max-h-[60vh] space-y-2 pr-1">
            {months.map(ym => {
              const tickets = grouped.get(ym)!
              const isOpen = openMonths.has(ym)
              const matchedCount = tickets.filter(t => t.sampleSetId).length
              const unmatchedCount = tickets.length - matchedCount

              return (
                <div key={ym} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                  {/* Month header / folder tab */}
                  <div className="flex items-center">
                    <button
                      onClick={() => toggleMonth(ym)}
                      className="flex-1 flex items-center gap-3 px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                    >
                      <span className="text-base font-semibold text-gray-900">{monthLabel(ym)}</span>
                      <span className="text-sm text-gray-500">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</span>
                      <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">{matchedCount} matched</span>
                      {unmatchedCount > 0 && (
                        <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{unmatchedCount} unmatched</span>
                      )}
                      <span className="ml-auto text-gray-400 text-sm">{isOpen ? '▲' : '▼'}</span>
                    </button>
                    <button
                      onClick={() => downloadMonth(ym)}
                      disabled={downloadingMonth !== null}
                      title={`Download ${monthLabel(ym)} as ZIP — files named YYYYMMDD_Batch_ticket_<#>.pdf`}
                      className="px-4 py-3.5 bg-gray-50 hover:bg-gray-200 text-gray-700 hover:text-gray-900 text-xs border-l border-gray-200 whitespace-nowrap transition-colors disabled:opacity-40 font-medium"
                    >
                      {downloadingMonth === ym ? 'Building ZIP…' : '↓ ZIP'}
                    </button>
                  </div>

                  {/* Ticket rows */}
                  {isOpen && (
                    <div className="divide-y divide-gray-100">
                      {tickets.map(ticket => (
                        <div key={ticket.id} className="flex items-center gap-4 px-5 py-3 hover:bg-blue-50 transition-colors">
                          {/* Ticket # */}
                          <div className="w-32 shrink-0">
                            {ticket.sampleSetId ? (
                              <a
                                href={`/api/samples/${ticket.sampleSetId}/report`}
                                target="_blank"
                                rel="noreferrer"
                                title="Download compression report (batch ticket attached as last page)"
                                className="font-mono text-sm font-medium text-blue-600 hover:underline"
                              >
                                {ticket.batchTicketNumber ?? '(unknown)'}
                              </a>
                            ) : (
                              <span className="font-mono text-sm font-medium text-gray-700">
                                {ticket.batchTicketNumber ?? '(unknown)'}
                              </span>
                            )}
                          </div>

                          {/* Pour date */}
                          <div className="w-20 shrink-0 text-sm text-gray-500">
                            {fmtDate(ticket.pourDate)}
                          </div>

                          {/* Location */}
                          <div className="flex-1 text-sm text-gray-700 truncate min-w-0" title={ticket.pourLocation ?? undefined}>
                            {ticket.pourLocation ?? ticket.pourDescription ?? '—'}
                          </div>

                          {/* Match status */}
                          <div className="w-28 shrink-0">
                            {ticket.matchStatus ? (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[ticket.matchStatus] ?? 'bg-gray-100 text-gray-500'}`}>
                                {STATUS_LABEL[ticket.matchStatus] ?? ticket.matchStatus}
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Unmatched</span>
                            )}
                          </div>

                          {/* View button */}
                          <a
                            href={`/api/tickets/${ticket.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 text-xs text-blue-600 hover:underline border border-blue-200 rounded px-2.5 py-1 hover:bg-blue-50 transition-colors"
                          >
                            View PDF
                          </a>
                        </div>
                      ))}
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
