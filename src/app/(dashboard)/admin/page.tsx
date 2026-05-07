'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import DropZone from '@/components/DropZone'
import type { AppUser, Role } from '@/lib/types'

const ROLES: Role[] = [
  'lab_tech', 'lab_manager', 'office_manager', 'field_tech',
  'concrete_qc_manager', 'qc_manager', 'alt_qc_manager',
]

interface ProjectSettings {
  projectName: string
  projectLocation: string
  companyName: string
  contractNumber: string
  reportPreparedBy: string
  brandColor: string
}

export default function AdminPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'lab_tech' as Role })
  const [adding, setAdding] = useState(false)
  const [templateFile, setTemplateFile] = useState<File | null>(null)
  const [uploadingTemplate, setUploadingTemplate] = useState(false)
  const [templateUrl, setTemplateUrl] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [deletingLogo, setDeletingLogo] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({
    projectName: '', projectLocation: '', companyName: '', contractNumber: '', reportPreparedBy: '', brandColor: '',
  })
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  useEffect(() => {
    fetch('/api/admin/users').then(r => r.json()).then(setUsers).catch(() => {})
    fetch('/api/admin/template').then(r => r.json()).then(d => setTemplateUrl(d.url)).catch(() => {})
    fetch('/api/admin/logo').then(r => r.json()).then(d => setLogoUrl(d.url)).catch(() => {})
    fetch('/api/admin/project-settings').then(r => r.json()).then(d => {
      setProjectSettings({
        projectName:      d.projectName      ?? '',
        projectLocation:  d.projectLocation  ?? '',
        companyName:      d.companyName       ?? '',
        contractNumber:   d.contractNumber    ?? '',
        reportPreparedBy: d.reportPreparedBy  ?? '',
        brandColor:       d.brandColor        ?? '',
      })
    }).catch(() => {})
  }, [])

  async function saveProjectSettings(e: React.FormEvent) {
    e.preventDefault()
    setSavingSettings(true)
    setSettingsSaved(false)
    await fetch('/api/admin/project-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectSettings),
    })
    setSavingSettings(false)
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 3000)
  }

  async function uploadLogo(file: File) {
    setUploadingLogo(true)
    setLogoError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/logo', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setLogoError(data.error ?? `Upload failed (${res.status})`)
        return
      }
      setLogoUrl(data.url)
    } catch (e) {
      setLogoError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploadingLogo(false)
    }
  }

  async function deleteLogo() {
    setDeletingLogo(true)
    await fetch('/api/admin/logo', { method: 'DELETE' })
    setLogoUrl(null)
    setDeletingLogo(false)
  }

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
      <div className="flex items-center gap-1.5 text-sm text-gray-500 flex-wrap">
        <Link href="/" className="hover:text-blue-600">Construction Testing</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Admin</span>
      </div>
      <section>
        <h1 className="text-2xl font-bold mb-6">Admin</h1>

        <h2 className="font-bold text-lg mb-4">Project Settings</h2>
        <form onSubmit={saveProjectSettings} className="bg-white border rounded-lg p-5 space-y-4 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Project Name</label>
              <input
                placeholder="e.g. P209 Dry Dock Replacement"
                value={projectSettings.projectName}
                onChange={e => setProjectSettings(s => ({ ...s, projectName: e.target.value }))}
                className="border rounded px-3 py-2 text-sm w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Project Location</label>
              <input
                placeholder="e.g. Joint Base Pearl Harbor-Hickam, HI"
                value={projectSettings.projectLocation}
                onChange={e => setProjectSettings(s => ({ ...s, projectLocation: e.target.value }))}
                className="border rounded px-3 py-2 text-sm w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company Name</label>
              <input
                placeholder="e.g. 3G2B LLC"
                value={projectSettings.companyName}
                onChange={e => setProjectSettings(s => ({ ...s, companyName: e.target.value }))}
                className="border rounded px-3 py-2 text-sm w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contract Number</label>
              <input
                placeholder="e.g. N62742-22-C-1234"
                value={projectSettings.contractNumber}
                onChange={e => setProjectSettings(s => ({ ...s, contractNumber: e.target.value }))}
                className="border rounded px-3 py-2 text-sm w-full"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Report Prepared By</label>
              <input
                placeholder="Company or lab name that appears on reports"
                value={projectSettings.reportPreparedBy}
                onChange={e => setProjectSettings(s => ({ ...s, reportPreparedBy: e.target.value }))}
                className="border rounded px-3 py-2 text-sm w-full"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Report Color Theme</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={projectSettings.brandColor || '#1f2937'}
                  onChange={e => setProjectSettings(s => ({ ...s, brandColor: e.target.value }))}
                  className="h-9 w-14 rounded border cursor-pointer p-0.5"
                />
                <span className="text-sm text-gray-500">{projectSettings.brandColor || '#1f2937 (default)'}</span>
                {projectSettings.brandColor && (
                  <button
                    type="button"
                    onClick={() => setProjectSettings(s => ({ ...s, brandColor: '' }))}
                    className="text-xs text-gray-400 hover:text-red-600 underline"
                  >
                    Reset to default
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">Applied to the report header and section labels.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={savingSettings}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
            {settingsSaved && <span className="text-sm text-green-700">Settings saved.</span>}
          </div>
        </form>

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
        <h2 className="font-bold text-lg mb-4">Company Logo</h2>
        <div className="bg-white border rounded-lg p-5">
          {logoUrl && (
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-500 mb-2">Current Logo (used on report PDFs)</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Company logo" className="h-14 object-contain border rounded p-1 bg-gray-50" />
            </div>
          )}
          <DropZone
            accept="image/*"
            disabled={uploadingLogo}
            label={uploadingLogo ? 'Uploading…' : logoUrl ? 'Drag & drop a new logo (PNG / JPG / SVG)' : 'Drag & drop your logo here (PNG / JPG / SVG)'}
            onFile={uploadLogo}
          />
          {logoError && (
            <p className="text-sm text-red-600 mt-3">{logoError}</p>
          )}
          <div className="flex gap-2 mt-3">
            {logoUrl && (
              <button
                onClick={deleteLogo}
                disabled={deletingLogo}
                className="border border-red-300 text-red-600 px-4 py-2 rounded text-sm hover:bg-red-50 disabled:opacity-50"
              >
                {deletingLogo ? 'Removing...' : 'Remove Logo'}
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">PNG or JPG. Appears in the top-left of generated reports.</p>
        </div>
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
