'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'

const TEMPLATE_ROLES = ['lab_manager', 'qc_manager', 'alt_qc_manager', 'office_manager']

interface TemplateSection {
  key: string
  label: string
  description: string
  accept: string
  available: boolean
}

const TEMPLATE_SECTIONS: TemplateSection[] = [
  {
    key: 'compression',
    label: 'Concrete Compression Report',
    description: 'Excel template (.xlsx) used to generate compression report PDFs',
    accept: '.xlsx',
    available: true,
  },
  {
    key: 'soils',
    label: 'Soils Compaction Report',
    description: 'Template for soil compaction test reports',
    accept: '.xlsx',
    available: false,
  },
  {
    key: 'welding',
    label: 'Welding Inspection Report',
    description: 'Template for weld inspection records',
    accept: '.xlsx,.pdf',
    available: false,
  },
  {
    key: 'structural',
    label: 'Structural Inspection Report',
    description: 'Template for structural testing records',
    accept: '.xlsx,.pdf',
    available: false,
  },
]

function TemplateRow({ section }: { section: TemplateSection }) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (section.available) {
      fetch('/api/admin/template').then(r => r.json()).then(d => setUrl(d.url)).catch(() => {})
    }
  }, [section.available])

  async function upload() {
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/admin/template', { method: 'POST', body: fd })
    const data = await res.json()
    setUrl(data.url)
    setFile(null)
    setUploading(false)
  }

  return (
    <div className={`bg-white border rounded-lg p-5 ${!section.available ? 'opacity-60' : ''}`}>
      <div className="flex justify-between items-start mb-1">
        <h3 className="font-semibold text-gray-900">{section.label}</h3>
        {!section.available && (
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Coming soon</span>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-3">{section.description}</p>

      {section.available ? (
        <>
          {url && (
            <p className="text-xs text-green-700 mb-3">
              Current template on file.{' '}
              <a href={url} target="_blank" rel="noreferrer" className="underline">Download</a>
            </p>
          )}
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept={section.accept}
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-gray-600"
            />
            <button
              onClick={upload}
              disabled={!file || uploading}
              className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              {uploading ? 'Uploading...' : url ? 'Replace Template' : 'Upload Template'}
            </button>
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-400">Template management for this discipline will be available when the module is built.</p>
      )}
    </div>
  )
}

export default function TemplatesPage() {
  const { user, isLoaded } = useUser()
  const role = user?.publicMetadata?.role as string | undefined
  const canAccess = TEMPLATE_ROLES.includes(role ?? '')

  return (
    <div>
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 flex-wrap">
        <Link href="/" className="hover:text-blue-600">Construction Testing</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Templates</span>
      </div>

      <h1 className="text-2xl font-bold mb-2">Report Templates</h1>
      <p className="text-gray-500 text-sm mb-8">Upload and manage templates used to generate official testing reports</p>

      {!isLoaded ? (
        <p className="text-gray-400">Loading...</p>
      ) : !canAccess ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
          <p className="text-red-800 font-medium text-lg mb-2">Access Restricted</p>
          <p className="text-red-600 text-sm">Template management is restricted to Lab Managers, QC Managers, and Office Managers.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {TEMPLATE_SECTIONS.map(section => (
            <TemplateRow key={section.key} section={section} />
          ))}
        </div>
      )}
    </div>
  )
}
