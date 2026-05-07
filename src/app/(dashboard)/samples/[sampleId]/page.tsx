'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { SampleSet, BreakAge, PourEvent } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'
import { calculateAllBreakDates } from '@/lib/utils/break-dates'

const AGE_LABEL: Record<BreakAge, string> = {
  '1day': '1-Day', '3day': '3-Day', '4day': '4-Day', '5day': '5-Day',
  '7day': '7-Day', '14day': '14-Day', '21day': '21-Day', '28day': '28-Day',
  '56day': '56-Day', '90day': '90-Day', '120day': '120-Day',
}

export default function SampleDetailPage() {
  const { sampleId } = useParams<{ sampleId: string }>()
  const [sample, setSample] = useState<SampleSet | null>(null)
  const [pour, setPour] = useState<PourEvent | null>(null)
  const [breaks, setBreaks] = useState<Partial<Record<BreakAge, string>>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [fieldTests, setFieldTests] = useState({
    temperature: '', slump: '', unitWeight: '', airContent: '',
  })
  const [savingFields, setSavingFields] = useState(false)
  const [fieldsSaved, setFieldsSaved] = useState(false)
  const [hasTemplate, setHasTemplate] = useState(false)
  const [holdForm, setHoldForm] = useState({ requiredBreakAge: '', notes: '', placedDate: '', brokenBy: '', brokenReason: '', brokenDate: '' })
  const [showPlaceHold, setShowPlaceHold] = useState(false)
  const [showBreakHold, setShowBreakHold] = useState(false)
  const [savingHold, setSavingHold] = useState(false)

  useEffect(() => {
    fetch('/api/admin/template').then(r => r.json()).then(d => setHasTemplate(!!d.url)).catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`/api/samples/${sampleId}`).then(r => r.json()).then((s: SampleSet) => {
      setSample(s)
      const init: Partial<Record<BreakAge, string>> = {}
      for (const age of BREAK_AGES) {
        if (s.breaks[age] != null) init[age] = String(s.breaks[age])
      }
      setBreaks(init)
      setFieldTests({
        temperature: s.temperature != null ? String(s.temperature) : '',
        slump: s.slump ?? '',
        unitWeight: s.unitWeight != null ? String(s.unitWeight) : '',
        airContent: s.airContent != null ? String(s.airContent) : '',
      })
      fetch(`/api/pours/${s.pourEventId}`).then(r => r.json()).then(setPour)
    })
  }, [sampleId])

  async function saveFieldTests() {
    setSavingFields(true)
    await fetch(`/api/samples/${sampleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        temperature: fieldTests.temperature ? Number(fieldTests.temperature) : null,
        slump: fieldTests.slump || null,
        unitWeight: fieldTests.unitWeight ? Number(fieldTests.unitWeight) : null,
        airContent: fieldTests.airContent ? Number(fieldTests.airContent) : null,
      }),
    })
    setSavingFields(false)
    setFieldsSaved(true)
    setTimeout(() => setFieldsSaved(false), 2000)
  }

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

  async function saveHold(patch: Record<string, unknown>) {
    setSavingHold(true)
    const res = await fetch(`/api/samples/${sampleId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const updated = await res.json()
    setSample(updated)
    setSavingHold(false)
    setShowPlaceHold(false)
    setShowBreakHold(false)
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
        <Link href={`/pours/${sample?.pourEventId}`} className="hover:text-blue-600">{pour?.date ?? '...'}</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Ticket #{sample?.batchTicketNumber ?? '...'}</span>
      </div>

      {(!sample || !pour) && <p className="text-gray-400">Loading...</p>}

      {sample && pour && <>
        <h1 className="text-2xl font-bold mb-1">Batch Ticket #{sample.batchTicketNumber}</h1>
        <p className="text-gray-500 text-sm mb-6">{pour.date} — {pour.location}</p>

        <div className="bg-white border rounded-lg p-4 mb-6">
          <h2 className="font-bold text-sm mb-3 text-gray-700 uppercase tracking-wide">Field Test Results</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Temperature (°F)</label>
              <input
                type="number"
                placeholder="—"
                value={fieldTests.temperature}
                onChange={e => setFieldTests(f => ({ ...f, temperature: e.target.value }))}
                className="border rounded px-2 py-1.5 text-sm w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Slump / Spread (in)</label>
              <input
                type="text"
                placeholder="—"
                value={fieldTests.slump}
                onChange={e => setFieldTests(f => ({ ...f, slump: e.target.value }))}
                className="border rounded px-2 py-1.5 text-sm w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Unit Weight (pcf)</label>
              <input
                type="number"
                step="0.1"
                placeholder="—"
                value={fieldTests.unitWeight}
                onChange={e => setFieldTests(f => ({ ...f, unitWeight: e.target.value }))}
                className="border rounded px-2 py-1.5 text-sm w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Air Content (%)</label>
              <input
                type="number"
                step="0.1"
                placeholder="—"
                value={fieldTests.airContent}
                onChange={e => setFieldTests(f => ({ ...f, airContent: e.target.value }))}
                className="border rounded px-2 py-1.5 text-sm w-full"
              />
            </div>
          </div>
          <button
            onClick={saveFieldTests}
            disabled={savingFields}
            className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-800 disabled:opacity-50"
          >
            {savingFields ? 'Saving...' : fieldsSaved ? 'Saved!' : 'Save Field Tests'}
          </button>
        </div>

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
              {BREAK_AGES.map(age => {
                const breakDates = calculateAllBreakDates(pour.date)
                return (
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
                )
              })}
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

          <a
            href={`/api/samples/${sampleId}/report`}
            className="bg-gray-800 text-white px-4 py-2 rounded text-sm hover:bg-gray-900"
          >
            Download Report (PDF)
          </a>
        </div>

        {/* ── Hold Management ── */}
        <div className="mt-6 border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between bg-gray-50 px-4 py-3 border-b">
            <div className="flex items-center gap-3">
              <h2 className="font-bold text-sm">Hold Status</h2>
              {sample.holdActive && !sample.holdReleasedDate && !sample.holdBrokenDate && (
                <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">HOLD ACTIVE</span>
              )}
              {sample.holdBrokenDate && (
                <span className="bg-yellow-100 text-yellow-800 text-xs font-semibold px-2 py-0.5 rounded-full">HOLD BROKEN</span>
              )}
              {sample.holdReleasedDate && !sample.holdBrokenDate && (
                <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">HOLD RELEASED</span>
              )}
              {!sample.holdActive && !sample.holdBrokenDate && !sample.holdReleasedDate && (
                <span className="text-gray-400 text-xs">No hold</span>
              )}
            </div>
            <div className="flex gap-2">
              {!sample.holdActive && !sample.holdBrokenDate && !sample.holdReleasedDate && (
                <button onClick={() => setShowPlaceHold(v => !v)} className="text-xs text-blue-600 hover:underline">Place Hold</button>
              )}
              {sample.holdActive && !sample.holdReleasedDate && !sample.holdBrokenDate && (
                <>
                  <button onClick={() => saveHold({ holdActive: false, holdReleasedDate: new Date().toISOString().split('T')[0] })} disabled={savingHold}
                    className="text-xs text-green-600 hover:underline disabled:opacity-50">Release Hold</button>
                  <button onClick={() => setShowBreakHold(v => !v)} className="text-xs text-yellow-600 hover:underline ml-2">Break Hold</button>
                </>
              )}
            </div>
          </div>

          <div className="px-4 py-3 text-sm space-y-1">
            {sample.holdActive && !sample.holdReleasedDate && !sample.holdBrokenDate && (
              <>
                {sample.holdRequiredBreakAge && <p className="text-gray-700">Required break to release: <span className="font-medium">{sample.holdRequiredBreakAge}</span></p>}
                {sample.holdPlacedDate && <p className="text-gray-500 text-xs">Hold placed: {sample.holdPlacedDate}</p>}
                {sample.holdNotes && <p className="text-gray-600 text-xs">{sample.holdNotes}</p>}
              </>
            )}
            {sample.holdBrokenDate && (
              <>
                <p className="text-yellow-800">Approved to proceed — hold broken {sample.holdBrokenDate}</p>
                {sample.holdBrokenBy && <p className="text-gray-600 text-xs">Authorized by: {sample.holdBrokenBy}</p>}
                {sample.holdBrokenReason && <p className="text-gray-600 text-xs">Reason: {sample.holdBrokenReason}</p>}
              </>
            )}
            {sample.holdReleasedDate && !sample.holdBrokenDate && (
              <p className="text-green-700">Hold released {sample.holdReleasedDate}</p>
            )}
            {!sample.holdActive && !sample.holdBrokenDate && !sample.holdReleasedDate && (
              <p className="text-gray-400 text-xs">No hold placed on this sample.</p>
            )}
          </div>

          {/* Place hold form */}
          {showPlaceHold && (
            <div className="border-t px-4 py-3 bg-red-50 space-y-2">
              <p className="text-xs font-semibold text-red-800">Place Hold</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Required break age to release</label>
                  <select value={holdForm.requiredBreakAge} onChange={e => setHoldForm(f => ({ ...f, requiredBreakAge: e.target.value }))}
                    className="border rounded px-2 py-1 text-xs w-full">
                    <option value="">Select age</option>
                    {['7day','14day','21day','28day','56day','90day','120day'].map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Hold placed date</label>
                  <input type="date" value={holdForm.placedDate} onChange={e => setHoldForm(f => ({ ...f, placedDate: e.target.value }))}
                    className="border rounded px-2 py-1 text-xs w-full" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">Notes</label>
                <input value={holdForm.notes} onChange={e => setHoldForm(f => ({ ...f, notes: e.target.value }))}
                  className="border rounded px-2 py-1 text-xs w-full" placeholder="Reason for hold..." />
              </div>
              <div className="flex gap-2">
                <button onClick={() => saveHold({ holdActive: true, holdPlacedDate: holdForm.placedDate || new Date().toISOString().split('T')[0], holdRequiredBreakAge: holdForm.requiredBreakAge || null, holdNotes: holdForm.notes || null })}
                  disabled={savingHold} className="bg-red-600 text-white text-xs px-3 py-1.5 rounded hover:bg-red-700 disabled:opacity-50">
                  {savingHold ? 'Saving…' : 'Place Hold'}
                </button>
                <button onClick={() => setShowPlaceHold(false)} className="text-xs text-gray-500 hover:underline">Cancel</button>
              </div>
            </div>
          )}

          {/* Break hold form */}
          {showBreakHold && (
            <div className="border-t px-4 py-3 bg-yellow-50 space-y-2">
              <p className="text-xs font-semibold text-yellow-800">Break Hold — Document Government Approval</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Date approved</label>
                  <input type="date" value={holdForm.brokenDate} onChange={e => setHoldForm(f => ({ ...f, brokenDate: e.target.value }))}
                    className="border rounded px-2 py-1 text-xs w-full" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Authorized by</label>
                  <input value={holdForm.brokenBy} onChange={e => setHoldForm(f => ({ ...f, brokenBy: e.target.value }))}
                    className="border rounded px-2 py-1 text-xs w-full" placeholder="Name / title" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">Reason / basis for approval</label>
                <input value={holdForm.brokenReason} onChange={e => setHoldForm(f => ({ ...f, brokenReason: e.target.value }))}
                  className="border rounded px-2 py-1 text-xs w-full" placeholder="e.g. Approved per NAVFAC letter dated..." />
              </div>
              <div className="flex gap-2">
                <button onClick={() => saveHold({ holdActive: false, holdBrokenDate: holdForm.brokenDate || new Date().toISOString().split('T')[0], holdBrokenBy: holdForm.brokenBy || null, holdBrokenReason: holdForm.brokenReason || null })}
                  disabled={savingHold} className="bg-yellow-600 text-white text-xs px-3 py-1.5 rounded hover:bg-yellow-700 disabled:opacity-50">
                  {savingHold ? 'Saving…' : 'Record Hold Break'}
                </button>
                <button onClick={() => setShowBreakHold(false)} className="text-xs text-gray-500 hover:underline">Cancel</button>
              </div>
            </div>
          )}
        </div>

        {sample.ticketFileUrl && (
          <div className="mt-6">
            <h2 className="font-bold mb-2">Attached Batch Ticket</h2>
            <a href={`/api/samples/${sampleId}/ticket`} target="_blank" className="text-blue-600 hover:underline text-sm">
              View Ticket PDF
            </a>
          </div>
        )}
      </>}
    </div>
  )
}
