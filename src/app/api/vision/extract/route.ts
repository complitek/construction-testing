import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { extractTicketData } from '@/lib/vision/extract-ticket'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageBase64, mediaType } = await request.json()
  if (!imageBase64 || !mediaType) {
    return NextResponse.json({ error: 'imageBase64 and mediaType required' }, { status: 400 })
  }

  const extracted = await extractTicketData(imageBase64, mediaType)
  return NextResponse.json(extracted)
}
