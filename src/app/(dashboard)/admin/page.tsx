'use client'
import { useEffect, useState } from 'react'
import type { AppUser, Role } from '@/lib/types'

const ROLES: Role[] = [
  'lab_tech', 'lab_manager', 'office_manager', 'field_tech',
  'concrete_qc_manager', 'qc_manager', 'alt_qc_manager',
]

export default function AdminPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'lab_tech' as Role })
  const [adding, setAdding] = useState(false)
  const [templateFile, setTemplateFile] = useState<File | null>(null)
  const [uploadingTemplate, setUploadingTemplate] = useState(false)
  const [templateUrl, setTemplateUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/users').then(r => r.json()).then(setUsers).catch(() => {})
    fetch('/api/admin/template').then(r => r.json()).then(d => setTemplateUrl(d.url)).catch(() => {})
  }, [])

  async function addUser(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newUser, newRole: newUser.role }),
    })
    const user = await res.json()
    setUsers(u => [...u, user])
    setNewUser({ name: '', email: '', password: '', role: 'lab_tech' })
    setAdding(false)
  }

  async function uploadTemplate() {
    if (!templateFile) return
    setUploadingTemplate(true)
    const fd = new FormData()
    fd.append('file', templateFile)
    const res = await fetch('/api/admin/template', { method: 'POST', body: fd })
    const data = await res.json()
    setTemplateUrl(data.url)
    setUploadingTemplate(false)
  }

  return (
    <div className="max-w-3xl space-y-10">
      <section>
        <h1 className="text-2xl font-bold mb-6">Admin</h1>

        <h2 className="font-bold text-lg mb-4">Team Members</h2>
        <div className="bg-white border rounded-lg overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b">
                  <td className="px-4 py-3">{u.name}</td>
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3 capitalize">{u.role.replace(/_/g, ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="font-medium mb-3">Add Team Member</h3>
        <form onSubmit={addUser} className="grid grid-cols-2 gap-3">
          <input placeholder="Full name" required value={newUser.name} onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))} className="border rounded px-3 py-2 text-sm" />
          <input placeholder="Email" type="email" required value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} className="border rounded px-3 py-2 text-sm" />
          <input placeholder="Temporary password" type="password" required value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} className="border rounded px-3 py-2 text-sm" />
          <select value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value as Role }))} className="border rounded px-3 py-2 text-sm">
            {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
          </select>
          <button type="submit" disabled={adding} className="col-span-2 bg-blue-600 text-white py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
            {adding ? 'Adding...' : 'Add Member'}
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-bold text-lg mb-4">Excel Report Template</h2>
        {templateUrl && <p className="text-sm text-green-700 mb-3">Template uploaded. <a href={templateUrl} className="underline">View</a></p>}
        <input type="file" accept=".xlsx" onChange={e => setTemplateFile(e.target.files?.[0] ?? null)} className="text-sm mb-3 block" />
        <button onClick={uploadTemplate} disabled={!templateFile || uploadingTemplate} className="bg-gray-800 text-white px-4 py-2 rounded text-sm hover:bg-gray-900 disabled:opacity-50">
          {uploadingTemplate ? 'Uploading...' : 'Upload Template'}
        </button>
      </section>
    </div>
  )
}
