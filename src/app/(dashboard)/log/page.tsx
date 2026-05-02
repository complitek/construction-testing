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
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'date' | 'mixId'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    fetch('/api/log').then(r => r.json()).then((data: LogRow[]) => {
      setRows(data)
      setLoading(false)
    })
    fetch('/api/log/upload').then(r => r.json()).then(d => setUploadedUrl(d.url)).catch(() => {})
  }, [])

  function toggleSort(field: 'date' | 'mixId') {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortBy] ?? ''
    const bv = b[sortBy] ?? ''
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
  })

  async function uploadMasterLog() {
    if (!uploadFile) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', uploadFile)
    const res = await fetch('/api/log/upload', { method: 'POST', body: fd })
    const data = await res.json()
    setUploadedUrl(data.url)
    setUploading(false)
  }

  if (loading) return <p className="text-gray-400">Loading...</p>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Master Concrete Log</h1>
        <span className="text-sm text-gray-500">{rows.length} sample sets</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 mb-6">
        {/* Upload existing master log */}
        <div className="bg-white border rounded-lg p-4 flex-1">
          <h2 className="font-semibold text-sm mb-2">Upload Existing Master Log</h2>
          {uploadedUrl && (
            <p className="text-xs text-green-700 mb-2">
              File on record. <a href={uploadedUrl} className="underline" target="_blank" rel="noreferrer">View</a>
            </p>
          )}
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept=".xlsx"
              onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
              className="text-xs flex-1"
            />
            <button
              onClick={uploadMasterLog}
              disabled={!uploadFile || uploading}
              className="bg-gray-700 text-white px-3 py-1.5 rounded text-xs hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </div>

        {/* Download current data */}
        <div className="bg-white border rounded-lg p-4 flex-1">
          <h2 className="font-semibold text-sm mb-2">Download Current Master Log</h2>
          <div className="flex gap-2">
            <a
              href="/api/log/download?format=xlsx"
              className="bg-green-600 text-white px-3 py-1.5 rounded text-xs hover:bg-green-700"
            >
              Download Excel
            </a>
            <a
              href="/api/log/download?format=pdf"
              className="bg-gray-800 text-white px-3 py-1.5 rounded text-xs hover:bg-gray-900"
            >
              Download PDF
            </a>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-gray-400 py-12 text-center">No concrete placements recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th
                  className="px-3 py-2 text-left whitespace-nowrap cursor-pointer select-none hover:bg-gray-700"
                  onClick={() => toggleSort('date')}
                >
                  Date {sortBy === 'date' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Shift</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Spec</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Location</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Supplier</th>
                <th
                  className="px-3 py-2 text-left whitespace-nowrap cursor-pointer select-none hover:bg-gray-700"
                  onClick={() => toggleSort('mixId')}
                >
                  Mix ID {sortBy === 'mixId' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Ticket #</th>
                {BREAK_AGES.map(age => (
                  <th key={age} className="px-3 py-2 text-center whitespace-nowrap">{AGE_LABEL[age]}</th>
                ))}
                <th className="px-3 py-2 text-left whitespace-nowrap">Status</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Report</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
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
