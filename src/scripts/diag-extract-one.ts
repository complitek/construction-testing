import { db } from '@/lib/db'
import { ticketRecords } from '@/lib/db/schema'
import { eq, isNull, or } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'

// Usage: npx dotenv -e .env.local -- npx tsx src/scripts/diag-extract-one.ts [ticketId]
// Without an arg: pulls the first null-batch ticket.
//
// Runs extraction with the same prompt the bulk-upload uses, but prints the
// RAW model response (not just the parsed JSON) so we can see why a clear PDF
// is coming back as unreadable.

const PROMPT = `You are reading a concrete batch ticket from a construction project.
Extract the following fields and return ONLY a JSON object with these exact keys:
- batchTicketNumber: the batch/ticket number printed on the ticket (string or null)
- date: the date of the batch in ISO format YYYY-MM-DD (string or null)
- supplier: the concrete supplier or plant name (string or null)
- mixId: the mix design ID, mix number, or design strength code (string or null)
- confidence: "high" if all four fields are clearly readable, "medium" if 2-3 are readable, "low" if fewer than 2 are readable

Return ONLY the JSON object. No explanation, no markdown.`

async function main() {
  const arg = process.argv[2]
  let ticket: { id: string; fileUrl: string; batch: string | null } | undefined

  if (arg) {
    const [t] = await db.select({ id: ticketRecords.id, fileUrl: ticketRecords.fileUrl, batch: ticketRecords.batchTicketNumber })
      .from(ticketRecords).where(eq(ticketRecords.id, arg))
    ticket = t
  } else {
    const [t] = await db.select({ id: ticketRecords.id, fileUrl: ticketRecords.fileUrl, batch: ticketRecords.batchTicketNumber })
      .from(ticketRecords).where(or(
        isNull(ticketRecords.batchTicketNumber),
        eq(ticketRecords.batchTicketNumber, ''),
        eq(ticketRecords.batchTicketNumber, 'null'),
      )).limit(1)
    ticket = t
  }

  if (!ticket) { console.log('No ticket found.'); process.exit(0) }
  console.log(`Ticket id=${ticket.id}`)
  console.log(`Current batch: ${JSON.stringify(ticket.batch)}`)
  console.log(`URL: ${ticket.fileUrl}\n`)

  const fetchRes = await fetch(ticket.fileUrl, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  })
  console.log(`Blob fetch: ${fetchRes.status} ${fetchRes.statusText}`)
  if (!fetchRes.ok) { process.exit(1) }
  const bytes = new Uint8Array(await fetchRes.arrayBuffer())
  console.log(`PDF bytes: ${bytes.byteLength} (${(bytes.byteLength / 1024).toFixed(1)} KB)`)
  const base64 = Buffer.from(bytes).toString('base64')
  console.log(`Base64 length: ${base64.length} chars\n`)

  const client = new Anthropic()

  for (const model of ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6']) {
    console.log(`---- ${model} ----`)
    try {
      const t0 = Date.now()
      const response = await client.messages.create({
        model,
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          ],
        }],
      }, { timeout: 60_000 })
      const elapsed = Date.now() - t0
      const raw = response.content[0].type === 'text' ? response.content[0].text : '(non-text response)'
      console.log(`Latency: ${elapsed}ms`)
      console.log(`Stop reason: ${response.stop_reason}`)
      console.log(`Tokens: in=${response.usage.input_tokens} out=${response.usage.output_tokens}`)
      console.log(`Raw response:\n${raw}\n`)
    } catch (e) {
      console.log(`ERROR: ${e instanceof Error ? e.message : e}\n`)
    }
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
