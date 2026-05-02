'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import type { SampleSet, BreakAge, PourEvent } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'
import { calculateAllBreakDates } from '@/lib/utils/break-dates'

const AGE_LABEL: Record<BreakAge, string> = {
  '1day': '1-Day', '3day': '3-Day', '4day': '4-Day', '5day': '5-Day',
  '7day': '7-Day', '14day': '14-Day', '28day': '28-Day',
  '56day': '56-Day', '90day': '90-Day', '120day': '120-Day',
}

export default function SampleDetailPage() {
  const { sampleId } = useParams<{ sampleId: string }>()
  const [sample, setSample] = useState<SampleSet | null>(null)
  const [pour, setPour] = useState<PourEvent | null>(null)
  const [breaks, setBreaks] = useState<Partial<Record<BreakAge, string>>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch(`/api/samples/${sampleId}`).then(r => r.json()).then((s: SampleSet) => {
      setSample(s)
      const init: Partial<Record<BreakAge, string>> = {}
      for (const age of BREAK_AGES) {
        if (s.breaks[age] != null) init[age] = String(s.breaks[age])
      }
      setBreaks(init)
      fetch(`/api/pours/${s.pourEventId}`).then(r => r.json()).then(setPour)
    })
  }, [sampleId])

  async function saveBreaks() {
    setSaving(true)
    const payload: Partial<Record<BreakAge, number>> = {}
    for (const age of BREAK_AGES) {
      const val = breaks[age]
      if (val && !isNaN(Number(val))) payload[age] = Number(val)
    }
    const res = await fetch(`/api/samples/${sampleId}/breaks`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const updated = await res.json()
    setSample(updated)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!sample || !pour) return <p className="text-gray-400">Loading...</p>

  const breakDates = calculateAllBreakDates(pour.date)

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Batch Ticket #{sample.batchTicketNumber}</h1>
      <p className="text-gray-500 text-sm mb-6">{pour.date} — {pour.location}</p>

      <div className="bg-white border rounded-lg overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3">Age</th>
              <th className="text-left px-4 py-3">Break Date</th>
              <th className="text-left px-4 py-3">PSI Result</th>
            </tr>
          </thead>
          <tbody>
            {BREAK_AGES.map(age => (
              <tr key={age} className="border-b">
                <td className="px-4 py-2 font-medium">{AGE_LABEL[age]}</td>
                <td className="px-4 py-2 text-gray-500">{breakDates[age]}</td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    placeholder="—"
                    value={breaks[age] ?? ''}
                    onChange={e => setBreaks(b => ({ ...b, [age]: e.target.value }))}
                    className="border rounded px-2 py-1 w-28 text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3">
        <button
          onClick={saveBreaks}
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Break Results'}
        </button>

        {sample.reportStatus !== 'pending_breaks' && (
          <a
            href={`/api/samples/${sampleId}/report`}
            className="bg-gray-800 text-white px-4 py-2 rounded text-sm hover:bg-gray-900"
          >
            Download Report PDF
          </a>
        )}
      </div>

      {sample.ticketFileUrl && (
        <div className="mt-6">
          <h2 className="font-bold mb-2">Attached Batch Ticket</h2>
          <a href={sample.ticketFileUrl} target="_blank" className="text-blue-600 hover:underline text-sm">
            View Ticket PDF
          </a>
        </div>
      )}
    </div>
  )
}
