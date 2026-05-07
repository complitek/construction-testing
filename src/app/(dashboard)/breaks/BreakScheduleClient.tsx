'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { BreakAge } from '@/lib/types'

const AGE_LABEL: Record<BreakAge, string> = {
  '1day':   '1-Day',  '3day':   '3-Day',  '4day':   '4-Day',
  '5day':   '5-Day',  '7day':   '7-Day',  '14day':  '14-Day',
  '21day':  '21-Day', '28day':  '28-Day', '56day':  '56-Day',
  '90day':  '90-Day', '120day': '120-Day',
}

export interface BreakRow {
  sampleId: string
  batchTicketNumber: string
  pourDate: string
  location: string
  age: BreakAge
  dueDate: string
  status: 'overdue' | 'urgent' | 'upcoming' | 'future'
}

interface MonthGroup {
  key: string       // 'YYYY-MM'
  label: string     // 'November 2025'
  rows: BreakRow[]
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function formatMonthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1))
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

const STATUS_ROW: Record<BreakRow['status'], string> = {
  overdue:  'bg-red-50',
  urgent:   'bg-yellow-50',
  upcoming: 'bg-blue-50',
  future:   '',
}

const STATUS_BADGE: Record<BreakRow['status'], string> = {
  overdue:  'bg-red-100 text-red-800',
  urgent:   'bg-yellow-100 text-yellow-800',
  upcoming: 'bg-blue-100 text-blue-700',
  future:   'bg-gray-100 text-gray-700',
}

const STATUS_LABEL: Record<BreakRow['status'], string> = {
  overdue:  'Overdue',
  urgent:   'Due Soon',
  upcoming: 'Upcoming',
  future:   '',
}

export default function BreakScheduleClient({ rows, totalCount }: { rows: BreakRow[]; totalCount: number }) {
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set())

  function toggle(key: string) {
    setOpenMonths(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Group by month of due date
  const monthMap = new Map<string, BreakRow[]>()
  for (const row of rows) {
    const key = row.dueDate.substring(0, 7)
    if (!monthMap.has(key)) monthMap.set(key, [])
    monthMap.get(key)!.push(row)
  }

  const monthGroups: MonthGroup[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, monthRows]) => ({ key, label: formatMonthLabel(key), rows: monthRows }))

  if (totalCount === 0) {
    return (
      <div className="bg-white border rounded-lg p-12 text-center text-gray-400">
        <p className="text-lg font-medium">No pending breaks</p>
        <p className="text-sm mt-1">All upcoming breaks are complete or not yet in range.</p>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto max-h-[60vh] space-y-2 pr-1">
      {monthGroups.map(({ key, label, rows: monthRows }) => {
        const isOpen = openMonths.has(key)
        const overdueCount = monthRows.filter(r => r.status === 'overdue').length

        return (
          <div key={key} className="border rounded-lg overflow-hidden bg-white">
            {/* Month header */}
            <button
              onClick={() => toggle(key)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className="font-semibold text-gray-800">{label}</span>
                <span className="text-xs bg-gray-200 text-gray-600 font-medium px-2 py-0.5 rounded-full">
                  {monthRows.length} break{monthRows.length !== 1 ? 's' : ''}
                </span>
                {overdueCount > 0 && (
                  <span className="text-xs bg-red-100 text-red-700 font-medium px-2 py-0.5 rounded-full">
                    {overdueCount} overdue
                  </span>
                )}
              </div>
              <span className="text-gray-400 text-sm">{isOpen ? '▲' : '▼'}</span>
            </button>

            {/* Month rows */}
            {isOpen && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100 text-gray-500 uppercase text-xs tracking-wide border-b">
                    <tr>
                      <th className="px-4 py-2 text-left">Pour Date</th>
                      <th className="px-4 py-2 text-left">Batch Ticket</th>
                      <th className="px-4 py-2 text-left">Location</th>
                      <th className="px-4 py-2 text-left">Break Age</th>
                      <th className="px-4 py-2 text-left">Due Date</th>
                      <th className="px-4 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {monthRows.map((row, i) => (
                      <tr
                        key={`${row.sampleId}-${row.age}-${i}`}
                        className={`${STATUS_ROW[row.status]} hover:brightness-95 transition-colors`}
                      >
                        <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{formatDate(row.pourDate)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <Link href={`/samples/${row.sampleId}`} className="text-blue-600 hover:underline font-medium">
                            {row.batchTicketNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">{row.location}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${STATUS_BADGE[row.status]}`}>
                            {AGE_LABEL[row.age]}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{formatDate(row.dueDate)}</td>
                        <td className="px-4 py-2.5">
                          {row.status !== 'future' && (
                            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${STATUS_BADGE[row.status]}`}>
                              {STATUS_LABEL[row.status]}
                            </span>
                          )}
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
  )
}
