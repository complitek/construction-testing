import { UserButton } from '@clerk/nextjs'
import Link from 'next/link'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-lg text-blue-700">Concrete Reports</Link>
          <Link href="/pours" className="text-sm text-gray-600 hover:text-gray-900">Pour Log</Link>
          <Link href="/admin" className="text-sm text-gray-600 hover:text-gray-900">Admin</Link>
        </div>
        <UserButton />
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
