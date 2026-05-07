import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedTicketData } from '@/lib/types'

const client = new Anthropic()

const EXTRACT_PROMPT = `You are reading a concrete batch ticket from a construction project.
Extract the following fields and return ONLY a JSON object with these exact keys:
- batchTicketNumber: the batch/ticket number printed on the ticket (string or null)
- date: the date of the batch in ISO format YYYY-MM-DD (string or null)
- supplier: the concrete supplier or plant name (string or null)
- mixId: the mix design ID, mix number, or design strength code (string or null)
- confidence: "high" if all four fields are clearly readable, "medium" if 2-3 are readable, "low" if fewer than 2 are readable

Return ONLY the JSON object. No explanation, no markdown.`

function parseExtractResponse(raw: string): ExtractedTicketData {
  // Strip markdown code fences if the model wraps its response
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    return JSON.parse(text) as ExtractedTicketData
  } catch {
    return { batchTicketNumber: null, date: null, supplier: null, mixId: null, confidence: 'low' }
  }
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
      })
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
