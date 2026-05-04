'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import DropZone from '@/components/DropZone'
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
  const [tickets, setTickets] = useState<Array<{
    id: string; batchTicketNumber: string | null; fileUrl: string; pageStart: number; pageEnd: number
  }>>([])
  const [attachFile, setAttachFile] = useState<File | null>(null)
  const [attachTicketNumber, setAttachTicketNumber] = useState('')
  const [attaching, setAttaching] = useState(false)

  useEffect(() => {
    fetch(`/api/pours/${pourId}`).then(r => r.json()).then(setPour)
    fetch(`/api/samples?pourId=${pourId}`).then(r => r.json()).then(setSamples)
    fetch(`/api/tickets?pourId=${pourId}`).then(r => r.json()).then(setTickets)
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
    fetch(`/api/tickets?pourId=${pourId}`).then(r => r.json()).then(setTickets)
    setUploading(false)
  }

  async function attachTicket() {
    if (!attachFile) return
    setAttaching(true)
    const fd = new FormData()
    fd.append('file', attachFile)
    fd.append('pourId', pourId)
    if (attachTicketNumber) fd.append('ticketNumber', attachTicketNumber)
    const res = await fetch('/api/tickets/attach', { method: 'POST', body: fd })
    const record = await res.json()
    setTickets(t => [...t, record])
    setAttachFile(null)
    setAttachTicketNumber('')
    setAttaching(false)
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 flex-wrap">
        <Link href="/" className="hover:text-blue-600">Construction Testing</Link>
        <span>›</span>
        <Link href="/concrete" className="hover:text-blue-600">Concrete</Link>
        <span>›</span>
        <Link href="/pours" className="hover:text-blue-600">Pour Log</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">{pour?.date ?? '...'}</span>
      </div>

      {!pour && <p className="text-gray-400">Loading...</p>}

      {pour && <>
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
            <DropZone
              accept=".pdf"
              onFile={setUploadFile}
              label="Drag & drop combined batch ticket PDF"
              currentFileName={uploadFile?.name ?? null}
            />
            <button
              onClick={uploadCombinedPdf}
              disabled={!uploadFile || uploading}
              className="mt-3 w-full bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {uploading ? 'Processing...' : 'Upload & Process'}
            </button>
            {uploadResult && <p className="mt-3 text-sm text-green-700">{uploadResult}</p>}
          </div>
        </section>

        {/* Batch Ticket Attachments */}
        <section className="mb-8">
          <h2 className="font-bold text-lg mb-3">Batch Ticket Attachments</h2>

          {tickets.length > 0 && (
            <div className="bg-white border rounded-lg overflow-hidden mb-3">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2">Ticket #</th>
                    <th className="text-left px-4 py-2">Pages</th>
                    <th className="text-left px-4 py-2">File</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map(t => (
                    <tr key={t.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2">{t.batchTicketNumber ?? '—'}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">
                        {t.pageStart === t.pageEnd ? `p.${t.pageStart + 1}` : `p.${t.pageStart + 1}–${t.pageEnd + 1}`}
                      </td>
                      <td className="px-4 py-2">
                        <a href={t.fileUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs">
                          View
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-gray-50 border rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-3">Attach an individual ticket image or PDF directly (no AI processing)</p>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="Ticket number (optional)"
                value={attachTicketNumber}
                onChange={e => setAttachTicketNumber(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm w-48"
              />
              <DropZone
                accept="image/*,.pdf"
                onFile={setAttachFile}
                label="Drag & drop ticket image or PDF"
                currentFileName={attachFile?.name ?? null}
              />
              <button
                onClick={attachTicket}
                disabled={!attachFile || attaching}
                className="mt-3 w-full bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {attaching ? 'Attaching...' : 'Attach Ticket'}
              </button>
            </div>
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
      </>}
    </div>
  )
}
