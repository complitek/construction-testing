'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { PourEvent, SampleSet } from '@/lib/types'

export default function PourDetailPage() {
  const { pourId } = useParams<{ pourId: string }>()
  const [pour, setPour] = useState<PourEvent | null>(null)
  const [samples, setSamples] = useState<SampleSet[]>([])
  const [newTicket, setNewTicket] = useState('')
  const [addingTicket, setAddingTicket] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/pours/${pourId}`).then(r => r.json()).then(setPour)
    fetch(`/api/samples?pourId=${pourId}`).then(r => r.json()).then(setSamples)
  }, [pourId])

  async function addSampleSet() {
    if (!newTicket.trim()) return
    setAddingTicket(true)
    const res = await fetch('/api/samples', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pourEventId: pourId, batchTicketNumber: newTicket }),
    })
    const sample = await res.json()
    setSamples(s => [...s, sample])
    setNewTicket('')
    setAddingTicket(false)
  }

  async function uploadCombinedPdf() {
    if (!uploadFile) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', uploadFile)
    fd.append('pourId', pourId)
    const res = await fetch('/api/tickets/upload', { method: 'POST', body: fd })
    const result = await res.json()
    setUploadResult(`Processed ${result.totalTickets} tickets — ${result.autoMatched} auto-matched, ${result.flagged} flagged, ${result.unmatched} unmatched`)
    fetch(`/api/samples?pourId=${pourId}`).then(r => r.json()).then(setSamples)
    setUploading(false)
  }

  if (!pour) return <p className="text-gray-400">Loading...</p>

  return (
    <div className="max-w-4xl">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold">{pour.date} — {pour.shift} shift</h1>
          <p className="text-gray-500 text-sm mt-1">{pour.location} | {pour.supplier} | Mix: {pour.mixId}</p>
        </div>
        <Link href={`/pours/${pourId}/edit`} className="text-sm text-blue-600 hover:underline">Edit</Link>
      </div>

      <section className="mb-8">
        <h2 className="font-bold text-lg mb-3">Sample Sets</h2>
        <div className="space-y-2">
          {samples.map(s => (
            <Link
              key={s.id}
              href={`/samples/${s.id}`}
              className="flex items-center justify-between p-4 bg-white border rounded-lg hover:border-blue-400"
            >
              <div>
                <span className="font-medium">Ticket #{s.batchTicketNumber}</span>
                <span className={`ml-3 text-xs px-2 py-0.5 rounded-full ${
                  s.matchStatus === 'auto_matched' ? 'bg-green-100 text-green-700' :
                  s.matchStatus === 'manually_confirmed' ? 'bg-blue-100 text-blue-700' :
                  s.matchStatus === 'flagged' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{s.matchStatus.replace('_', ' ')}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                s.reportStatus === 'exported' ? 'bg-green-100 text-green-700' :
                s.reportStatus === 'ready_to_export' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-500'
              }`}>{s.reportStatus.replace('_', ' ')}</span>
            </Link>
          ))}
        </div>

        <div className="flex gap-2 mt-3">
          <input
            type="text"
            placeholder="Batch ticket number"
            value={newTicket}
            onChange={e => setNewTicket(e.target.value)}
            className="border rounded px-3 py-2 text-sm flex-1"
          />
          <button
            onClick={addSampleSet}
            disabled={addingTicket}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
          >
            Add Sample Set
          </button>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="font-bold text-lg mb-3">Upload Combined Batch Ticket PDF</h2>
        <div className="bg-gray-50 border rounded-lg p-4">
          <input type="file" accept=".pdf" onChange={e => setUploadFile(e.target.files?.[0] ?? null)} className="text-sm mb-3 block" />
          <button
            onClick={uploadCombinedPdf}
            disabled={!uploadFile || uploading}
            className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {uploading ? 'Processing...' : 'Upload & Process'}
          </button>
          {uploadResult && <p className="mt-3 text-sm text-green-700">{uploadResult}</p>}
        </div>
      </section>

      <section>
        <h2 className="font-bold text-lg mb-3">Download All Reports</h2>
        <a
          href={`/api/reports/bulk?pourId=${pourId}`}
          className="inline-block bg-gray-800 text-white px-4 py-2 rounded text-sm hover:bg-gray-900"
        >
          Download ZIP
        </a>
      </section>
    </div>
  )
}
