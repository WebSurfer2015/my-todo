import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { Recurrence, RecurrenceFreq, WEEKDAY_SHORT } from '../types'
import { formatRecurrence } from '../utils'
import { useTheme, ThemeColors } from '../theme'

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

  const [freq, setFreq] = useState<RecurrenceFreq>(initial?.freq ?? 'weekly')
  const [interval, setInterval] = useState<number>(
    Math.max(1, Math.min(99, Math.floor(initial?.interval ?? 1))),
  )
  const [weekdays, setWeekdays] = useState<Set<number>>(() => new Set(initial?.byWeekday ?? []))
  const [positions, setPositions] = useState<Set<number>>(() => new Set(initial?.bySetPos ?? []))

  useEffect(() => {
    setFreq(initial?.freq ?? 'weekly')
    setInterval(Math.max(1, Math.min(99, Math.floor(initial?.interval ?? 1))))
    setWeekdays(new Set(initial?.byWeekday ?? []))
    setPositions(new Set(initial?.bySetPos ?? []))
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

  // For daily and yearly, a weekday filter is meaningless — the
  // recurrence is purely "every N days" / "every N years". Weekly
  // and monthly use the weekday picker (still required for those).
  const needsWeekdays = freq === 'weekly' || freq === 'monthly'
  const previewRec: Recurrence | undefined =
    !needsWeekdays || weekdays.size > 0
      ? {
          freq,
          ...(interval > 1 ? { interval } : {}),
          ...(needsWeekdays && weekdays.size > 0
            ? { byWeekday: Array.from(weekdays).sort() }
            : {}),
          ...(freq === 'monthly' && positions.size > 0
            ? { bySetPos: Array.from(positions).sort((a, b) => a - b) }
            : {}),
          // endDate intentionally omitted — Custom Repeat treats the
          // recurrence as open-ended. Users who want an explicit end
          // pick it from the "Repeat ends" row in the parent sheet
          // after committing the custom pattern.
        }
      : undefined

  const canSave =
    (!needsWeekdays || weekdays.size > 0) &&
    (freq !== 'monthly' || weekdays.size === 0 || positions.size > 0)

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
        <Text style={styles.sectionLabel}>EVERY</Text>
        <View style={styles.everyRow}>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={[styles.stepBtn, interval <= 1 && styles.stepBtnDisabled]}
              onPress={() => setInterval((n) => Math.max(1, n - 1))}
              disabled={interval <= 1}
              accessibilityRole="button"
              accessibilityLabel="Decrease interval"
            >
              <Text style={styles.stepBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepValue} maxFontSizeMultiplier={1.2}>{interval}</Text>
            <TouchableOpacity
              style={[styles.stepBtn, interval >= 99 && styles.stepBtnDisabled]}
              onPress={() => setInterval((n) => Math.min(99, n + 1))}
              disabled={interval >= 99}
              accessibilityRole="button"
              accessibilityLabel="Increase interval"
            >
              <Text style={styles.stepBtnText}>+</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.freqSegmented}>
            {(['daily', 'weekly', 'monthly', 'yearly'] as RecurrenceFreq[]).map((f) => {
              const active = freq === f
              // Label flips singular/plural based on the current
              // interval — "1 Day", "2 Days" reads naturally.
              const labels: Record<RecurrenceFreq, [string, string]> = {
                daily: ['Day', 'Days'],
                weekly: ['Week', 'Weeks'],
                monthly: ['Month', 'Months'],
                yearly: ['Year', 'Years'],
              }
              const [single, plural] = labels[f]
              return (
                <TouchableOpacity
                  key={f}
                  style={[styles.freqSegment, active && styles.segmentActive]}
                  onPress={() => setFreq(f)}
                >
                  <Text style={[styles.freqSegmentText, active && styles.segmentTextActive]}>
                    {interval === 1 ? single : plural}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {needsWeekdays && (
          <>
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
          </>
        )}

        {freq === 'monthly' && weekdays.size > 0 && (
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

        {previewRec && canSave && (
          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>Preview</Text>
            <Text style={styles.previewText}>{formatRecurrence(previewRec)}</Text>
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
    // "Every N [unit]" row: stepper on the left, 4-way segmented
    // unit picker on the right.
    everyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bg,
      borderRadius: 10,
      padding: 4,
      gap: 4,
    },
    stepBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBtnDisabled: { opacity: 0.35 },
    stepBtnText: {
      fontSize: 18,
      fontWeight: '600',
      color: c.label,
      lineHeight: 20,
    },
    stepValue: {
      minWidth: 32,
      textAlign: 'center',
      fontSize: 16,
      fontWeight: '700',
      color: c.label,
      fontVariant: ['tabular-nums'],
    },
    freqSegmented: {
      flex: 1,
      flexDirection: 'row',
      gap: 2,
      backgroundColor: c.bg,
      borderRadius: 9,
      padding: 2,
    },
    freqSegment: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: 7,
    },
    freqSegmentText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.label2,
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
  })
}
