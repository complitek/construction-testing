'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { PourEvent } from '@/lib/types'

export default function EditPourPage() {
  const { pourId } = useParams<{ pourId: string }>()
  const router = useRouter()
  const [form, setForm] = useState<Partial<PourEvent>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/pours/${pourId}`).then(r => r.json()).then(setForm)
  }, [pourId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch(`/api/pours/${pourId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    router.push(`/pours/${pourId}`)
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Edit Pour Event</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {(['date', 'spec', 'location', 'description', 'supplier', 'mixId'] as const).map(key => (
          <div key={key}>
            <label className="block text-sm font-medium mb-1 capitalize">{key.replace('mixId', 'Mix ID')}</label>
            <input
              type={key === 'date' ? 'date' : 'text'}
              value={form[key] ?? ''}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        ))}
        <div>
          <label className="block text-sm font-medium mb-1">Shift</label>
          <select value={form.shift ?? 'day'} onChange={e => setForm(f => ({ ...f, shift: e.target.value as 'day' | 'night' }))} className="w-full border rounded px-3 py-2 text-sm">
            <option value="day">Day</option>
            <option value="night">Night</option>
          </select>
        </div>
        <button type="submit" disabled={saving} className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}
