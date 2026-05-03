import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { ticketRecords } from '@/lib/db/schema'
import { getUserRole } from '@/lib/auth/get-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { put } from '@vercel/blob'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (!role || !hasPermission(role, 'upload_combined_pdf')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const pourId = formData.get('pourId') as string | null
  const ticketNumber = formData.get('ticketNumber') as string | null

  if (!file || !pourId) {
    return NextResponse.json({ error: 'file and pourId required' }, { status: 400 })
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN === 'vercel_blob_replace_me') {
    return NextResponse.json({ error: 'File storage is not configured yet.' }, { status: 503 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const blob = await put(
    `tickets/attached/${pourId}-${Date.now()}-${file.name}`,
    bytes,
    { access: 'public', contentType: file.type }
  )

  const [record] = await db.insert(ticketRecords).values({
    pourEventId: pourId,
    batchTicketNumber: ticketNumber || null,
    pageStart: 0,
    pageEnd: 0,
    fileUrl: blob.url,
    sampleSetId: null,
  }).returning()

  return NextResponse.json(record, { status: 201 })
}
