/**
 * Reminder picker (Phase 2 design, 2026-10-18).
 *
 *   Remind me          Clear all   (Clear all only while something is set)
 *   YOUR REMINDERS (N)          live pills; per-pill ✕ removes one — the
 *                               block is omitted entirely when empty
 *   WHEN                        a few plain choices for THIS to-do, each with
 *     Day before      Thu 6 PM  its time (core reminderPresetsFor): tap to add,
 *     Morning of      9:00 AM   tap again to remove
 *     1 hour before   2:00 PM
 *     Other time…               reveals the date + time picker
 *   Gentle nudge        [ ]     one follow-up the next morning (profile-wide)
 *   [        Done        ]     the ONE way out (saves the picks); every pick
 *                               is undone in place by tapping it again
 *
 * The old 10-chip "before due" grid and the "repeat every N min" nag are
 * gone; existing repeating reminders still show (and can be removed) as pills.
 * Mounted as a sub-view inside ComposeSheet / TaskDetailsSheet's Modal.
 */
import React, { useMemo, useState } from 'react'
import { Platform, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native'
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import { useLang } from '../../../app/LangContext'
import { useStore } from '../../../app/StoreContext'
import { reminderPresetsFor, type ReminderPresetKey } from '../../../../../core/src/logic/reminderPresets'
import { useTheme } from '../../../app/theme'
import type { Reminder } from '../../../core-bindings/types'
import { genUuid } from '../../../../../core/src/logic/utils'
import { dedupeReminders } from '../../../../../core/src/logic/derive'
import { formatDateTime, isoLocalDateTime, timeOfDay, weekdayTime } from '../../../../../core/src/logic/labels'
import { makeStyles } from './styles'
import AndroidDateFlow from '../../../ui/AndroidDateFlow'

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
  return isoLocalDateTime(base)
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
  if (minutes < 1440) return t.remindPillEveryHour(Math.round(minutes / 60))
  if (minutes < 10080) return t.remindPillEveryDay(Math.round(minutes / 1440))
  return t.remindPillEveryWeek(Math.round(minutes / 10080))
}


export interface ReminderSheetProps {
  /** Existing reminders on the todo (after getReminders normalization
   * by the caller). Empty array when none. */
  initial: Reminder[]
  /** Anchor for the "before due" row. When empty, the row is replaced
   * with a notice and the chips are inactive. */
  dueDate: string
  /** Whether the owning todo recurs. When true, a fixed reminder that
   * lands on the due date's day is shown as a time-of-day ("9:00 AM on
   * the day") rather than a specific date — it rebases per occurrence. */
  recurs?: boolean
  onSave: (next: Reminder[]) => void
}

export default function ReminderSheet({
  initial,
  dueDate,
  recurs = false,
  onSave,
}: ReminderSheetProps) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  // Pending working list — committed on Done. Each entry already has
  // an id; the user can remove via pill ✕ or via tapping an active
  // chip a second time.
  const [pending, setPending] = useState<Reminder[]>(() =>
    dedupeReminders(initial.map((r) => ({ ...r }))),
  )

  const store = useStore()
  const gentleNudge = store.profile.gentleNudge === true
  const [otherOpen, setOtherOpen] = useState(false)
  // Computed once per mount (the sheet is short-lived).
  const presets = useMemo(() => reminderPresetsFor(dueDate), [dueDate])
  const presetLabel: Record<ReminderPresetKey, string> = {
    atTime: t.remindPresetAtTime,
    hourBefore: t.remindPresetHourBefore,
    morningOf: t.remindPresetMorningOf,
    dayBefore: t.remindPresetDayBefore,
    laterToday: t.remindPresetLaterToday,
    tomorrowMorning: t.remindPresetTomorrowMorning,
  }

  function isPresetSelected(at: string): boolean {
    return pending.some((r) => !r.intervalMinutes && r.at === at)
  }

  function togglePreset(at: string) {
    setPending((prev) => {
      const existing = prev.find((r) => !r.intervalMinutes && r.at === at)
      if (existing) return prev.filter((r) => r.id !== existing.id)
      if (prev.length >= MAX_REMINDERS_PER_TODO) return prev
      return [...prev, { id: genUuid(), at }]
    })
  }

  // Fixed (absolute date/time) reminder. Seed the picker from an
  // existing fixed reminder's time so it reflects what's already set
  // (e.g. a parsed "remind at 9am" shows 9:00, not the current clock).
  // Fall back to the due date's time-of-day, then a near-future default.
  const [fixedDate, setFixedDate] = useState<Date>(() => {
    const fixed = initial.find((r) => !r.intervalMinutes && r.at)
    if (fixed) {
      const d = new Date(fixed.at)
      if (!Number.isNaN(d.valueOf())) return d
    }
    if (dueDate) {
      const withTime = dueDate.includes('T') ? dueDate : `${dueDate}T09:00`
      const d = new Date(withTime)
      if (!Number.isNaN(d.valueOf())) return d
    }
    return new Date(Date.now() + 60 * 60 * 1000)
  })
  const [fixedPickerOpen, setFixedPickerOpen] = useState(false)
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
    onSave(dedupeReminders(pending))
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
        // A before-due chip match → "15 min before". Otherwise it's a
        // fixed absolute reminder: on a recurring todo show the
        // time-of-day ("9:00 AM on the day", since it rebases per
        // occurrence); on a one-off show its actual date + time.
        label: m
          ? beforeDuePillLabel(m.minutes, t)
          : recurs
            ? `${timeOfDay(r.at)} on the day`
            : formatDateTime(r.at, { locale: t.locale }),
      })
    }
    for (const r of repeating) {
      out.push({
        id: r.id,
        label: repeatingPillLabel(r.intervalMinutes!, t),
      })
    }
    return out
  }, [pending, dueDate, recurs, t])

  const hasReminders = pending.length > 0

  return (
    <>
      {/* One way out: the Done button below saves (a separate Back that
          discarded read as a second, competing exit). Clear all shows only
          when there's something to clear. */}
      <View style={styles.header}>
        <View style={styles.headerSide} />
        <Text style={styles.titleText}>{t.remindMe}</Text>
        {hasReminders ? (
          <TouchableOpacity
            onPress={clearAll}
            hitSlop={10}
            style={styles.headerSideRight}
            accessibilityRole="button"
            accessibilityLabel={t.remindClearAll}
          >
            <Text style={styles.clearAllText}>{t.remindClearAll}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSideRight} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {/* Your reminders — live preview of what's about to commit. Omitted
            when empty: the WHEN choices below are the whole story then. */}
        {hasReminders && (
          <View>
            <Text style={styles.listHeader}>
              {t.remindYourRemindersWithCount(pending.length)}
            </Text>
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
          </View>
        )}

        {/* WHEN — the plain choices for this to-do. */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>{t.composeWhen}</Text>
          <View style={styles.presetList}>
            {presets.map((p, i) => {
              const active = isPresetSelected(p.at)
              const label = presetLabel[p.key]
              return (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.presetRow, i > 0 && styles.presetRowDivider]}
                  onPress={() => togglePreset(p.at)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={`${label}, ${weekdayTime(p.at)}`}
                >
                  <Text style={styles.presetRowLabel}>{label}</Text>
                  <Text style={styles.presetRowTime}>{weekdayTime(p.at)}</Text>
                  <Text style={[styles.presetRowCheck, !active && styles.presetRowCheckOff]}>✓</Text>
                </TouchableOpacity>
              )
            })}
            <TouchableOpacity
              style={[styles.presetRow, presets.length > 0 && styles.presetRowDivider]}
              onPress={() => setOtherOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: otherOpen }}
            >
              <Text style={styles.presetRowLabel}>{t.remindPresetOther}</Text>
              <Text style={styles.presetRowTime}>{otherOpen ? '⌄' : '›'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Fixed (specific date & time) section — an absolute one-shot
            reminder, independent of the due date. Works for todos with no
            due date too. On recurring todos the saved `at` is rebased per
            occurrence (core expandSeries), preserving the chosen offset. */}
        {otherOpen && (
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>{t.specificTime}</Text>
          <View style={styles.fixedRow}>
            {Platform.OS === 'ios' ? (
              <DateTimePicker
                value={fixedDate}
                mode="datetime"
                display="compact"
                themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
                onChange={onFixedChange}
              />
            ) : (
              <>
                {/* Android's picker is an imperative dialog with no inline
                    'datetime' — show a tappable field that opens a date->time
                    flow instead of an always-present picker that pops on mount. */}
                <TouchableOpacity
                  style={styles.fixedAndroidField}
                  onPress={() => setFixedPickerOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t.a11yChooseDateTime}
                >
                  <Text style={styles.fixedAndroidFieldText}>
                    {formatDateTime(isoLocalDateTime(fixedDate), { locale: t.locale })}
                  </Text>
                </TouchableOpacity>
                {fixedPickerOpen && (
                  <AndroidDateFlow
                    value={fixedDate}
                    mode="datetime"
                    onCommit={(d) => setFixedDate(d)}
                    onDone={() => setFixedPickerOpen(false)}
                  />
                )}
              </>
            )}
            <TouchableOpacity
              style={styles.fixedAddBtn}
              onPress={addFixed}
              accessibilityRole="button"
              accessibilityLabel="Add a reminder at this date and time"
            >
              <Text style={styles.fixedAddBtnText}>{t.add}</Text>
            </TouchableOpacity>
          </View>
        </View>
        )}

        {/* Gentle nudge — profile-wide, remembered once set. */}
        <View style={styles.nudgeCard}>
          <View style={styles.nudgeText}>
            <Text style={styles.nudgeTitle}>{t.gentleNudge}</Text>
            <Text style={styles.nudgeHint}>{t.gentleNudgeHint}</Text>
          </View>
          <Switch
            value={gentleNudge}
            onValueChange={(v) => store.saveProfile((p) => ({ ...p, gentleNudge: v ? true : undefined }))}
            trackColor={{ true: theme.primary, false: theme.surfaceAlt }}
            accessibilityLabel={t.gentleNudge}
          />
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
