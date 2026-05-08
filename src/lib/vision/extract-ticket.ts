import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedTicketData } from '@/lib/types'

const client = new Anthropic()

const EXTRACT_PROMPT = `You are reading a concrete batch ticket from a construction project.
Extract the following fields and return ONLY a JSON object with these exact keys:
- batchTicketNumber: the unique sequential ticket/batch number printed on this specific delivery ticket (string or null). It is usually labeled "Ticket #", "Batch #", "Batch Ticket #", "Ticket No.", or similar, and is typically a 4-7 digit number that is unique to this delivery. DO NOT use:
  - The contract or project number (e.g. "P-209", "P209", "P-202") — that's the project, not a ticket
  - The mix design ID (e.g. "HD5KMDD1") — that's the mix, not a ticket
  - The truck #, driver #, sequence #, or load ID — those are not the batch ticket number
  - Any number that appears the same across many tickets
  If the ticket-specific number is not clearly visible, return null.
- date: the date of the batch in ISO format YYYY-MM-DD (string or null)
- supplier: the concrete supplier or plant name (string or null)
- mixId: the mix design ID, mix number, or design strength code (string or null)
- confidence: "high" if all four fields are clearly readable, "medium" if 2-3 are readable, "low" if fewer than 2 are readable

Return ONLY the JSON object. No explanation, no markdown.`

// Project-level identifiers we know appear on these tickets and that the AI
// occasionally confuses for the batch ticket number. Anything matching these
// is forced back to null so we don't store a wrong answer.
const PROJECT_CODE_RE = /^p[\s\-_]?2(09|02|10)$/i
const MIX_DESIGN_RE = /^hd5kmdd1$/i

function parseExtractResponse(raw: string): ExtractedTicketData {
  // Strip markdown code fences if the model wraps its response
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  let data: ExtractedTicketData
  try {
    data = JSON.parse(text) as ExtractedTicketData
  } catch {
    return { batchTicketNumber: null, date: null, supplier: null, mixId: null, confidence: 'low' }
  }
  // Reject known not-a-ticket-number answers — better to mark unreadable than
  // to store the project code as if it were a real batch number.
  if (data.batchTicketNumber) {
    const trimmed = data.batchTicketNumber.trim()
    if (PROJECT_CODE_RE.test(trimmed) || MIX_DESIGN_RE.test(trimmed)) {
      data.batchTicketNumber = null
      data.confidence = 'low'
    }
  }
  return data
}

export async function extractTicketData(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
): Promise<ExtractedTicketData> {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: EXTRACT_PROMPT },
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        ],
      }],
    })
    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
    return parseExtractResponse(raw)
  } catch {
    return { batchTicketNumber: null, date: null, supplier: null, mixId: null, confidence: 'low' }
  }
}

// Per-call hard timeout. Anthropic's default is ~10 min/call and the SDK
// will keep a stuck connection open for the full duration; on a flaky
// network that means a single bad page can stall the whole upload by
// 30+ minutes (3 attempts × 10 min). 45s is enough for a normal Haiku
// PDF call to land while letting failures bail early so retries are cheap.
const EXTRACT_TIMEOUT_MS = 45_000

export async function extractTicketDataFromPdf(
  pdfBytes: Uint8Array,
  attempts = 3,
): Promise<ExtractedTicketData> {
  const base64 = Buffer.from(pdfBytes).toString('base64')
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: EXTRACT_PROMPT },
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          ],
        }],
      }, { timeout: EXTRACT_TIMEOUT_MS })
      const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
      return parseExtractResponse(raw)
    } catch (e) {
      lastErr = e
      if (i < attempts - 1) {
        const delay = 500 * Math.pow(2, i) + Math.floor(Math.random() * 250)
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }
  console.warn('[extract-ticket] all attempts failed:', lastErr instanceof Error ? lastErr.message : lastErr)
  return { batchTicketNumber: null, date: null, supplier: null, mixId: null, confidence: 'low' }
}
