import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedTicketData } from '@/lib/types'

const client = new Anthropic()

export async function extractTicketData(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
): Promise<ExtractedTicketData> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: imageBase64 },
        },
        {
          type: 'text',
          text: `You are reading a concrete batch ticket from a construction project.
Extract the following fields and return ONLY a JSON object with these exact keys:
- batchTicketNumber: the batch/ticket number printed on the ticket (string or null)
- date: the date of the batch in ISO format YYYY-MM-DD (string or null)
- supplier: the concrete supplier or plant name (string or null)
- mixId: the mix design ID, mix number, or design strength code (string or null)
- confidence: "high" if all four fields are clearly readable, "medium" if 2-3 are readable, "low" if fewer than 2 are readable

Return ONLY the JSON object. No explanation, no markdown.`,
        },
      ],
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
  try {
    return JSON.parse(text) as ExtractedTicketData
  } catch {
    return { batchTicketNumber: null, date: null, supplier: null, mixId: null, confidence: 'low' }
  }
}

export async function extractTicketDataFromPdf(
  pdfBytes: Uint8Array
): Promise<ExtractedTicketData> {
  const base64 = Buffer.from(pdfBytes).toString('base64')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        },
        {
          type: 'text',
          text: `You are reading a concrete batch ticket from a construction project.
Extract the following fields and return ONLY a JSON object with these exact keys:
- batchTicketNumber: the batch/ticket number printed on the ticket (string or null)
- date: the date of the batch in ISO format YYYY-MM-DD (string or null)
- supplier: the concrete supplier or plant name (string or null)
- mixId: the mix design ID, mix number, or design strength code (string or null)
- confidence: "high" if all four fields are clearly readable, "medium" if 2-3 are readable, "low" if fewer than 2 are readable

Return ONLY the JSON object. No explanation, no markdown.`,
        },
      ],
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
  try {
    return JSON.parse(text) as ExtractedTicketData
  } catch {
    return { batchTicketNumber: null, date: null, supplier: null, mixId: null, confidence: 'low' }
  }
}
