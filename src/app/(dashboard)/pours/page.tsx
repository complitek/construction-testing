'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { PourEvent } from '@/lib/types'

export default function PourListPage() {
  const [pours, setPours] = useState<PourEvent[]>([])
  const [sortBy, setSortBy] = useState<'date' | 'mixId' | 'location'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    fetch('/api/pours').then(r => r.json()).then(setPours)
  }, [])

  function toggleSort(field: 'date' | 'mixId' | 'location') {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
  }

  const sorted = [...pours].sort((a, b) => {
    const av = a[sortBy] ?? ''
    const bv = b[sortBy] ?? ''
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
  })

  return (
    <div>
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 flex-wrap">
        <Link href="/" className="hover:text-blue-600">Construction Testing</Link>
        <span>›</span>
        <Link href="/concrete" className="hover:text-blue-600">Concrete</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Pour Log</span>
      </div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Pour Log</h1>
        <Link href="/pours/new" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm">
          + New Pour
        </Link>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th
                className="text-left px-4 py-3 cursor-pointer select-none hover:bg-gray-100"
                onClick={() => toggleSort('date')}
              >
                Date {sortBy === 'date' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th className="text-left px-4 py-3">Shift</th>
              <th
                className="text-left px-4 py-3 cursor-pointer select-none hover:bg-gray-100"
                onClick={() => toggleSort('location')}
              >
                Location {sortBy === 'location' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th className="text-left px-4 py-3">Supplier</th>
              <th
                className="text-left px-4 py-3 cursor-pointer select-none hover:bg-gray-100"
                onClick={() => toggleSort('mixId')}
              >
                Mix ID {sortBy === 'mixId' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th className="text-left px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(pour => (
              <tr key={pour.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">{pour.date}</td>
                <td className="px-4 py-3 capitalize">{pour.shift}</td>
                <td className="px-4 py-3">{pour.location}</td>
                <td className="px-4 py-3">{pour.supplier}</td>
                <td className="px-4 py-3">{pour.mixId}</td>
                <td className="px-4 py-3">
                  <Link href={`/pours/${pour.id}`} className="text-blue-600 hover:underline">View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {pours.length === 0 && (
          <p className="text-center text-gray-400 py-12">No pour events yet.</p>
        )}
      </div>
    </div>
  )
}
