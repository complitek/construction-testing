import Link from 'next/link'

export default function LogsPage() {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-blue-600">Construction Testing</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Logs</span>
      </div>

      <h1 className="text-2xl font-bold mb-8">Testing Logs</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/log" className="block p-6 bg-white border rounded-lg hover:border-blue-400">
          <h2 className="font-bold text-lg">Master Concrete Log</h2>
          <p className="text-sm mt-1 text-gray-500">All concrete placements, break results, and compression reports</p>
        </Link>
        <div className="block p-6 bg-white border rounded-lg border-dashed">
          <h2 className="font-bold text-lg text-gray-400">Soils Log</h2>
          <p className="text-sm mt-1 text-gray-400">Coming soon</p>
        </div>
        <div className="block p-6 bg-white border rounded-lg border-dashed">
          <h2 className="font-bold text-lg text-gray-400">Welding Log</h2>
          <p className="text-sm mt-1 text-gray-400">Coming soon</p>
        </div>
        <div className="block p-6 bg-white border rounded-lg border-dashed">
          <h2 className="font-bold text-lg text-gray-400">Structural Log</h2>
          <p className="text-sm mt-1 text-gray-400">Coming soon</p>
        </div>
      </div>
    </div>
  )
}
