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

export function getPageCount(pdfBytes: Uint8Array): Promise<number> {
  return PDFDocument.load(pdfBytes).then(doc => doc.getPageCount())
}
