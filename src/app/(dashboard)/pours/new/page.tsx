'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DropZone from '@/components/DropZone'
import type { ExtractedTicketData } from '@/lib/types'

export default function NewPourPage() {
  const router = useRouter()
  const [scanning, setScanning] = useState(false)
  const [form, setForm] = useState({
    date: '', shift: 'day', spec: '', location: '',
    description: '', supplier: '', mixId: '',
  })
  const [batchTicketNumber, setBatchTicketNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setScanning(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp'
      const res = await fetch('/api/vision/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      })
      const data: ExtractedTicketData = await res.json()
      setForm(f => ({
        ...f,
        date: data.date ?? f.date,
        supplier: data.supplier ?? f.supplier,
        mixId: data.mixId ?? f.mixId,
      }))
      if (data.batchTicketNumber) setBatchTicketNumber(data.batchTicketNumber)
      setScanning(false)
    }
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    const pourRes = await fetch('/api/pours', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const pour = await pourRes.json()

    if (batchTicketNumber) {
      await fetch('/api/samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pourEventId: pour.id, batchTicketNumber }),
      })
    }

    router.push(`/pours/${pour.id}`)
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 flex-wrap">
        <Link href="/" className="hover:text-blue-600">Construction Testing</Link>
        <span>›</span>
        <Link href="/concrete" className="hover:text-blue-600">Concrete</Link>
        <span>›</span>
        <Link href="/pours" className="hover:text-blue-600">Pour Log</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">New Pour</span>
      </div>
      <h1 className="text-2xl font-bold mb-6">New Pour Event</h1>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm font-medium text-blue-800 mb-3">Scan a batch ticket to auto-fill</p>
        {scanning ? (
          <div className="text-center py-4 text-blue-700 text-sm font-medium">Reading ticket...</div>
        ) : (
          <DropZone
            accept="image/*"
            onFile={file => {
              const e = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>
              handleScan(e)
            }}
            label="Drag & drop or photo a batch ticket"
          />
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {[
          { label: 'Date of Placement', key: 'date', type: 'date' },
          { label: 'Specification', key: 'spec', type: 'text' },
          { label: 'Location', key: 'location', type: 'text' },
          { label: 'Description', key: 'description', type: 'text' },
          { label: 'Supplier', key: 'supplier', type: 'text' },
          { label: 'Mix ID', key: 'mixId', type: 'text' },
        ].map(({ label, key, type }) => (
          <div key={key}>
            <label className="block text-sm font-medium mb-1">{label}</label>
            <input
              type={type}
              required
              value={form[key as keyof typeof form]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        ))}

        <div>
          <label className="block text-sm font-medium mb-1">Shift</label>
          <select
            value={form.shift}
            onChange={e => setForm(f => ({ ...f, shift: e.target.value }))}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            <option value="day">Day</option>
            <option value="night">Night</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">First Batch Ticket No. (optional)</label>
          <input
            type="text"
            value={batchTicketNumber}
            onChange={e => setBatchTicketNumber(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Will create first sample set"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Saving...' : 'Create Pour Event'}
        </button>
      </form>
    </div>
  )
}
