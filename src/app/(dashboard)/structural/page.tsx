import Link from 'next/link'

export default function StructuralPage() {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-blue-600">Construction Testing</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Structural</span>
      </div>
      <h1 className="text-2xl font-bold mb-4">Structural Testing</h1>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-8 text-center">
        <p className="text-amber-800 font-medium text-lg mb-2">Coming Soon</p>
        <p className="text-amber-700 text-sm">Structural inspection and testing records will be available here.</p>
      </div>
    </div>
  )
}
