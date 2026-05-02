import Link from 'next/link'

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Concrete Compression Reports</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link href="/pours/new" className="block p-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <h2 className="font-bold text-lg">New Pour Log</h2>
          <p className="text-sm mt-1 opacity-90">Log a new pour event or scan a batch ticket</p>
        </Link>
        <Link href="/pours" className="block p-6 bg-white border rounded-lg hover:border-blue-400">
          <h2 className="font-bold text-lg">Pour Log</h2>
          <p className="text-sm mt-1 text-gray-500">View all pour events and reports</p>
        </Link>
        <Link href="/log" className="block p-6 bg-white border rounded-lg hover:border-blue-400">
          <h2 className="font-bold text-lg">Master Log</h2>
          <p className="text-sm mt-1 text-gray-500">All placements and break results</p>
        </Link>
        <Link href="/log" className="block p-6 bg-gray-800 text-white rounded-lg hover:bg-gray-900">
          <h2 className="font-bold text-lg">Compression Reports</h2>
          <p className="text-sm mt-1 opacity-80">Download individual or bulk report PDFs</p>
        </Link>
        <Link href="/admin" className="block p-6 bg-white border rounded-lg hover:border-blue-400">
          <h2 className="font-bold text-lg">Admin</h2>
          <p className="text-sm mt-1 text-gray-500">Manage users and templates</p>
        </Link>
      </div>
    </div>
  )
}
