'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { BreakAge } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'
import type { LogRow } from '@/app/api/log/route'

const AGE_LABEL: Record<BreakAge, string> = {
  '1day': '1d', '3day': '3d', '4day': '4d', '5day': '5d', '7day': '7d',
  '14day': '14d', '28day': '28d', '56day': '56d', '90day': '90d', '120day': '120d',
}

export default function MasterLogPage() {
  const [rows, setRows] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/log').then(r => r.json()).then((data: LogRow[]) => {
      setRows(data)
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="text-gray-400">Loading...</p>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Master Concrete Log</h1>
        <span className="text-sm text-gray-500">{rows.length} sample sets</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-gray-400 py-12 text-center">No concrete placements recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="px-3 py-2 text-left whitespace-nowrap">Date</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Shift</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Spec</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Location</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Supplier</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Mix ID</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Ticket #</th>
                {BREAK_AGES.map(age => (
                  <th key={age} className="px-3 py-2 text-center whitespace-nowrap">{AGE_LABEL[age]}</th>
                ))}
                <th className="px-3 py-2 text-left whitespace-nowrap">Status</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Report</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.sampleId} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 border-b whitespace-nowrap font-medium">{row.date}</td>
                  <td className="px-3 py-2 border-b capitalize whitespace-nowrap">{row.shift}</td>
                  <td className="px-3 py-2 border-b whitespace-nowrap">{row.spec}</td>
                  <td className="px-3 py-2 border-b">{row.location}</td>
                  <td className="px-3 py-2 border-b whitespace-nowrap">{row.supplier}</td>
                  <td className="px-3 py-2 border-b whitespace-nowrap">{row.mixId}</td>
                  <td className="px-3 py-2 border-b whitespace-nowrap">
                    <Link href={`/samples/${row.sampleId}`} className="text-blue-600 hover:underline">
                      {row.batchTicketNumber}
                    </Link>
                  </td>
                  {BREAK_AGES.map(age => (
                    <td key={age} className="px-3 py-2 border-b text-center">
                      {row.breaks[age] != null
                        ? <span className="font-medium">{row.breaks[age]}</span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                  ))}
                  <td className="px-3 py-2 border-b whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      row.reportStatus === 'exported' ? 'bg-green-100 text-green-700' :
                      row.reportStatus === 'ready_to_export' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {row.reportStatus.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b whitespace-nowrap">
                    {row.reportStatus !== 'pending_breaks' && (
                      <a
                        href={`/api/samples/${row.sampleId}/report`}
                        className="text-blue-600 hover:underline"
                      >
                        PDF
                      </a>
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
}
