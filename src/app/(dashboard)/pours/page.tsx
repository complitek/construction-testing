'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { PourEvent } from '@/lib/types'

export default function PourListPage() {
  const [pours, setPours] = useState<PourEvent[]>([])

  useEffect(() => {
    fetch('/api/pours').then(r => r.json()).then(setPours)
  }, [])

  return (
    <div>
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
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Shift</th>
              <th className="text-left px-4 py-3">Location</th>
              <th className="text-left px-4 py-3">Supplier</th>
              <th className="text-left px-4 py-3">Mix ID</th>
              <th className="text-left px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {pours.map(pour => (
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
