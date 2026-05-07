'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DropZone from '@/components/DropZone'
import type { ExtractedTicketData } from '@/lib/types'
import type { LogRow } from '@/app/api/log/route'

export default function NewPourPage() {
  const router = useRouter()
  const [scanning, setScanning] = useState(false)
  const [form, setForm] = useState({
    date: '', shift: 'day', location: '',
    description: '', supplier: '', mixId: '',
  })
  const [options, setOptions] = useState({
    locations: [] as string[],
    descriptions: [] as string[],
    suppliers: [] as string[],
    mixIds: [] as string[],
  })

  useEffect(() => {
    fetch('/api/log').then(r => r.json()).then((rows: LogRow[]) => {
      const uniq = (vals: (string | null | undefined)[]) =>
        [...new Set(vals.filter(Boolean) as string[])].sort()
      setOptions({
        locations:    uniq(rows.map(r => r.location)),
        descriptions: uniq(rows.map(r => r.description)),
        suppliers:    uniq(rows.map(r => r.supplier)),
        mixIds:       uniq(rows.map(r => r.mixId)),
      })
    }).catch(() => {})
  }, [])
  const [batchTicketNumber, setBatchTicketNumber] = useState('')
  const [fieldTests, setFieldTests] = useState({
    slump: '', flow: '', airContent: '', unitWeight: '', temperature: '',
  })
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
      body: JSON.stringify({ ...form, spec: '03 31 29' }),
    })
    const pour = await pourRes.json()

    await fetch('/api/samples', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pourEventId: pour.id,
        batchTicketNumber,
        slump: fieldTests.slump || null,
        astmC1611Flow: fieldTests.flow ? Number(fieldTests.flow) : null,
        airContent: fieldTests.airContent ? Number(fieldTests.airContent) : null,
        unitWeight: fieldTests.unitWeight ? Number(fieldTests.unitWeight) : null,
        temperature: fieldTests.temperature ? Number(fieldTests.temperature) : null,
      }),
    })

    router.push(`/pours/${pour.id}`)
  }

  const inp = 'w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400'

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

      {/* Ticket scan */}
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

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Pour info */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pour Information</legend>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Date of Placement *</label>
              <input type="date" required value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Shift</label>
              <select value={form.shift} onChange={e => setForm(f => ({ ...f, shift: e.target.value }))} className={inp}>
                <option value="day">Day</option>
                <option value="night">Night</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Location *</label>
            <input required value={form.location} list="loc-list"
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="e.g. Dry Dock Cell 24, Pile Cap A" className={inp} />
            <datalist id="loc-list">
              {options.locations.map(v => <option key={v} value={v} />)}
            </datalist>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input value={form.description} list="desc-list"
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Dry Dock Tremie Concrete" className={inp} />
            <datalist id="desc-list">
              {options.descriptions.map(v => <option key={v} value={v} />)}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Supplier *</label>
              <input required value={form.supplier} list="supplier-list"
                onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}
                placeholder="e.g. Hawaiian Cement" className={inp} />
              <datalist id="supplier-list">
                {options.suppliers.map(v => <option key={v} value={v} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Mix ID *</label>
              <input required value={form.mixId} list="mixid-list"
                onChange={e => setForm(f => ({ ...f, mixId: e.target.value }))}
                placeholder="e.g. HD5KMDD1" className={inp} />
              <datalist id="mixid-list">
                {options.mixIds.map(v => <option key={v} value={v} />)}
              </datalist>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">First Batch Ticket No. *</label>
            <input required value={batchTicketNumber} onChange={e => setBatchTicketNumber(e.target.value)}
              placeholder="e.g. 8741" className={inp} />
            <p className="text-xs text-gray-400 mt-1">Creates the log entry and compression report. Additional tickets can be added after saving.</p>
          </div>
        </fieldset>

        {/* Field tests */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Field Tests (at Time of Pour)</legend>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Slump / Flow (in)</label>
              <input value={fieldTests.slump}
                onChange={e => setFieldTests(f => ({ ...f, slump: e.target.value }))}
                placeholder="e.g. 4" className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">C1611 Flow</label>
              <input type="number" step="any" value={fieldTests.flow}
                onChange={e => setFieldTests(f => ({ ...f, flow: e.target.value }))}
                placeholder="e.g. 26" className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Air Content (%)</label>
              <input type="number" step="any" value={fieldTests.airContent}
                onChange={e => setFieldTests(f => ({ ...f, airContent: e.target.value }))}
                placeholder="e.g. 1.3" className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Unit Weight (pcf)</label>
              <input type="number" step="any" value={fieldTests.unitWeight}
                onChange={e => setFieldTests(f => ({ ...f, unitWeight: e.target.value }))}
                placeholder="e.g. 148" className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Temperature (°F)</label>
              <input type="number" step="any" value={fieldTests.temperature}
                onChange={e => setFieldTests(f => ({ ...f, temperature: e.target.value }))}
                placeholder="e.g. 75" className={inp} />
            </div>
          </div>
        </fieldset>

        <button type="submit" disabled={submitting}
          className="w-full bg-blue-600 text-white py-2.5 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
          {submitting ? 'Saving...' : 'Create Pour Event'}
        </button>
      </form>
    </div>
  )
}
