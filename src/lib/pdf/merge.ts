import { PDFDocument } from 'pdf-lib'

export async function mergeReportWithTicket(
  reportPdfBytes: Uint8Array,
  ticketPdfBytes: Uint8Array
): Promise<Uint8Array> {
  const reportDoc = await PDFDocument.load(reportPdfBytes)
  const ticketDoc = await PDFDocument.load(ticketPdfBytes)
  const indices = Array.from({ length: ticketDoc.getPageCount() }, (_, i) => i)
  const ticketPages = await reportDoc.copyPages(ticketDoc, indices)
  ticketPages.forEach(p => reportDoc.addPage(p))
  return reportDoc.save()
}
