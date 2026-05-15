import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Recurrence, RecurrenceFreq, WEEKDAY_SHORT } from '../types'
import { formatRecurrence, isoDate } from '../utils'
import { useTheme, ThemeColors } from '../theme'

function defaultEndDate(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 90)
  return d
}

interface Props {
  initial?: Recurrence
  onDone: (recurrence: Recurrence | undefined) => void
  onBack: () => void
}

const POSITIONS: { value: number; label: string }[] = [
  { value: 1,  label: '1st'  },
  { value: 2,  label: '2nd'  },
  { value: 3,  label: '3rd'  },
  { value: 4,  label: '4th'  },
  { value: -1, label: 'Last' },
]

/**
 * Custom recurrence form — picks freq (Weekly/Monthly), days of week, and (for
 * Monthly) which weeks of the month. Lives inside a bottom sheet — no modal
 * stacking.
 */
export default function CustomRecurrenceForm({ initial, onDone, onBack }: Props) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  const [freq, setFreq] = useState<RecurrenceFreq>(initial?.freq === 'monthly' ? 'monthly' : 'weekly')
  const [weekdays, setWeekdays] = useState<Set<number>>(() => new Set(initial?.byWeekday ?? []))
  const [positions, setPositions] = useState<Set<number>>(() => new Set(initial?.bySetPos ?? []))
  const [endDate, setEndDate] = useState<Date>(() =>
    initial?.endDate ? new Date(`${initial.endDate}T00:00:00`) : defaultEndDate(),
  )

  useEffect(() => {
    setFreq(initial?.freq === 'monthly' ? 'monthly' : 'weekly')
    setWeekdays(new Set(initial?.byWeekday ?? []))
    setPositions(new Set(initial?.bySetPos ?? []))
    setEndDate(initial?.endDate ? new Date(`${initial.endDate}T00:00:00`) : defaultEndDate())
  }, [initial])

  function toggleWeekday(n: number) {
    setWeekdays((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }

  function togglePosition(p: number) {
    setPositions((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  const previewRec: Recurrence | undefined =
    weekdays.size > 0
      ? {
          freq,
          byWeekday: Array.from(weekdays).sort(),
          ...(freq === 'monthly' && positions.size > 0
            ? { bySetPos: Array.from(positions).sort((a, b) => a - b) }
            : {}),
          endDate: isoDate(endDate),
        }
      : undefined

  const canSave = weekdays.size > 0 && (freq === 'weekly' || positions.size > 0)

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.headerSideBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Custom Repeat</Text>
        <TouchableOpacity
          onPress={() => onDone(previewRec)}
          hitSlop={10}
          style={styles.headerSideBtn}
          disabled={!canSave}
        >
          <Text style={[styles.doneText, !canSave && styles.doneTextDisabled]}>Done</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Text style={styles.sectionLabel}>REPEATS</Text>
        <View style={styles.segmented}>
          {(['weekly', 'monthly'] as RecurrenceFreq[]).map((f) => {
            const active = freq === f
            return (
              <TouchableOpacity
                key={f}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => setFreq(f)}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {f === 'weekly' ? 'Weekly' : 'Monthly'}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <Text style={styles.sectionLabel}>ON DAYS</Text>
        <View style={styles.pillRow}>
          {WEEKDAY_SHORT.map((day, idx) => {
            const active = weekdays.has(idx)
            return (
              <TouchableOpacity
                key={day}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => toggleWeekday(idx)}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{day}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {freq === 'monthly' && (
          <>
            <Text style={styles.sectionLabel}>ON WEEKS</Text>
            <View style={styles.pillRow}>
              {POSITIONS.map((p) => {
                const active = positions.has(p.value)
                return (
                  <TouchableOpacity
                    key={p.value}
                    style={[styles.pill, active && styles.pillActive]}
                    onPress={() => togglePosition(p.value)}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>{p.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </>
        )}

        <Text style={styles.sectionLabel}>ENDS ON</Text>
        <View style={styles.dateBox}>
          <DateTimePicker
            value={endDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'compact' : 'default'}
            themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
            minimumDate={new Date()}
            onChange={(e, d) => {
              if (e.type === 'set' && d) setEndDate(d)
            }}
          />
        </View>

        {previewRec && canSave && (
          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>Preview</Text>
            <Text style={styles.previewText}>{formatRecurrence(previewRec)}</Text>
            <Text style={styles.previewSub}>Ends {isoDate(endDate)}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
      paddingBottom: 8,
    },
    headerSideBtn: { minWidth: 64 },
    backText: {
      fontSize: 15,
      color: c.blue,
      fontWeight: '500',
    },
    doneText: {
      fontSize: 15,
      color: c.blue,
      fontWeight: '700',
      textAlign: 'right',
    },
    doneTextDisabled: {
      color: c.gray3,
    },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: c.label,
    },
    body: { flex: 1 },
    bodyContent: { paddingBottom: 24 },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: c.label3,
      marginTop: 16,
      marginBottom: 8,
    },
    segmented: {
      flexDirection: 'row',
      gap: 2,
      backgroundColor: c.bg,
      borderRadius: 9,
      padding: 2,
    },
    segment: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: 7,
    },
    segmentActive: {
      backgroundColor: c.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
      elevation: 1,
    },
    segmentText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.label2,
    },
    segmentTextActive: {
      color: c.label,
      fontWeight: '700',
    },
    pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    pill: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 100,
      backgroundColor: c.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      minWidth: 50,
      alignItems: 'center',
    },
    pillActive: {
      backgroundColor: c.blue,
      borderColor: c.blue,
    },
    pillText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.label,
    },
    pillTextActive: {
      color: '#fff',
    },
    previewBox: {
      marginTop: 16,
      backgroundColor: c.card,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    previewLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: c.label3,
      marginBottom: 4,
    },
    previewText: {
      fontSize: 15,
      color: c.label,
      fontWeight: '600',
    },
    previewSub: {
      fontSize: 13,
      color: c.label3,
      marginTop: 4,
    },
    dateBox: {
      backgroundColor: c.card,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 6,
      flexDirection: 'row',
      alignItems: 'center',
    },
  })
}
