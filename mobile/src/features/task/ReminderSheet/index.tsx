/**
 * Multi-reminder picker — replaces the prior ReminderSubView.
 *
 * Two chip sections + a live pill list at the top:
 *
 *   YOUR REMINDERS (N)
 *   ┌──────────────┐ ┌──────────────┐
 *   │ 1d before ✕ │ │ 1h before ✕  │   ← per-pill ✕ removes one
 *   └──────────────┘ └──────────────┘
 *
 *   BEFORE DUE DATE   (multi-select; only renders when dueDate set)
 *   Tap to add, tap again to remove
 *   [5m] [15m] [30m] [1h] [2h] [4h] [1d] [2d] [3d] [1w]
 *
 *   REPEATING REMINDER (single-select)
 *   Pick one — fires until you complete
 *   [15m] [30m] [1h] [2h] [4h] [6h] [12h]
 *
 *   ─────────────────────────────────
 *   [        Done        ]
 *
 * Owns its own styles (no shared-styles prop from a parent). Mounted
 * as a sub-view inside ComposeSheet / TaskDetailsSheet's Modal.
 */
import React, { useMemo, useState } from 'react'
import { Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import { useLang } from '../../../app/LangContext'
import { useTheme } from '../../../app/theme'
import type { Reminder } from '../../../core-bindings/types'
import { genUuid } from '../../../../../core/src/logic/utils'
import { makeStyles } from './styles'

const REMIND_BEFORE_DUE_CHOICES: Array<{ minutes: number; label: string }> = [
  { minutes: 5,     label: '5m' },
  { minutes: 15,    label: '15m' },
  { minutes: 30,    label: '30m' },
  { minutes: 60,    label: '1h' },
  { minutes: 120,   label: '2h' },
  { minutes: 240,   label: '4h' },
  { minutes: 1440,  label: '1d' },
  { minutes: 2880,  label: '2d' },
  { minutes: 4320,  label: '3d' },
  { minutes: 10080, label: '1w' },
]

const REMIND_EVERY_CHOICES: Array<{ minutes: number; label: string }> = [
  { minutes: 15,  label: '15m' },
  { minutes: 30,  label: '30m' },
  { minutes: 60,  label: '1h' },
  { minutes: 120, label: '2h' },
  { minutes: 240, label: '4h' },
  { minutes: 360, label: '6h' },
  { minutes: 720, label: '12h' },
]

/** Soft cap on stored reminders per todo. Beyond this, taps on chips
 * in the "before due" row become no-ops (UX nudge) — repeating still
 * single-replaces. Keeps iOS's ~64 pending-notification global budget
 * defensible when a user has many recurring todos each with reminders. */
const MAX_REMINDERS_PER_TODO = 10

/** Format an ISO `yyyy-mm-ddTHH:MM` for N minutes before the dueDate.
 * Uses the dueDate's time-of-day when present; defaults to 9:00. */
function isoMinutesBeforeDue(dueDate: string, minutes: number): string {
  if (!dueDate) return ''
  const tIdx = dueDate.indexOf('T')
  const datePart = tIdx === -1 ? dueDate : dueDate.slice(0, tIdx)
  const timePart = tIdx === -1 ? '09:00' : dueDate.slice(tIdx + 1, tIdx + 6)
  const [y, m, d] = datePart.split('-').map(Number)
  const [hh, mm] = timePart.split(':').map(Number)
  if (!y || !m || !d) return ''
  const base = new Date(y, m - 1, d, hh ?? 9, mm ?? 0)
  base.setMinutes(base.getMinutes() - minutes)
  const yy = base.getFullYear()
  const mo = String(base.getMonth() + 1).padStart(2, '0')
  const da = String(base.getDate()).padStart(2, '0')
  const hh2 = String(base.getHours()).padStart(2, '0')
  const mm2 = String(base.getMinutes()).padStart(2, '0')
  return `${yy}-${mo}-${da}T${hh2}:${mm2}`
}

/** ISO of now + N minutes. */
function isoMinutesFromNow(minutes: number): string {
  const d = new Date(Date.now() + minutes * 60_000)
  return isoLocalDateTime(d)
}

/** Format a Date as local `yyyy-mm-ddTHH:mm` (no timezone) — the shape
 * reminders store in `at`. */
function isoLocalDateTime(d: Date): string {
  const yy = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${yy}-${mo}-${da}T${hh}:${mm}`
}

/** Short human label for a fixed absolute reminder, e.g. "Jun 7, 9:00 AM". */
function fixedPillLabel(at: string): string {
  const d = new Date(at)
  if (Number.isNaN(d.valueOf())) return at
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Render text for a "before due" pill. */
function beforeDuePillLabel(
  minutes: number,
  t: ReturnType<typeof useLang>['t'],
): string {
  if (minutes < 60) return t.remindPillMinBefore(minutes)
  if (minutes < 1440) return t.remindPillHourBefore(Math.round(minutes / 60))
  if (minutes < 10080) return t.remindPillDayBefore(Math.round(minutes / 1440))
  return t.remindPillWeekBefore(Math.round(minutes / 10080))
}

/** Render text for a "repeating" pill. */
function repeatingPillLabel(
  minutes: number,
  t: ReturnType<typeof useLang>['t'],
): string {
  if (minutes < 60) return t.remindPillEveryMin(minutes)
  return t.remindPillEveryHour(Math.round(minutes / 60))
}

export interface ReminderSheetProps {
  /** Existing reminders on the todo (after getReminders normalization
   * by the caller). Empty array when none. */
  initial: Reminder[]
  /** Anchor for the "before due" row. When empty, the row is replaced
   * with a notice and the chips are inactive. */
  dueDate: string
  onCancel: () => void
  onSave: (next: Reminder[]) => void
}

export default function ReminderSheet({
  initial,
  dueDate,
  onCancel,
  onSave,
}: ReminderSheetProps) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  // Pending working list — committed on Done. Each entry already has
  // an id; the user can remove via pill ✕ or via tapping an active
  // chip a second time.
  const [pending, setPending] = useState<Reminder[]>(() =>
    initial.map((r) => ({ ...r })),
  )

  // Selection lookups
  function isBeforeDueSelected(minutes: number): boolean {
    if (!dueDate) return false
    const target = isoMinutesBeforeDue(dueDate, minutes)
    return pending.some((r) => !r.intervalMinutes && r.at === target)
  }
  function repeatingMinutes(): number | null {
    const r = pending.find((x) => !!x.intervalMinutes)
    return r ? r.intervalMinutes! : null
  }

  function toggleBeforeDue(minutes: number) {
    if (!dueDate) return
    const target = isoMinutesBeforeDue(dueDate, minutes)
    if (!target) return
    setPending((prev) => {
      const existing = prev.find(
        (r) => !r.intervalMinutes && r.at === target,
      )
      if (existing) return prev.filter((r) => r.id !== existing.id)
      // Cap defense — refuse silently when at limit. Repeating
      // slot stays replaceable (single-select).
      const beforeDueCount = prev.filter((r) => !r.intervalMinutes).length
      const total = prev.length
      if (beforeDueCount >= MAX_REMINDERS_PER_TODO || total >= MAX_REMINDERS_PER_TODO) {
        return prev
      }
      return [...prev, { id: genUuid(), at: target }]
    })
  }

  function setRepeating(minutes: number | null) {
    setPending((prev) => {
      const withoutRepeating = prev.filter((r) => !r.intervalMinutes)
      if (minutes === null) return withoutRepeating
      const at = isoMinutesFromNow(minutes)
      return [...withoutRepeating, { id: genUuid(), at, intervalMinutes: minutes }]
    })
  }

  // Fixed (absolute date/time) reminder. Default an hour out so the
  // picker opens on a sensible near-future moment.
  const [fixedDate, setFixedDate] = useState<Date>(
    () => new Date(Date.now() + 60 * 60 * 1000),
  )
  function onFixedChange(_e: DateTimePickerEvent, selected?: Date) {
    if (selected) setFixedDate(selected)
  }
  function addFixed() {
    const at = isoLocalDateTime(fixedDate)
    setPending((prev) => {
      if (prev.length >= MAX_REMINDERS_PER_TODO) return prev
      // Dedupe against an identical one-shot already pending.
      if (prev.some((r) => !r.intervalMinutes && r.at === at)) return prev
      return [...prev, { id: genUuid(), at }]
    })
  }

  function removeOne(id: string) {
    setPending((prev) => prev.filter((r) => r.id !== id))
  }

  function clearAll() {
    setPending([])
  }

  function handleDone() {
    onSave(pending)
  }

  /** Build the pill list for "Your reminders" — sorts by at ascending,
   * formats each in plain English. */
  const yourPills = useMemo(() => {
    // Sort: before-due by `at` (earlier first); repeating after.
    const beforeDue = pending
      .filter((r) => !r.intervalMinutes)
      .slice()
      .sort((a, b) => a.at.localeCompare(b.at))
    const repeating = pending.filter((r) => !!r.intervalMinutes)
    const out: Array<{ id: string; label: string }> = []
    for (const r of beforeDue) {
      // Recover minutes-before-due from at — match against the chip
      // grid; if no exact match, fall back to a generic label.
      const m = REMIND_BEFORE_DUE_CHOICES.find(
        (c) => dueDate && isoMinutesBeforeDue(dueDate, c.minutes) === r.at,
      )
      out.push({
        id: r.id,
        // A before-due chip match → "15 min before"; otherwise it's a
        // fixed absolute reminder → show its actual date/time.
        label: m ? beforeDuePillLabel(m.minutes, t) : fixedPillLabel(r.at),
      })
    }
    for (const r of repeating) {
      out.push({
        id: r.id,
        label: repeatingPillLabel(r.intervalMinutes!, t),
      })
    }
    return out
  }, [pending, dueDate, t])

  const canClearAll = pending.length > 0

  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onCancel}
          hitSlop={10}
          style={styles.headerSide}
          accessibilityRole="button"
          accessibilityLabel={t.back}
        >
          <Text style={styles.backText}>{`‹ ${t.back}`}</Text>
        </TouchableOpacity>
        <Text style={styles.titleText}>{t.remindMe}</Text>
        <TouchableOpacity
          onPress={clearAll}
          disabled={!canClearAll}
          hitSlop={10}
          style={styles.headerSideRight}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canClearAll }}
          accessibilityLabel={t.remindClearAll}
        >
          <Text
            style={[
              styles.clearAllText,
              !canClearAll && styles.clearAllTextDisabled,
            ]}
          >
            {t.remindClearAll}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {/* Your reminders — live preview of what's about to commit. */}
        <View>
          <Text style={styles.listHeader}>
            {pending.length > 0
              ? t.remindYourRemindersWithCount(pending.length)
              : t.remindYourReminders}
          </Text>
          {pending.length === 0 ? (
            <View style={styles.listEmpty}>
              <Text style={styles.listEmptyText}>{t.remindEmpty}</Text>
            </View>
          ) : (
            <View style={styles.pillsWrap}>
              {yourPills.map((p) => (
                <View key={p.id} style={styles.pill}>
                  <Text style={styles.pillText}>{p.label}</Text>
                  <TouchableOpacity
                    onPress={() => removeOne(p.id)}
                    hitSlop={8}
                    style={styles.pillRemoveBtn}
                    accessibilityRole="button"
                    accessibilityLabel={t.remindPillRemove(p.label)}
                  >
                    <Text style={styles.pillRemoveX}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Before due section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>{t.remindBeforeDueSection}</Text>
          {dueDate ? (
            <>
              <Text style={styles.sectionSubhelper}>
                {t.remindBeforeDueHint}
              </Text>
              <View style={styles.chipsWrap}>
                {REMIND_BEFORE_DUE_CHOICES.map((c) => {
                  const active = isBeforeDueSelected(c.minutes)
                  return (
                    <TouchableOpacity
                      key={`bd-${c.label}`}
                      onPress={() => toggleBeforeDue(c.minutes)}
                      style={[styles.chip, active && styles.chipActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={beforeDuePillLabel(c.minutes, t)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </>
          ) : (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>{t.remindBeforeDueNoDueDate}</Text>
            </View>
          )}
        </View>

        {/* Repeating section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>{t.remindRepeatingSection}</Text>
          <Text style={styles.sectionSubhelper}>{t.remindRepeatingHint}</Text>
          <View style={styles.chipsWrap}>
            {REMIND_EVERY_CHOICES.map((c) => {
              const active = repeatingMinutes() === c.minutes
              return (
                <TouchableOpacity
                  key={`rep-${c.label}`}
                  onPress={() => setRepeating(active ? null : c.minutes)}
                  style={[styles.chip, active && styles.chipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={repeatingPillLabel(c.minutes, t)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      active && styles.chipTextActive,
                    ]}
                  >
                    {c.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Fixed (specific date & time) section — an absolute one-shot
            reminder, independent of the due date. Works for todos with no
            due date too. On recurring todos the saved `at` is rebased per
            occurrence (core expandSeries), preserving the chosen offset. */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>SPECIFIC TIME</Text>
          <View style={styles.fixedRow}>
            <DateTimePicker
              value={fixedDate}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'compact' : 'default'}
              themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
              onChange={onFixedChange}
            />
            <TouchableOpacity
              style={styles.fixedAddBtn}
              onPress={addFixed}
              accessibilityRole="button"
              accessibilityLabel="Add a reminder at this date and time"
            >
              <Text style={styles.fixedAddBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.doneBtn}
          onPress={handleDone}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t.done}
        >
          <Text style={styles.doneBtnText}>{t.done}</Text>
        </TouchableOpacity>
      </View>
    </>
  )
}
