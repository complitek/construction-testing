import { describe, it, expect } from 'vitest'
import { extractPageRange } from '@/lib/pdf/split'
import { PDFDocument } from 'pdf-lib'

async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage()
  return doc.save()
}

describe('extractPageRange', () => {
  it('extracts a single page from a multi-page PDF', async () => {
    const pdf = await makePdf(5)
    const extracted = await extractPageRange(pdf, 0, 0)
    const doc = await PDFDocument.load(extracted)
    expect(doc.getPageCount()).toBe(1)
  })

  it('extracts two pages for a 2-page ticket', async () => {
    const pdf = await makePdf(5)
    const extracted = await extractPageRange(pdf, 1, 2)
    const doc = await PDFDocument.load(extracted)
    expect(doc.getPageCount()).toBe(2)
  })
})
