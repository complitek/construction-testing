import Link from 'next/link'

export default function ConcretePage() {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-blue-600">Construction Testing</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Concrete</span>
      </div>

      <h1 className="text-2xl font-bold mb-8">Concrete Testing</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link href="/pours/new" className="block p-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <h2 className="font-bold text-lg">New Pour Log</h2>
          <p className="text-sm mt-1 opacity-90">Log a new pour event or scan a batch ticket</p>
        </Link>
        <Link href="/log" className="block p-6 bg-white border rounded-lg hover:border-blue-400">
          <h2 className="font-bold text-lg">Concrete Log &amp; Reports</h2>
          <p className="text-sm mt-1 text-gray-500">All placements, break results, and compression report PDFs</p>
        </Link>
        <Link href="/tickets" className="block p-6 bg-white border rounded-lg hover:border-blue-400">
          <h2 className="font-bold text-lg">Batch Tickets</h2>
          <p className="text-sm mt-1 text-gray-500">View all uploaded batch tickets by month</p>
        </Link>
        <Link href="/breaks" className="block p-6 bg-white border border-orange-300 rounded-lg hover:border-orange-500">
          <h2 className="font-bold text-lg text-orange-700">Break Schedule</h2>
          <p className="text-sm mt-1 text-gray-500">View overdue and upcoming cylinder breaks</p>
        </Link>
        <Link href="/dd5-pfu-tremie" className="block p-6 bg-white border rounded-lg hover:border-blue-400">
          <h2 className="font-bold text-lg">DD5 PFU Tremie</h2>
          <p className="text-sm mt-1 text-gray-500">Summary log — pre-aggregated pour data from all placements</p>
        </Link>
      </div>
    </div>
  )
}
