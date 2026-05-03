import Link from 'next/link'

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Construction Testing</h1>
      <p className="text-gray-500 mb-8">Select a testing discipline</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link href="/concrete" className="block p-8 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">
          <h2 className="font-bold text-xl mb-2">Concrete</h2>
          <p className="text-sm opacity-90">Compression reports, pour logs, batch tickets, break results</p>
        </Link>
        <Link href="/soils" className="block p-8 bg-white border-2 border-gray-200 rounded-xl hover:border-amber-400 transition-colors">
          <h2 className="font-bold text-xl mb-2 text-gray-800">Soils</h2>
          <p className="text-sm text-gray-500">Compaction testing, density reports</p>
          <span className="inline-block mt-3 text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">Coming soon</span>
        </Link>
        <Link href="/welding" className="block p-8 bg-white border-2 border-gray-200 rounded-xl hover:border-amber-400 transition-colors">
          <h2 className="font-bold text-xl mb-2 text-gray-800">Welding</h2>
          <p className="text-sm text-gray-500">Weld inspection, certification tracking</p>
          <span className="inline-block mt-3 text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">Coming soon</span>
        </Link>
        <Link href="/structural" className="block p-8 bg-white border-2 border-gray-200 rounded-xl hover:border-amber-400 transition-colors">
          <h2 className="font-bold text-xl mb-2 text-gray-800">Structural</h2>
          <p className="text-sm text-gray-500">Structural inspections and testing records</p>
          <span className="inline-block mt-3 text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">Coming soon</span>
        </Link>
        <Link href="/logs" className="block p-8 bg-gray-800 text-white rounded-xl hover:bg-gray-900 transition-colors">
          <h2 className="font-bold text-xl mb-2">Logs</h2>
          <p className="text-sm opacity-80">Master testing logs across all disciplines</p>
        </Link>
      </div>
    </div>
  )
}
