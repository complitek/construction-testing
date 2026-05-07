import { PDFDocument } from 'pdf-lib'

export async function extractPageRange(
  combinedPdfBytes: Uint8Array,
  pageStart: number,
  pageEnd: number
): Promise<Uint8Array> {
  const sourceDoc = await PDFDocument.load(combinedPdfBytes)
  const newDoc = await PDFDocument.create()
  const indices = Array.from({ length: pageEnd - pageStart + 1 }, (_, i) => pageStart + i)
  const pages = await newDoc.copyPages(sourceDoc, indices)
  pages.forEach(p => newDoc.addPage(p))
  return newDoc.save()
}

// Split a multi-page PDF into N single-page PDFs in one pass.
// Loads + parses the source PDF only once instead of N times.
export async function splitToSinglePages(combinedPdfBytes: Uint8Array): Promise<Uint8Array[]> {
  const sourceDoc = await PDFDocument.load(combinedPdfBytes)
  const total = sourceDoc.getPageCount()
  const out: Uint8Array[] = new Array(total)
  for (let i = 0; i < total; i++) {
    const newDoc = await PDFDocument.create()
    const [page] = await newDoc.copyPages(sourceDoc, [i])
    newDoc.addPage(page)
    out[i] = await newDoc.save()
  }
  return out
}

export function getPageCount(pdfBytes: Uint8Array): Promise<number> {
  return PDFDocument.load(pdfBytes).then(doc => doc.getPageCount())
}

export async function mergePdfPages(pageBuffers: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create()
  for (const buf of pageBuffers) {
    const doc = await PDFDocument.load(buf)
    const pages = await merged.copyPages(doc, doc.getPageIndices())
    pages.forEach(p => merged.addPage(p))
  }
  return merged.save()
}
