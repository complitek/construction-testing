import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { renderToBuffer } from '@react-pdf/renderer'
import type { PourEvent, SampleSet, BreakAge } from '@/lib/types'
import { BREAK_AGES } from '@/lib/types'
import { calculateAllBreakDates } from '@/lib/utils/break-dates'

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: 'Helvetica' },
  title: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 },
  fieldRow: { flexDirection: 'row', marginBottom: 6 },
  fieldLabel: { width: '40%', fontWeight: 'bold' },
  fieldValue: { width: '60%' },
  divider: { borderBottom: '1px solid #000', marginVertical: 16 },
  tableHeader: {
    flexDirection: 'row', backgroundColor: '#e0e0e0',
    paddingTop: 6, paddingBottom: 6, paddingLeft: 4, paddingRight: 4,
    fontWeight: 'bold', borderTop: '1px solid #000', borderBottom: '1px solid #000',
  },
  tableRow: { flexDirection: 'row', paddingTop: 5, paddingBottom: 5, paddingLeft: 4, paddingRight: 4, borderBottom: '0.5px solid #ccc' },
  col1: { width: '33%' },
  col2: { width: '33%' },
  col3: { width: '34%' },
  footer: { position: 'absolute', bottom: 30, left: 48, right: 48, fontSize: 8, color: '#666' },
})

const AGE_LABELS: Record<BreakAge, string> = {
  '1day': '1-Day', '3day': '3-Day', '4day': '4-Day', '5day': '5-Day',
  '7day': '7-Day', '14day': '14-Day', '28day': '28-Day',
  '56day': '56-Day', '90day': '90-Day', '120day': '120-Day',
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y}`
}

interface ReportProps {
  pourEvent: PourEvent
  sampleSet: SampleSet
}

function ReportDocument({ pourEvent, sampleSet }: ReportProps) {
  const breakDates = calculateAllBreakDates(pourEvent.date)

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>CONCRETE COMPRESSION TEST REPORT</Text>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Date of Placement:</Text>
          <Text style={styles.fieldValue}>{formatDate(pourEvent.date)} ({pourEvent.shift} shift)</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Specification:</Text>
          <Text style={styles.fieldValue}>{pourEvent.spec}</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Location:</Text>
          <Text style={styles.fieldValue}>{pourEvent.location}</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Description:</Text>
          <Text style={styles.fieldValue}>{pourEvent.description}</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Supplier:</Text>
          <Text style={styles.fieldValue}>{pourEvent.supplier}</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Mix Design ID:</Text>
          <Text style={styles.fieldValue}>{pourEvent.mixId}</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Batch Ticket No.:</Text>
          <Text style={styles.fieldValue}>{sampleSet.batchTicketNumber}</Text>
        </View>

        {(sampleSet.temperature != null || sampleSet.slump != null || sampleSet.unitWeight != null || sampleSet.airContent != null) && (
          <>
            <View style={styles.divider} />
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Field Test Results:</Text>
              <Text style={styles.fieldValue}> </Text>
            </View>
            {sampleSet.temperature != null && (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Temperature:</Text>
                <Text style={styles.fieldValue}>{sampleSet.temperature}°F</Text>
              </View>
            )}
            {sampleSet.slump != null && (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Slump / Spread:</Text>
                <Text style={styles.fieldValue}>{sampleSet.slump} in</Text>
              </View>
            )}
            {sampleSet.unitWeight != null && (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Unit Weight:</Text>
                <Text style={styles.fieldValue}>{sampleSet.unitWeight} pcf</Text>
              </View>
            )}
            {sampleSet.airContent != null && (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Air Content:</Text>
                <Text style={styles.fieldValue}>{sampleSet.airContent}%</Text>
              </View>
            )}
          </>
        )}

        <View style={styles.divider} />

        <View style={styles.tableHeader}>
          <Text style={styles.col1}>Cylinder Age</Text>
          <Text style={styles.col2}>Break Date</Text>
          <Text style={styles.col3}>Compressive Strength (PSI)</Text>
        </View>

        {BREAK_AGES.map(age => (
          <View key={age} style={styles.tableRow}>
            <Text style={styles.col1}>{AGE_LABELS[age]}</Text>
            <Text style={styles.col2}>{formatDate(breakDates[age])}</Text>
            <Text style={styles.col3}>
              {sampleSet.breaks[age] != null ? sampleSet.breaks[age].toString() : '—'}
            </Text>
          </View>
        ))}

        <Text style={styles.footer}>
          Generated by Concrete Compression Report Tool | {new Date().toLocaleDateString()}
        </Text>
      </Page>
    </Document>
  )
}

export async function renderReportPdf(
  pourEvent: PourEvent,
  sampleSet: SampleSet
): Promise<Buffer> {
  return renderToBuffer(<ReportDocument pourEvent={pourEvent} sampleSet={sampleSet} />)
}
