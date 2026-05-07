import Anthropic from '@anthropic-ai/sdk'

export interface CellMapping {
  sheet: string
  cell: string
}

export interface FieldMapping {
  date?: CellMapping
  shift?: CellMapping
  spec?: CellMapping
  location?: CellMapping
  description?: CellMapping
  supplier?: CellMapping
  mixId?: CellMapping
  definableFeature?: CellMapping
  batchTicketNumber?: CellMapping
  sampledBy?: CellMapping
  testedBy?: CellMapping
  sampleType?: CellMapping
  sampleIdRange?: CellMapping
  quantitySize?: CellMapping
  temperature?: CellMapping
  slump?: CellMapping
  airContent?: CellMapping
  unitWeight?: CellMapping
  wcRatio?: CellMapping
  astmC1611Flow?: CellMapping
  vsi?: CellMapping
  ambientTemp?: CellMapping
  area?: CellMapping
  pfuLocation?: CellMapping
  wallPanelControlNo?: CellMapping
  structure?: CellMapping
  element?: CellMapping
  volumeCy?: CellMapping
  totalDailyVol?: CellMapping
  marineConcreteCumulative?: CellMapping
  marineConcreteLoNumber?: CellMapping
  requiredCompStrength?: CellMapping
  compliance?: CellMapping
  break1day?: CellMapping
  break3day?: CellMapping
  break4day?: CellMapping
  break5day?: CellMapping
  break7day?: CellMapping
  break14day?: CellMapping
  break21day?: CellMapping
  break28day?: CellMapping
  break56day?: CellMapping
  break90day?: CellMapping
  break120day?: CellMapping
  date1day?: CellMapping
  date3day?: CellMapping
  date4day?: CellMapping
  date5day?: CellMapping
  date7day?: CellMapping
  date14day?: CellMapping
  date21day?: CellMapping
  date28day?: CellMapping
  date56day?: CellMapping
  date90day?: CellMapping
  date120day?: CellMapping
}

export async function analyzeTemplateMapping(excelBytes: Buffer): Promise<FieldMapping> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(excelBytes as any)

  // Extract all non-empty cells with their sheet + address
  const lines: string[] = []
  wb.eachSheet(sheet => {
    sheet.eachRow({ includeEmpty: false }, row => {
      row.eachCell({ includeEmpty: false }, cell => {
        let val = ''
        if (typeof cell.value === 'string') {
          val = cell.value
        } else if (typeof cell.value === 'number') {
          val = String(cell.value)
        } else if (cell.value && typeof cell.value === 'object') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const v = cell.value as any as Record<string, unknown>
          if ('richText' in v && Array.isArray(v.richText)) {
            val = (v.richText as Array<{ text: string }>).map(r => r.text).join('')
          } else if ('formula' in v) {
            val = `[formula]`
          }
        }
        val = val.trim()
        if (val) lines.push(`${sheet.name}!${cell.address}: ${val}`)
      })
    })
  })

  const cellData = lines.slice(0, 400).join('\n')

  const client = new Anthropic()
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `You are analyzing an Excel template for a concrete compression test report used in military/government construction (NAVFAC/Army Corps).

The template cells are listed below in format "SheetName!CellAddress: value":
${cellData}

Your job: for each data field listed below, identify the cell where the actual DATA VALUE should be written (not the label cell — the adjacent blank or value cell next to the label).

Data fields to map:
- date: pour/placement date (MM/DD/YYYY)
- shift: day or night shift
- spec: specification number (e.g. SpecSection, UFC, etc.)
- definableFeature: definable feature of work (DFOW)
- location: placement location
- description: pour description
- area: placement area
- pfuLocation: PFU location
- wallPanelControlNo: wall panel control number
- structure: structure name
- element: structural element
- supplier: concrete supplier / plant name
- mixId: mix design ID / class
- batchTicketNumber: batch ticket number
- sampleType: sample type (e.g. composite, grab)
- sampledBy: name of person who sampled
- testedBy: name of person who tested
- sampleIdRange: lab sample ID range
- quantitySize: cylinder quantity and size
- temperature: concrete temperature °F
- slump: slump in inches
- airContent: air content %
- unitWeight: unit weight pcf
- wcRatio: water/cement ratio
- astmC1611Flow: ASTM C1611 flow
- vsi: visual stability index (VSI)
- ambientTemp: ambient temperature
- volumeCy: batch/load volume in CY
- totalDailyVol: total daily volume CY
- marineConcreteCumulative: cumulative marine concrete CY
- marineConcreteLoNumber: marine concrete lot number
- requiredCompStrength: required compressive strength psi
- compliance: compliance result (PASS / FAIL / N/A)
- break1day, break3day, break7day, break14day, break21day, break28day, break56day, break90day, break120day: break strength results in psi for each age
- date1day, date3day, date7day, date14day, date21day, date28day, date56day, date90day, date120day: scheduled break dates for each age

Rules:
1. Look for label text like "Batch Ticket:", "Date:", "Mix ID:", "7-Day:", etc. and map to the adjacent value cell
2. If a label is in column A, the value is likely in column B or C of the same row
3. If breaks are in a table (rows for each age), find the result column
4. Only include fields you are confident about
5. Return ONLY a valid JSON object, no explanation, no markdown

Example output:
{"date": {"sheet": "Sheet1", "cell": "C4"}, "batchTicketNumber": {"sheet": "Sheet1", "cell": "C6"}}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return {}

  try {
    return JSON.parse(jsonMatch[0]) as FieldMapping
  } catch {
    return {}
  }
}
