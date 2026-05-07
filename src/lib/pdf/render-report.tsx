import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToBuffer, Image } from '@react-pdf/renderer'
import type { BreakAge } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'
import { calculateAllBreakDates } from '@/lib/utils/break-dates'

// ---------------------------------------------------------------------------
// Interfaces — kept exactly as-is
// ---------------------------------------------------------------------------

export interface ProjectSettings {
  projectName?: string | null
  projectLocation?: string | null
  companyName?: string | null
  contractNumber?: string | null
  reportPreparedBy?: string | null
  logoUrl?: string | null
  brandColor?: string | null
}

export interface ReportData {
  // Pour info
  date: string
  shift: string
  spec: string
  location: string
  description: string
  supplier: string
  mixId: string
  definableFeature: string | null
  // Sample info
  batchTicketNumber: string
  sampleIdRange: string | null
  quantitySize: string | null
  area: string | null
  pfuLocation: string | null
  wallPanelControlNo: string | null
  structure: string | null
  element: string | null
  sampledBy: string | null
  sampleType: string | null
  testedBy: string | null
  // Field tests
  slump: string | null
  astmC1611Flow: number | null
  airContent: number | null
  temperature: number | null
  unitWeight: number | null
  wcRatio: number | null
  vsi: number | null
  ambientTemp: number | null
  // Volume / lot
  volumeCy: string | null
  marineConcreteCumulative: number | null
  marineConcreteLoNumber: string | null
  // Acceptance
  requiredCompStrength: number | null
  compliance: string | null
  // Breaks
  breaks: Partial<Record<BreakAge, number>>
  // Hold tracking
  holdActive?: boolean | null
  holdPlacedDate?: string | null
  holdReleasedDate?: string | null
  holdBrokenDate?: string | null
  holdBrokenBy?: string | null
  holdBrokenReason?: string | null
  holdRequiredBreakAge?: string | null
  holdNotes?: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y}`
}

function fv(v: string | number | null | undefined, suffix = ''): string {
  return v != null ? `${v}${suffix}` : ''
}

function lightenHex(hex: string, factor: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return '#e5e7eb'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const lr = Math.min(255, Math.round(r + (255 - r) * factor))
  const lg = Math.min(255, Math.round(g + (255 - g) * factor))
  const lb = Math.min(255, Math.round(b + (255 - b) * factor))
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`
}

// Area of a 4-inch diameter cylinder: π*(2)^2 ≈ 12.57 in²
const CYLINDER_AREA = 12.57

function calcMaxLoad(psi: number): string {
  return String(Math.round((psi * CYLINDER_AREA) / 10) * 10)
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const B = 'Helvetica-Bold'
const R = 'Helvetica'

const s = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingBottom: 20,
    paddingLeft: 24,
    paddingRight: 24,
    fontSize: 8,
    fontFamily: R,
  },

  // Title bar
  titleBar: {
    backgroundColor: '#1f2937',
    paddingTop: 5,
    paddingBottom: 4,
    paddingHorizontal: 4,
    marginBottom: 0,
  },
  titleText: {
    color: '#ffffff',
    fontSize: 11,
    fontFamily: B,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 3,
  },
  titleSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  titleSubText: {
    color: '#000000',
    fontSize: 8,
    fontFamily: R,
  },

  // Section header (gray bar)
  sectionHeader: {
    backgroundColor: '#e5e7eb',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderTop: '0.5px solid #9ca3af',
    borderBottom: '0.5px solid #9ca3af',
  },
  sectionHeaderText: {
    fontSize: 8,
    fontFamily: B,
    textTransform: 'uppercase',
  },

  // Info grid
  infoGrid: {
    flexDirection: 'column',
    border: '0.5px solid #9ca3af',
    borderTop: 'none',
    marginBottom: 0,
  },
  infoRow: {
    flexDirection: 'row',
    borderBottom: '0.5px solid #d1d5db',
    minHeight: 14,
  },
  infoRowLast: {
    flexDirection: 'row',
    minHeight: 14,
  },
  infoCell: {
    paddingVertical: 2,
    paddingHorizontal: 3,
    borderRight: '0.5px solid #d1d5db',
  },
  infoLabel: {
    fontFamily: B,
    fontSize: 7,
  },
  infoValue: {
    fontFamily: R,
    fontSize: 8,
  },
  colLabel1: { width: '18%' },
  colValue1: { width: '32%' },
  colLabel2: { width: '18%' },
  colValue2: { width: '32%', borderRight: 'none' },

  // Material tested row
  materialRow: {
    flexDirection: 'row',
    border: '0.5px solid #9ca3af',
    borderTop: 'none',
    paddingVertical: 3,
    paddingHorizontal: 4,
    marginBottom: 0,
  },
  materialText: {
    fontSize: 8,
    fontFamily: R,
  },

  // Concrete info table
  concTable: {
    border: '0.5px solid #9ca3af',
    borderTop: 'none',
    marginBottom: 0,
  },
  concHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#e5e7eb',
    borderBottom: '0.5px solid #9ca3af',
  },
  concRow: {
    flexDirection: 'row',
    borderBottom: '0.5px solid #d1d5db',
    minHeight: 13,
  },
  concRowLast: {
    flexDirection: 'row',
    minHeight: 13,
  },
  concCell: {
    paddingVertical: 2,
    paddingHorizontal: 3,
    borderRight: '0.5px solid #d1d5db',
  },
  concCellLast: {
    paddingVertical: 2,
    paddingHorizontal: 3,
  },
  cTest: { width: '28%' },
  cAstm: { width: '16%' },
  cResult: { width: '28%' },
  cUnit: { width: '28%' },
  concHeaderText: { fontSize: 7, fontFamily: B },
  concCellText: { fontSize: 8, fontFamily: R },

  waterRow: {
    border: '0.5px solid #9ca3af',
    borderTop: 'none',
    paddingVertical: 3,
    paddingHorizontal: 4,
    marginBottom: 0,
  },
  waterText: { fontSize: 8, fontFamily: R },

  // Break data table
  breakTable: {
    border: '0.5px solid #9ca3af',
    borderTop: 'none',
    marginBottom: 0,
  },
  breakHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#e5e7eb',
    borderBottom: '0.5px solid #9ca3af',
  },
  breakRow: {
    flexDirection: 'row',
    borderBottom: '0.5px solid #d1d5db',
    minHeight: 13,
  },
  breakRowLast: {
    flexDirection: 'row',
    minHeight: 13,
  },
  breakCell: {
    paddingVertical: 2,
    paddingHorizontal: 2,
    borderRight: '0.5px solid #d1d5db',
  },
  breakCellLast: {
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  breakHeaderText: { fontSize: 6.5, fontFamily: B, textAlign: 'center' },
  breakCellText: { fontSize: 7.5, fontFamily: R, textAlign: 'center' },
  bLab:    { width: '9%' },
  bSample: { width: '9%' },
  bAge:    { width: '9%' },
  bDate:   { width: '12%' },
  bDiam:   { width: '9%' },
  bLoad:   { width: '12%' },
  bArea:   { width: '15%' },
  bPsi:    { width: '14%' },
  bFrac:   { width: '11%' },

  summaryRow: {
    border: '0.5px solid #9ca3af',
    borderTop: 'none',
    paddingVertical: 3,
    paddingHorizontal: 4,
    marginBottom: 0,
  },
  summaryText: { fontSize: 8, fontFamily: B },

  // Footer
  footerSection: {
    borderTop: '0.5px solid #9ca3af',
    marginTop: 4,
    paddingTop: 3,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  footerText: { fontSize: 8, fontFamily: R },
  footerSmall: { fontSize: 7, fontFamily: R, color: '#374151', marginTop: 2 },
  qcReviewRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 28,
  },
  qcReviewText: { fontSize: 9, fontFamily: B, textAlign: 'center' },

  // Compliance tags
  pass: { color: '#166534', fontFamily: B },
  fail: { color: '#b91c1c', fontFamily: B },

  // Pass/Fail split layout
  concSplitRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  concLeftPane: {
    width: '50%',
  },
  concRightPane: {
    width: '50%',
    padding: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  passFailBox: {
    flex: 1,
    border: '1px solid #9ca3af',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
    minHeight: 60,
  },
  passFailLabel: {
    fontSize: 7,
    fontFamily: B,
    textTransform: 'uppercase',
    textAlign: 'center',
    color: '#6b7280',
    letterSpacing: 1,
    marginBottom: 6,
  },
  passFailBadge: {
    fontSize: 30,
    fontFamily: B,
    textAlign: 'center',
    marginBottom: 6,
  },
  passFailGreen: { color: '#166534' },
  passFailRed:   { color: '#b91c1c' },
  passFailGray:  { color: '#6b7280' },
  passFailDetail: {
    fontSize: 7.5,
    fontFamily: R,
    textAlign: 'center',
    marginBottom: 2,
  },
})

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({ label, bgColor }: { label: string; bgColor?: string }) {
  return (
    <View style={bgColor ? [s.sectionHeader, { backgroundColor: bgColor }] : s.sectionHeader}>
      <Text style={s.sectionHeaderText}>{label}</Text>
    </View>
  )
}

function InfoRow({
  l1, v1, l2, v2, last,
}: {
  l1: string; v1: string; l2?: string; v2?: string; last?: boolean
}) {
  return (
    <View style={last ? s.infoRowLast : s.infoRow}>
      <View style={[s.infoCell, s.colLabel1]}>
        <Text style={s.infoLabel}>{l1}</Text>
      </View>
      <View style={[s.infoCell, s.colValue1]}>
        <Text style={s.infoValue}>{v1}</Text>
      </View>
      <View style={[s.infoCell, s.colLabel2]}>
        <Text style={s.infoLabel}>{l2 ?? ''}</Text>
      </View>
      <View style={[s.infoCell, s.colValue2]}>
        <Text style={s.infoValue}>{v2 ?? ''}</Text>
      </View>
    </View>
  )
}

function ConcRow({
  test, astm, result, unit, last,
}: {
  test: string; astm: string; result: string; unit: string; last?: boolean
}) {
  return (
    <View style={last ? s.concRowLast : s.concRow}>
      <View style={[s.concCell, s.cTest]}>
        <Text style={s.concCellText}>{test}</Text>
      </View>
      <View style={[s.concCell, s.cAstm]}>
        <Text style={s.concCellText}>{astm}</Text>
      </View>
      <View style={[s.concCell, s.cResult]}>
        <Text style={s.concCellText}>{result}</Text>
      </View>
      <View style={[last ? s.concCellLast : s.concCell, s.cUnit]}>
        <Text style={s.concCellText}>{unit}</Text>
      </View>
    </View>
  )
}

function PassFailBox({
  compliance,
  requiredStrength,
  governingAge,
  governingPsi,
  breaks,
}: {
  compliance: string | null
  requiredStrength: number | null
  governingAge: BreakAge | null
  governingPsi: number | null
  breaks: Partial<Record<BreakAge, number>>
}) {
  // Manual compliance flag overrides everything when explicitly set.
  // Otherwise derive from 56/90-day breaks: any meets required → PASS, any below → FAIL,
  // none yet recorded → PENDING.
  let isPass = compliance === 'YES'
  let isFail = compliance === 'NO'
  if (!isPass && !isFail && requiredStrength != null) {
    const keyResults = [breaks['56day'], breaks['90day']].filter((v): v is number => v != null)
    if (keyResults.length > 0) {
      if (keyResults.some(v => v >= requiredStrength)) isPass = true
      else isFail = true
    }
  }
  const badgeStyle = isPass ? s.passFailGreen : isFail ? s.passFailRed : s.passFailGray
  const badgeText  = isPass ? 'PASS' : isFail ? 'FAIL' : 'PENDING'

  return (
    <View style={s.passFailBox}>
      <Text style={s.passFailLabel}>Compliance</Text>
      <Text style={[s.passFailBadge, badgeStyle]}>{badgeText}</Text>
      {requiredStrength != null && (
        <Text style={s.passFailDetail}>Required: {requiredStrength.toLocaleString()} psi</Text>
      )}
      {governingAge != null && governingPsi != null && (
        <Text style={s.passFailDetail}>
          {AGE_DAYS[governingAge]}-day result: {governingPsi.toLocaleString()} psi
        </Text>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Main document
// ---------------------------------------------------------------------------

const AGE_DAYS: Record<BreakAge, number> = {
  '1day': 1, '3day': 3, '4day': 4, '5day': 5, '7day': 7,
  '14day': 14, '21day': 21, '28day': 28, '56day': 56, '90day': 90, '120day': 120,
}

function ReportDocument({
  data,
  projectSettings,
}: {
  data: ReportData
  projectSettings?: ProjectSettings
}) {
  const breakDates = calculateAllBreakDates(data.date)

  const projectName    = projectSettings?.projectName    ?? ''
  const contractNumber = projectSettings?.contractNumber ?? ''
  const companyName    = projectSettings?.companyName    ?? ''
  const logoUrl        = projectSettings?.logoUrl        ?? null
  const primaryColor   = projectSettings?.brandColor     ?? '#1f2937'
  const sectionBgColor = projectSettings?.brandColor ? lightenHex(projectSettings.brandColor, 0.85) : '#e5e7eb'
  const headerBgColor  = projectSettings?.brandColor ? lightenHex(projectSettings.brandColor, 0.80) : '#e5e7eb'

  const specifiedStr = data.requiredCompStrength
    ? `${data.requiredCompStrength} psi @ 56 days`
    : ''

  // Build break rows — always show 7, 28, 56, 90; show others if they have data
  const REQUIRED: BreakAge[] = ['7day', '28day', '56day', '90day']
  const extras = BREAK_AGES.filter(
    a => !REQUIRED.includes(a) && data.breaks[a] != null,
  )
  const displayAges: BreakAge[] = [...extras, ...REQUIRED].sort(
    (a, b) => AGE_DAYS[a] - AGE_DAYS[b],
  )

  // Governing age = highest age with a break result
  let governingAge: BreakAge | null = null
  for (const age of [...BREAK_AGES].reverse()) {
    if (data.breaks[age] != null) { governingAge = age; break }
  }

  // Expand: 3 cylinder rows per age
  type BreakRow = {
    age: BreakAge
    cylIndex: number   // 1-based within this age
    isFirst: boolean
    psi: number | null
  }
  const breakRows: BreakRow[] = []
  for (const age of displayAges) {
    const psi = data.breaks[age] ?? null
    for (let i = 1; i <= 3; i++) {
      breakRows.push({ age, cylIndex: i, isFirst: i === 1, psi })
    }
  }

  const totalRows = breakRows.length
  let labIdCounter = 1

  return (
    <Document>
      <Page size="LETTER" style={s.page}>

        {/* ---------------------------------------------------------------- */}
        {/* Section 1 — Title                                                */}
        {/* ---------------------------------------------------------------- */}
        <View style={[s.titleBar, { backgroundColor: primaryColor }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 3 }}>
            {logoUrl && (
              <Image src={logoUrl} style={{ width: 64, height: 50, objectFit: 'contain', marginRight: 12 }} />
            )}
            <Text style={s.titleText}>Compression Report</Text>
          </View>
          <View style={s.titleSubRow}>
            <Text style={s.titleSubText}>Concrete Placement Date: {fmt(data.date)}</Text>
            <Text style={s.titleSubText}>
              Break Sample Age: {governingAge != null ? `${AGE_DAYS[governingAge]} days` : 'Pending'}
            </Text>
          </View>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Section 2 — Project / Sample info grid                           */}
        {/* ---------------------------------------------------------------- */}
        <View style={s.infoGrid}>
          <InfoRow
            l1="Project:"
            v1={projectName}
            l2="Bldg Permit No.:"
            v2="N/A"
          />
          <InfoRow
            l1="HMA Project No.:"
            v1={contractNumber}
            l2="Client:"
            v2={companyName}
          />
          <InfoRow
            l1="Contractor:"
            v1={companyName}
            l2="Supplier:"
            v2={data.supplier}
          />
          <InfoRow
            l1="Mix No.:"
            v1={data.mixId}
            l2="Specified Strength:"
            v2={specifiedStr}
          />
          <InfoRow
            l1="Pour Location:"
            v1={data.location}
            l2="Sample Location:"
            v2={data.pfuLocation ?? data.location}
          />
          <InfoRow
            l1="Sampled at (cu yd):"
            v1={fv(data.volumeCy)}
            l2="Load Size:"
            v2={fv(data.quantitySize)}
          />
          <InfoRow
            l1="Cast By:"
            v1={fv(data.sampledBy)}
            l2="Samples Cast:"
            v2={fv(data.quantitySize)}
          />
          <InfoRow
            l1=""
            v1=""
            l2="Date Sampled:"
            v2={fmt(data.date)}
            last
          />
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Section 3 — Material Tested                                      */}
        {/* ---------------------------------------------------------------- */}
        <SectionHeader label="Material Tested" bgColor={sectionBgColor} />
        <View style={s.materialRow}>
          <Text style={s.materialText}>
            {'Concrete [✓]   Grout [ ]   Mortar [ ]   ACIP grout [ ]'}
          </Text>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Section 4 — Concrete Information + Pass/Fail                     */}
        {/* ---------------------------------------------------------------- */}
        <SectionHeader label="Concrete Information" bgColor={sectionBgColor} />
        <View style={s.concSplitRow}>
          {/* Left: concrete info table */}
          <View style={s.concLeftPane}>
            <View style={s.concTable}>
              <View style={[s.concHeaderRow, { backgroundColor: headerBgColor }]}>
                <View style={[s.concCell, s.cTest]}>
                  <Text style={s.concHeaderText}>TEST</Text>
                </View>
                <View style={[s.concCell, s.cAstm]}>
                  <Text style={s.concHeaderText}>ASTM</Text>
                </View>
                <View style={[s.concCell, s.cResult]}>
                  <Text style={s.concHeaderText}>RESULT</Text>
                </View>
                <View style={[s.concCellLast, s.cUnit]}>
                  <Text style={s.concHeaderText}></Text>
                </View>
              </View>
              <ConcRow test="Slump"         astm="C143"  result={fv(data.slump)}             unit="in."  />
              <ConcRow test="Flow"          astm="C1611" result={fv(data.astmC1611Flow)}       unit="in."  />
              <ConcRow test="Concrete Temp" astm="C1064" result={fv(data.temperature)}        unit="°F"   />
              <ConcRow test="Unit Weight"   astm="C138"  result={fv(data.unitWeight)}         unit="pcf"  />
              <ConcRow test="Air Content"   astm="C231"  result={data.airContent != null ? Number(data.airContent).toFixed(1) : ''} unit="%" />
              <ConcRow test="J-Ring"        astm="C1621" result="N/A"                         unit="in."  />
              <ConcRow test="VSI"           astm="C1611" result={fv(data.vsi)}                unit=""     />
              <ConcRow test="w/c"           astm=""      result={fv(data.wcRatio)}             unit=""     />
              <ConcRow test="Ambient Temp"  astm=""      result={fv(data.ambientTemp)}         unit="°F"   />
              <ConcRow test="Ticket No."    astm=""      result={fv(data.batchTicketNumber)}   unit="" last />
            </View>
            <View style={s.waterRow}>
              <Text style={s.waterText}>
                {'Water Added On Site:  None    gallons / yard³    Authorized By: ___________'}
              </Text>
            </View>
          </View>

          {/* Right: Pass/Fail box */}
          <View style={s.concRightPane}>
            <PassFailBox
              compliance={data.compliance}
              requiredStrength={data.requiredCompStrength}
              governingAge={governingAge}
              governingPsi={governingAge != null ? (data.breaks[governingAge] ?? null) : null}
              breaks={data.breaks}
            />
          </View>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Section 5 — Compressive Strength Test Data                       */}
        {/* ---------------------------------------------------------------- */}
        <SectionHeader label="Compressive Strength Test Data (ASTM C39, C1231, C780, C1019)" bgColor={sectionBgColor} />
        <View style={s.breakTable}>
          {/* Column headers */}
          <View style={[s.breakHeaderRow, { backgroundColor: headerBgColor }]}>
            <View style={[s.breakCell, s.bLab]}>
              <Text style={s.breakHeaderText}>LAB{'\n'}No.</Text>
            </View>
            <View style={[s.breakCell, s.bSample]}>
              <Text style={s.breakHeaderText}>SAMPLE{'\n'}ID</Text>
            </View>
            <View style={[s.breakCell, s.bAge]}>
              <Text style={s.breakHeaderText}>TEST AGE{'\n'}(days)</Text>
            </View>
            <View style={[s.breakCell, s.bDate]}>
              <Text style={s.breakHeaderText}>DATE OF{'\n'}TEST</Text>
            </View>
            <View style={[s.breakCell, s.bDiam]}>
              <Text style={s.breakHeaderText}>AVG{'\n'}DIAM (in)</Text>
            </View>
            <View style={[s.breakCell, s.bLoad]}>
              <Text style={s.breakHeaderText}>MAX LOAD{'\n'}(lbs)</Text>
            </View>
            <View style={[s.breakCell, s.bArea]}>
              <Text style={s.breakHeaderText}>AVG CROSS{'\n'}SECTION (in²)</Text>
            </View>
            <View style={[s.breakCell, s.bPsi]}>
              <Text style={s.breakHeaderText}>COMP{'\n'}STRENGTH{'\n'}(psi)</Text>
            </View>
            <View style={[s.breakCellLast, s.bFrac]}>
              <Text style={s.breakHeaderText}>TYPE OF{'\n'}FRACTURE</Text>
            </View>
          </View>

          {/* Data rows */}
          {breakRows.map((row, idx) => {
            const isLast = idx === totalRows - 1
            const hasPsi = row.psi != null
            const labNo = hasPsi && row.isFirst ? String(labIdCounter++) : ''
            const dateStr = hasPsi ? fmt(breakDates[row.age]) : ''
            const psiStr  = hasPsi ? String(row.psi) : ''
            const loadStr = hasPsi ? calcMaxLoad(row.psi!) : ''
            const areaStr = hasPsi ? '12.57' : ''
            const diamStr = hasPsi ? '4' : ''

            return (
              <View key={`${row.age}-${row.cylIndex}`} style={isLast ? s.breakRowLast : s.breakRow}>
                <View style={[s.breakCell, s.bLab]}>
                  <Text style={s.breakCellText}>{labNo}</Text>
                </View>
                <View style={[s.breakCell, s.bSample]}>
                  <Text style={s.breakCellText}>{String(row.cylIndex)}</Text>
                </View>
                <View style={[s.breakCell, s.bAge]}>
                  <Text style={s.breakCellText}>{String(AGE_DAYS[row.age])}</Text>
                </View>
                <View style={[s.breakCell, s.bDate]}>
                  <Text style={s.breakCellText}>{dateStr}</Text>
                </View>
                <View style={[s.breakCell, s.bDiam]}>
                  <Text style={s.breakCellText}>{diamStr}</Text>
                </View>
                <View style={[s.breakCell, s.bLoad]}>
                  <Text style={s.breakCellText}>{loadStr}</Text>
                </View>
                <View style={[s.breakCell, s.bArea]}>
                  <Text style={s.breakCellText}>{areaStr}</Text>
                </View>
                <View style={[s.breakCell, s.bPsi]}>
                  {hasPsi ? (() => {
                    const isKeyAge = row.age === '56day' || row.age === '90day'
                    const req = data.requiredCompStrength
                    const colorStyle = isKeyAge && req != null
                      ? (row.psi! >= req ? s.pass : s.fail)
                      : null
                    return (
                      <Text style={colorStyle ? [s.breakCellText, colorStyle] : s.breakCellText}>
                        {psiStr}
                      </Text>
                    )
                  })() : (
                    <Text style={s.breakCellText}></Text>
                  )}
                </View>
                <View style={[s.breakCellLast, s.bFrac]}>
                  <Text style={s.breakCellText}></Text>
                </View>
              </View>
            )
          })}
        </View>

        {/* Summary row */}
        {governingAge != null && data.breaks[governingAge] != null && (
          <View style={s.summaryRow}>
            <Text style={s.summaryText}>
              {`Average psi at ${AGE_DAYS[governingAge]} days = ${data.breaks[governingAge]} psi`}
            </Text>
          </View>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Section 6 — Footer                                               */}
        {/* ---------------------------------------------------------------- */}
        <View style={s.footerSection}>
          <View style={s.footerRow}>
            <Text style={s.footerText}>Tested by: {fv(data.testedBy)}</Text>
            <Text style={s.footerText}>Date Issued: ___________</Text>
          </View>
          <View style={s.qcReviewRow}>
            <Text style={s.qcReviewText}>
              Concrete QC Manager (Reviewed): ______________________     Date: ___________
            </Text>
          </View>
        </View>

      </Page>
    </Document>
  )
}

// ---------------------------------------------------------------------------
// Public export — signature kept exactly as-is
// ---------------------------------------------------------------------------

export async function renderReportPdf(
  data: ReportData,
  projectSettings?: ProjectSettings,
): Promise<Buffer> {
  return renderToBuffer(<ReportDocument data={data} projectSettings={projectSettings} />)
}
