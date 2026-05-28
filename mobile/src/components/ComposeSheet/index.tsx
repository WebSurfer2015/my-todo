import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  Pressable, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import Svg, { Rect, Path } from 'react-native-svg'
import { Bell, Repeat, Sparkles } from 'lucide-react-native'
import { Analytics } from '../../analytics'
import { Category, Priority, PRIORITY_VALUES, PRIORITY_COLORS, Recurrence, RecurrenceFreq, RECURRENCE_FREQS, Subtask, Todo, TodoReference } from '../../types'
import { genUuid } from '../../../../core/src/utils'
import { snapDueDateToRecurrence } from '../../../../core/src/derive'
import { CategoryDef, categoryLabel } from '../../categories'
import { useLang } from '../../LangContext'
import { useTheme, ThemeColors } from '../../theme'
import { formatDisplayDate, formatRecurrence, fullDateLabel, isoDate } from '../../utils'
import { todayLocal } from '../../../../core/src/utils'
import PriorityDot from '../PriorityDot'
import CategoryIcon from '../CategoryIcon'
import InlinePicker from '../InlinePicker'
import CustomRecurrenceForm from '../CustomRecurrenceForm'
import AddSubtaskSheet from '../AddSubtaskSheet'
import { useTodoFieldSuggestions, TodoFieldSuggestPills } from '../TodoFieldSuggestPills'
import { ensurePermission } from '../../notifications'
import { ReminderSubView, dueDateAsUntil, type ReminderSubViewProps } from '../TaskDetailsSheet'

type ReminderSubViewStyles = ReminderSubViewProps['styles']
import {
  useSuggestSteps,
  SuggestStepsTrigger,
  SuggestStepsReview,
} from '../SuggestStepsPanel'
import { makeStyles } from './styles';

function CalendarIcon({ size = 18, color = '#8E8E93' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3" y="4" width="18" height="18" rx="2" />
      <Path d="M16 2v4" />
      <Path d="M8 2v4" />
      <Path d="M3 10h18" />
    </Svg>
  )
}

interface Props {
  visible: boolean
  categories: CategoryDef[]
  defaultCategory: Category
  /** Long-lived suggestion history (see TodoReference + store
   * `todoReferences`). Used to surface "you've added this before"
   * picks when the user types — tap a row to auto-fill category,
   * priority, recurrence, and dueDate from the historic entry. */
  references: TodoReference[]
  /** When true, ambient AI field suggestions are queried after the
   * user pauses typing. Off → no AI calls, no pills row. */
  agentEnabled?: boolean
  /** Creates a new category with the given label using a default
   * icon + a rotated color. Returns the new id so the caller can
   * select it. Called from the new-category pill tap after the
   * user confirms via Alert.alert. */
  onCreateCategory?: (label: string) => string
  onAdd: (
    text: string,
    priority: Priority,
    dueDate: string,
    category?: Category,
    recurrence?: Recurrence,
    extras?: { notes?: string; subtasks?: Subtask[]; reminder?: Todo["reminder"] },
  ) => void
  onClose: () => void
}

type SubView = 'main' | 'category' | 'priority' | 'date' | 'repeat' | 'repeatEndDate' | 'customRepeat' | 'remindAt'

function defaultEndDateFor(freq: RecurrenceFreq): Date {
  const d = new Date()
  switch (freq) {
    case 'daily':   d.setDate(d.getDate() + 30); break
    case 'weekly':  d.setDate(d.getDate() + 84); break  // 12 weeks
    case 'monthly': d.setMonth(d.getMonth() + 12); break
    case 'yearly':  d.setFullYear(d.getFullYear() + 5); break
  }
  return d
}

const RECURRENCE_LABELS: Record<'none' | RecurrenceFreq, string> = {
  none: 'Never',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

function recurrenceLabel(rec: Recurrence | undefined): string {
  if (!rec) return 'Never'
  let base: string
  if (rec.byWeekday && rec.byWeekday.length > 0) {
    base = formatRecurrence(rec)
  } else {
    base = RECURRENCE_LABELS[rec.freq] ?? 'Never'
  }
  if (rec.endDate) {
    const d = new Date(`${rec.endDate}T00:00:00`)
    const sameYear = d.getFullYear() === new Date().getFullYear()
    const ends = d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
    })
    return `${base} · ends ${ends}`
  }
  return base
}

function isCustomRecurrence(rec: Recurrence | undefined): boolean {
  return !!rec && Array.isArray(rec.byWeekday) && rec.byWeekday.length > 0
}

/** ISO-8601 local datetime without timezone — what we store for
 * remindAt. Matches the format the AI suggest-todo-fields prompt is
 * told to emit so the scheduler can read either source identically. */
function isoLocalDateTime(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${hh}:${mm}`
}

/** Compact label for a datetime value: short date + local time. */
function formatDateTime(at: string): string {
  const d = new Date(at)
  if (Number.isNaN(d.valueOf())) return at
  const sameYear = d.getFullYear() === new Date().getFullYear()
  const datePart = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
  const timePart = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${datePart}, ${timePart}`
}

/** Reminder label used in the manual Remind me row. One-shot shows
 * the datetime; recurring shows "every Xh until ...". */
function formatReminder(reminder: NonNullable<Todo["reminder"]>): string {
  if (!reminder.intervalMinutes) return formatDateTime(reminder.at)
  const cadence = reminder.intervalMinutes < 60
    ? `${reminder.intervalMinutes}m`
    : `${Math.floor(reminder.intervalMinutes / 60)}h`
  return reminder.until
    ? `every ${cadence} until ${formatDateTime(reminder.until)}`
    : `every ${cadence}`
}

/** Seed picker date when opening the Remind sub-view with no current
 * reminder: morning of dueDate (9am) when dueDate is set and in the
 * future, otherwise 1 hour from now. */
function defaultRemindDate(dueDate: string): Date {
  if (dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    const d = new Date(`${dueDate}T09:00:00`)
    if (d.valueOf() > Date.now()) return d
  }
  return new Date(Date.now() + 60 * 60 * 1000)
}

export default function ComposeSheet({
  visible, categories, defaultCategory, references, agentEnabled = false, onCreateCategory, onAdd, onClose,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const inputRef = useRef<TextInput>(null)
  // Bottom safe-area inset for the home indicator on notched / Dynamic-
  // Island devices. The sheet's static paddingBottom (24) wasn't
  // enough to keep the calendar's last row clear of the home
  // indicator strip — final week clipped against the rounded bottom.
  const insets = useSafeAreaInsets()
  const sheetBottomPad = Math.max(24, insets.bottom + 8)

  const [subView, setSubView] = useState<SubView>('main')
  const [text, setText] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [category, setCategory] = useState<Category>(defaultCategory)
  // Defaults to today so the compose opens with a sensible
  // "Completed by" — the user can clear it from the date sub-view if
  // they want a no-date task. Matches the spec for the Add flow.
  const [dueDate, setDueDate] = useState(todayLocal())
  const [pickerDate, setPickerDate] = useState<Date>(new Date())
  // Pending buffer for the date subview. Mirrors TaskDetailsSheet's
  // edit flow — the picker writes here, Save commits to dueDate.
  // Lets the user dial in a date + time and Cancel back out without
  // mutating the live field.
  const [pendingDueDate, setPendingDueDate] = useState('')
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(undefined)
  // Reminder spec (object or undefined). Stored on the todo at
  // add-time; the post-add syncTodoReminders effect picks it up.
  const [reminder, setReminder] = useState<Todo["reminder"] | undefined>(undefined)
  const [remindPickerDate, setRemindPickerDate] = useState<Date>(new Date())
  // Pending while the Remind sub-view is open. Mirrors the
  // pendingRecurEndDate pattern — committed to `reminder` on Save,
  // discarded on Back.
  const [pendingRemindAt, setPendingRemindAt] = useState<string>('')
  const [pendingRemindInterval, setPendingRemindInterval] = useState<number | undefined>(undefined)
  const [pendingRemindUntil, setPendingRemindUntil] = useState<string>('')
  const [remindSubView, setRemindSubView] = useState<'main' | 'until'>('main')
  // Pending freq while the user is in the 'repeatEndDate' picker — committed
  // to `recurrence` once they pick an end date.
  const [pendingFreq, setPendingFreq] = useState<RecurrenceFreq | null>(null)
  const [endDatePickerDate, setEndDatePickerDate] = useState<Date>(new Date())
  // Notes + queued subtasks: collected in local state so the user can
  // capture everything in one pass, then bulk-attached to the new todo
  // when they tap Add. Mirrors the Edit-Todo sheet's layout.
  const [notes, setNotes] = useState('')
  const [pendingSubtasks, setPendingSubtasks] = useState<Subtask[]>([])
  const [addSubtaskOpen, setAddSubtaskOpen] = useState(false)
  // Track the lowercased text that the user just APPLIED from the
  // suggestion overlay. The overlay hides while `text` (lowercased)
  // equals this marker, and re-engages once the user edits the input
  // to something else. Robust against the iOS multiline TextInput
  // re-emitting onChangeText with the same value after a programmatic
  // setText — which was making the overlay flicker back on first tap.
  const [appliedTextLower, setAppliedTextLower] = useState('')

  useEffect(() => { setCategory(defaultCategory) }, [defaultCategory])

  // Ambient AI field suggestions — fires after typing pause, presents
  // tap-to-apply pills above the field rows. The hook owns debounce,
  // dedupe, and race protection; the pills are pure presentation.
  const aiCategories = useMemo(
    () => categories.map((c) => ({ id: c.id, label: categoryLabel(c, t) })),
    [categories, t],
  )
  const ai = useTodoFieldSuggestions({
    text,
    today: todayLocal(),
    categories: aiCategories,
    agentEnabled,
  })

  // Suggest steps for the in-progress compose. Same hook as
  // TaskDetailsSheet, scoped to (text, notes) of what the user is
  // typing. On apply we push to pendingSubtasks (the local queue
  // attached when the user taps Add).
  const stepsAi = useSuggestSteps({ parentTitle: text, parentNotes: notes })

  // Reset stepsAi state when the sheet opens so suggestions from a
  // prior compose session don't bleed into the new one.
  useEffect(() => {
    if (visible) stepsAi.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  // Suggestion list — once the user has typed ≥3 chars, surface any
  // historic completions (deduplicated by lowercased text, sorted by
  // recency) so they can auto-fill category / priority / recurrence
  // by tapping a row. The history is stored separately from the
  // active todos so the lookup survives the 30-day done-bin purge.
  // 3-char minimum keeps "a", "the", etc. from over-firing.
  const trimmedTextLower = text.trim().toLowerCase()
  const referenceMatches = useMemo(() => {
    if (trimmedTextLower.length < 3) return [] as TodoReference[]
    const out: TodoReference[] = []
    for (const ref of references) {
      if (ref.textLower.includes(trimmedTextLower)) out.push(ref)
      // Cap at 50 — beyond this the dropdown becomes a wall of text
      // even with internal scrolling. The overlay panel itself uses
      // an internal ScrollView so the user can reach the cap entries.
      if (out.length >= 50) break
    }
    return out
  }, [references, trimmedTextLower])

  // Wraps setRecurrence with a dueDate snap — when the picked
  // recurrence has a weekday filter (e.g., "every Wed"), the dueDate
  // should fall on a matching day. Without this, "Run with Conner
  // every wed" on a Saturday would leave dueDate = today (Sat) and
  // the recurrence would feel wrong on first glance.
  function applyRecurrenceWithSnap(rec: Recurrence | undefined) {
    setRecurrence(rec)
    if (rec) {
      const snapped = snapDueDateToRecurrence(dueDate, rec)
      if (snapped !== dueDate) setDueDate(snapped)
    }
  }

  function applyReference(ref: TodoReference) {
    setText(ref.text)
    if (ref.category) setCategory(ref.category)
    if (ref.priority) setPriority(ref.priority)
    applyRecurrenceWithSnap(ref.recurrence)
    // dueDate is intentionally NOT pulled from the reference — it's a
    // per-instance scheduling choice. The user picks the date fresh
    // for the new entry.
    setAppliedTextLower(ref.textLower)
    Haptics.selectionAsync().catch(() => {})
  }

  useEffect(() => {
    if (visible) {
      setSubView('main')
      setText('')
      setPriority('medium')
      setCategory(defaultCategory)
      // Default "Completed by" → today, matching the initial state +
      // user spec. Users can clear from the date sub-view if they
      // want a no-date task.
      setDueDate(todayLocal())
      setRecurrence(undefined)
      setReminder(undefined)
      setPendingRemindAt('')
      setPendingRemindInterval(undefined)
      setPendingRemindUntil('')
      setRemindSubView('main')
      setNotes('')
      setPendingSubtasks([])
      // Clear the suggestion-overlay suppression so it re-engages on
      // the next compose session.
      setAppliedTextLower('')
      // Clean up the recurrence-end-date scratch state.
      setPendingFreq(null)
      const id = setTimeout(() => inputRef.current?.focus(), 120)
      return () => clearTimeout(id)
    }
  }, [visible, defaultCategory])

  const activeCat = categories.find((c) => c.id === category) ?? categories[0]
  const canSubmit = text.trim().length > 0 && !!activeCat

  function submit() {
    const trimmed = text.trim()
    if (!trimmed || !activeCat) return
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    const trimmedNotes = notes.trim()
    onAdd(trimmed, priority, dueDate, activeCat.id, recurrence, {
      notes: trimmedNotes || undefined,
      subtasks: pendingSubtasks.length > 0 ? pendingSubtasks : undefined,
      reminder,
    })
    // Reset compose state so the next open starts clean.
    setText('')
    setNotes('')
    setPendingSubtasks([])
    onClose()
  }

  function openDateView() {
    setPickerDate(dueDate ? new Date(`${dueDate}T00:00:00`) : new Date())
    setPendingDueDate(dueDate)
    setSubView('date')
  }

  function handleInlineDateChange(_event: DateTimePickerEvent, selected?: Date) {
    if (!selected) return
    setPickerDate(selected)
    setPendingDueDate(isoLocalDateTime(selected))
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { paddingBottom: sheetBottomPad }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.handle} />

            {subView === 'main' && (
              <>
                <View style={styles.headerRow}>
                  <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.headerSideBtn}>
                    <Text style={styles.cancelText}>{t.cancel}</Text>
                  </TouchableOpacity>
                  <View style={styles.titleRow}>
                    {agentEnabled && (
                      <Sparkles size={14} color={theme.primary} strokeWidth={2.2} />
                    )}
                    <Text style={styles.title}>Add to-do</Text>
                  </View>
                  <TouchableOpacity
                    onPress={submit}
                    disabled={!canSubmit}
                    hitSlop={10}
                    style={styles.headerSideBtn}
                    accessibilityRole="button"
                    accessibilityLabel={t.done}
                  >
                    <Text style={[styles.saveHeaderText, !canSubmit && styles.saveHeaderTextDisabled]}>
                      {t.done}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Title card lives OUTSIDE the scroll so the
                    suggestion-overlay can pin to its bottom edge and
                    visually float over the form below — the form
                    underneath stays scrollable but isn't pushed
                    down by the panel. */}
                <View style={styles.titleAnchor}>
                  <View style={styles.titleCard}>
                    <TextInput
                      ref={inputRef}
                      style={styles.textInputInCard}
                      placeholder={t.addPlaceholder}
                      placeholderTextColor={theme.gray3}
                      value={text}
                      onChangeText={(next) => {
                        setText(next)
                        // Clear the applied marker only when the text
                        // actually differs from what was applied —
                        // multiline TextInput on iOS can re-emit
                        // onChangeText with the same value after a
                        // programmatic setText, which we must ignore
                        // so the overlay stays dismissed.
                        if (
                          appliedTextLower &&
                          next.toLowerCase() !== appliedTextLower
                        ) {
                          setAppliedTextLower('')
                        }
                      }}
                      multiline
                      maxLength={4096}
                      textAlignVertical="top"
                    />
                    <View style={styles.titleCardDivider} />
                    <TextInput
                      style={styles.notesInputInline}
                      value={notes}
                      onChangeText={setNotes}
                      placeholder={t.notes.placeholder}
                      placeholderTextColor={theme.gray3}
                      multiline
                      maxLength={8192}
                      textAlignVertical="top"
                      accessibilityLabel="Notes — anything that helps you externalize the thinking around this task"
                    />
                  </View>
                  {/* No global Mochi-busy row here — TodoFieldSuggestPills
                      surfaces ai.thinking in its own row, and the
                      SuggestStepsTrigger button shows stepsAi.thinking
                      next to its label. A second one here was just a
                      duplicate stacked indicator. */}
                  {appliedTextLower !== trimmedTextLower &&
                    referenceMatches.length > 0 && (
                    <View style={styles.dupeOverlay} pointerEvents="box-none">
                      <View style={styles.dupeCard}>
                        <View style={styles.dupeHeaderRow}>
                          <Text style={styles.dupeHeader}>
                            You've added this before
                          </Text>
                        </View>
                        <View style={styles.dupeDividerFull} />
                        <ScrollView
                          style={styles.dupeScroll}
                          contentContainerStyle={styles.dupeScrollContent}
                          keyboardShouldPersistTaps="handled"
                          nestedScrollEnabled
                          showsVerticalScrollIndicator
                        >
                        {referenceMatches.map((ref, i) => {
                          const cat = ref.category
                            ? categories.find((c) => c.id === ref.category)
                            : undefined
                          return (
                            <View key={ref.textLower}>
                              {i > 0 && <View style={styles.dupeDivider} />}
                              <TouchableOpacity
                                style={styles.dupeRow}
                                onPress={() => applyReference(ref)}
                                activeOpacity={0.6}
                                accessibilityRole="button"
                                accessibilityLabel={`Use settings from previous: ${ref.text}`}
                              >
                                {cat ? (
                                  <CategoryIcon
                                    icon={cat.icon}
                                    size={14}
                                    color={cat.color}
                                  />
                                ) : (
                                  <View style={styles.dupeRowIconSpacer} />
                                )}
                                <Text style={styles.dupeRowText} numberOfLines={1}>
                                  {ref.text}
                                </Text>
                                {ref.priority && (
                                  <PriorityDot level={ref.priority} size={10} />
                                )}
                                {ref.recurrence && (
                                  <View style={styles.dupeRowRecur}>
                                    <Repeat
                                      size={11}
                                      color={theme.label3}
                                      strokeWidth={2}
                                    />
                                    <Text
                                      style={styles.dupeRowMeta}
                                      numberOfLines={1}
                                    >
                                      {ref.recurrence.byWeekday &&
                                      ref.recurrence.byWeekday.length > 0
                                        ? formatRecurrence(ref.recurrence)
                                        : RECURRENCE_LABELS[
                                            ref.recurrence.freq
                                          ] ?? ref.recurrence.freq}
                                    </Text>
                                  </View>
                                )}
                              </TouchableOpacity>
                            </View>
                          )
                        })}
                        </ScrollView>
                        <View style={styles.dupeDividerFull} />
                        <Text style={styles.dupeHint}>
                          Tap a row to reuse those settings, or keep typing for a
                          fresh entry.
                        </Text>
                      </View>
                    </View>
                  )}
                </View>

                <ScrollView
                  style={styles.body}
                  contentContainerStyle={styles.bodyContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <TodoFieldSuggestPills
                    suggestions={ai.suggestions}
                    thinking={ai.thinking}
                    categories={categories}
                    currentCategory={category}
                    currentPriority={priority}
                    currentDueDate={dueDate}
                    currentRecurrenceFreq={recurrence?.freq}
                    currentRecurrenceEndDate={recurrence?.endDate}
                    currentRecurrenceByWeekday={recurrence?.byWeekday}
                    currentReminder={reminder}
                    onApplyCategory={(id) => {
                      void Analytics.aiSuggestionApplied('suggest-todo-fields')
                      setCategory(id)
                      Haptics.selectionAsync().catch(() => {})
                    }}
                    onApplyNewCategory={(label) => {
                      if (!onCreateCategory) return
                      // Confirm before mutating the user's category
                      // list. Tap on the "+ <label>" pill is
                      // already an explicit signal of intent, but
                      // the side effect (sidebar gains a new entry)
                      // warrants a one-tap-back-out option.
                      Alert.alert(
                        t.todoNewCategorySuggest(label),
                        '',
                        [
                          { text: t.cancel, style: 'cancel', onPress: () => ai.dismissField('newCategoryLabel') },
                          {
                            text: t.create,
                            onPress: () => {
                              const newId = onCreateCategory(label)
                              setCategory(newId)
                              ai.dismissField('newCategoryLabel')
                              Haptics.selectionAsync().catch(() => {})
                            },
                          },
                        ],
                      )
                    }}
                    onApplyPriority={(p) => {
                      setPriority(p)
                      Haptics.selectionAsync().catch(() => {})
                    }}
                    onApplyDueDate={(iso) => {
                      setDueDate(iso)
                      Haptics.selectionAsync().catch(() => {})
                    }}
                    onApplyRecurrence={(rec) => {
                      // Apply freq + optional endDate. User can
                      // refine weekday/bySetPos detail via the
                      // Repeat sub-view if needed.
                      applyRecurrenceWithSnap(rec)
                      Haptics.selectionAsync().catch(() => {})
                    }}
                    onApplyReminder={(rem) => {
                      // Ask for notification permission lazily — only
                      // when the user actually opts into a reminder.
                      // If denied, surface a one-shot alert and leave
                      // the form unchanged (the reminder would never
                      // fire so we don't save the field).
                      void (async () => {
                        if (!(await ensurePermission())) {
                          Alert.alert(
                            t.remindPermissionDeniedTitle,
                            t.remindPermissionDeniedBody,
                          )
                          ai.dismissField('reminder')
                          return
                        }
                        setReminder(rem)
                        Haptics.selectionAsync().catch(() => {})
                      })()
                    }}
                    onDismissField={ai.dismissField}
                  />
                  <View style={styles.fieldGroup}>
                    <TouchableOpacity
                      style={styles.fieldRow}
                      onPress={() => setSubView('category')}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`Category, ${activeCat ? categoryLabel(activeCat, t) : 'none'}. Tap to change.`}
                    >
                      {activeCat && <CategoryIcon icon={activeCat.icon} size={18} color={activeCat.color} />}
                      <Text style={styles.fieldLabel}>{t.composeCategoryLabel}</Text>
                      <Text style={styles.fieldValue} numberOfLines={1}>
                        {activeCat ? categoryLabel(activeCat, t) : ''}
                      </Text>
                      <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>

                    <View style={styles.divider} />

                    <TouchableOpacity
                      style={styles.fieldRow}
                      onPress={() => setSubView('priority')}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`Priority, ${t.priority[priority]}. Tap to change.`}
                    >
                      <PriorityDot level={priority} size={14} />
                      <Text style={styles.fieldLabel}>{t.composePriorityLabel}</Text>
                      <Text style={styles.fieldValue} numberOfLines={1}>
                        {t.priority[priority]}
                      </Text>
                      <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>

                    <View style={styles.divider} />

                    <TouchableOpacity
                      style={styles.fieldRow}
                      onPress={openDateView}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`Completed by, ${dueDate ? formatDisplayDate(dueDate, t.locale) : t.noDate}. Tap to change.`}
                    >
                      <CalendarIcon size={18} color={dueDate ? theme.blue : theme.gray3} />
                      <Text style={styles.fieldLabel}>{t.composeDateLabel}</Text>
                      <Text
                        style={[
                          styles.fieldValue,
                          !dueDate && styles.fieldValueMuted,
                        ]}
                        numberOfLines={1}
                      >
                        {dueDate ? formatDisplayDate(dueDate, t.locale) : t.noDate}
                      </Text>
                      <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>

                    <View style={styles.divider} />

                    <TouchableOpacity
                      style={styles.fieldRow}
                      onPress={() => setSubView('repeat')}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`Repeat, ${recurrenceLabel(recurrence)}. Tap to change.`}
                    >
                      <Repeat size={18} color={recurrence ? theme.blue : theme.gray3} strokeWidth={2} />
                      <Text style={styles.fieldLabel}>Repeat</Text>
                      <Text
                        style={[
                          styles.fieldValue,
                          !recurrence && styles.fieldValueMuted,
                        ]}
                        numberOfLines={1}
                      >
                        {recurrence
                          ? (isCustomRecurrence(recurrence)
                              ? formatRecurrence(recurrence)
                              : RECURRENCE_LABELS[recurrence.freq])
                          : RECURRENCE_LABELS.none}
                      </Text>
                      <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>

                    {recurrence && (
                      <>
                        <View style={styles.divider} />
                        <TouchableOpacity
                          style={styles.fieldRow}
                          onPress={() => {
                            setEndDatePickerDate(
                              recurrence.endDate
                                ? new Date(`${recurrence.endDate}T00:00:00`)
                                : defaultEndDateFor(recurrence.freq),
                            )
                            setPendingFreq(recurrence.freq)
                            setSubView('repeatEndDate')
                          }}
                          activeOpacity={0.6}
                          accessibilityRole="button"
                          accessibilityLabel={`Repeat ends on, ${recurrence.endDate ?? 'never'}. Tap to change.`}
                        >
                          <CalendarIcon size={18} color={recurrence.endDate ? theme.blue : theme.gray3} />
                          <Text style={styles.fieldLabel}>Repeat ends</Text>
                          <Text
                            style={[
                              styles.fieldValue,
                              !recurrence.endDate && styles.fieldValueMuted,
                            ]}
                            numberOfLines={1}
                          >
                            {recurrence.endDate
                              ? new Date(`${recurrence.endDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                              : 'No end'}
                          </Text>
                          <Text style={styles.chevron}>›</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    <View style={styles.divider} />

                    <TouchableOpacity
                      style={styles.fieldRow}
                      onPress={() => {
                        setRemindPickerDate(
                          reminder?.at ? new Date(reminder.at) : defaultRemindDate(dueDate),
                        )
                        setPendingRemindAt(reminder?.at ?? '')
                        setPendingRemindInterval(reminder?.intervalMinutes)
                        setPendingRemindUntil(reminder?.until ?? '')
                        setRemindSubView('main')
                        setSubView('remindAt')
                      }}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`Remind me, ${reminder ? formatReminder(reminder) : t.remindNone}. Tap to change.`}
                    >
                      <Bell size={18} color={reminder ? theme.blue : theme.gray3} strokeWidth={2} />
                      <Text style={styles.fieldLabel}>{t.remindMe}</Text>
                      <Text
                        style={[
                          styles.fieldValue,
                          !reminder && styles.fieldValueMuted,
                        ]}
                        numberOfLines={1}
                      >
                        {reminder ? formatReminder(reminder) : t.remindNone}
                      </Text>
                      <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Notes moved into the title card (top of sheet)
                      so users don't have to scroll past every field
                      row to add a quick context note. */}

                  {/* Steps — queued locally and attached when the user
                      taps Add. Empty state mirrors Edit-Todo. */}
                  <View style={styles.stepsHeaderRow}>
                    <Text style={[styles.sectionHeader, { marginTop: 0, marginBottom: 0, paddingHorizontal: 0 }]}>STEPS</Text>
                    {agentEnabled &&
                      pendingSubtasks.length === 0 &&
                      !stepsAi.suggestions &&
                      text.trim().length > 0 && (
                        <SuggestStepsTrigger
                          thinking={stepsAi.thinking}
                          error={stepsAi.error}
                          onClick={stepsAi.request}
                        />
                      )}
                  </View>
                  {stepsAi.suggestions && (
                    <SuggestStepsReview
                      suggestions={stepsAi.suggestions}
                      parentDueDate={dueDate || undefined}
                      onAddSelected={(picks) => {
                        const now = Date.now()
                        setPendingSubtasks((prev) => [
                          ...prev,
                          ...picks.map((p, i) => ({
                            id: genUuid(),
                            text: p.text,
                            done: false,
                            priority,
                            dueDate: p.dueDate,
                            createdAt: now + i,
                          })),
                        ])
                        stepsAi.reset()
                      }}
                      onCancel={stepsAi.reset}
                    />
                  )}
                  <View style={styles.stepsCard}>
                    {pendingSubtasks.length === 0 ? (
                      <View style={styles.stepsEmpty}>
                        <View style={styles.stepsEmptyDot} />
                        <Text style={styles.stepsEmptyTitle}>No steps yet</Text>
                        <Text style={styles.stepsEmptyHint}>
                          Break this task into smaller steps when you're ready.
                        </Text>
                      </View>
                    ) : (
                      pendingSubtasks.map((s, i) => (
                        <View key={s.id}>
                          {i > 0 && <View style={styles.divider} />}
                          <View style={styles.stepRow}>
                            <View style={styles.stepCheckbox} />
                            <View style={styles.stepBody}>
                              <Text style={styles.stepText} numberOfLines={2}>
                                {s.text}
                              </Text>
                              {s.dueDate ? (
                                <Text style={styles.stepMeta}>
                                  {formatDisplayDate(s.dueDate, t.locale)}
                                </Text>
                              ) : null}
                            </View>
                            <TouchableOpacity
                              onPress={() =>
                                setPendingSubtasks((prev) =>
                                  prev.filter((x) => x.id !== s.id),
                                )
                              }
                              hitSlop={10}
                              style={styles.stepRemoveBtn}
                              accessibilityRole="button"
                              accessibilityLabel={`Remove step: ${s.text}`}
                            >
                              <Text style={styles.stepRemoveText}>×</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))
                    )}
                    <View style={styles.divider} />
                    <TouchableOpacity
                      style={styles.addStepRow}
                      onPress={() => setAddSubtaskOpen(true)}
                      activeOpacity={0.65}
                      accessibilityRole="button"
                      accessibilityLabel="Add a step"
                    >
                      <Text style={styles.addStepText}>+ Add a step…</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </>
            )}

            {subView === 'category' && (
              <InlinePicker
                title={t.composeCategoryLabel}
                options={categories.map((c) => ({
                  key: c.id,
                  label: categoryLabel(c, t),
                  color: c.color,
                  icon: <CategoryIcon icon={c.icon} size={18} color={c.color} />,
                }))}
                selectedKey={category}
                onSelect={(k) => {
                  setCategory(k)
                  setSubView('main')
                }}
                onBack={() => setSubView('main')}
              />
            )}

            {subView === 'priority' && (
              <InlinePicker
                title={t.composePriorityLabel}
                options={PRIORITY_VALUES.map((v) => ({
                  key: v,
                  label: t.priority[v],
                  color: PRIORITY_COLORS[v],
                  icon: <PriorityDot level={v} size={14} />,
                }))}
                selectedKey={priority}
                onSelect={(k) => {
                  setPriority(k as Priority)
                  setSubView('main')
                }}
                onBack={() => setSubView('main')}
              />
            )}

            {subView === 'repeat' && (
              <InlinePicker
                title="Repeat"
                options={[
                  { key: 'none', label: RECURRENCE_LABELS.none, color: theme.label },
                  ...RECURRENCE_FREQS.map((f) => ({
                    key: f,
                    label: RECURRENCE_LABELS[f],
                    color: theme.label,
                    icon: <Repeat size={16} color={theme.blue} strokeWidth={2} />,
                  })),
                  { key: 'custom', label: 'Custom…', color: theme.label },
                ]}
                selectedKey={
                  !recurrence
                    ? 'none'
                    : isCustomRecurrence(recurrence)
                      ? 'custom'
                      : recurrence.freq
                }
                onSelect={(k) => {
                  if (k === 'custom') {
                    setSubView('customRepeat')
                  } else if (k === 'none') {
                    setRecurrence(undefined)
                    setSubView('main')
                  } else {
                    // Picking a frequency commits just the freq — the
                    // user can then optionally tap the separate
                    // "Repeat ends" row on the main sheet to set an
                    // end date, mirroring TaskDetailsSheet's flow.
                    applyRecurrenceWithSnap({ freq: k as RecurrenceFreq })
                    setSubView('main')
                  }
                }}
                // No back button — every option commits and returns to
                // main, so a back affordance reads as redundant.
              />
            )}

            {subView === 'repeatEndDate' && pendingFreq && (
              <>
                <View style={styles.headerRow}>
                  <TouchableOpacity onPress={() => setSubView('repeat')} hitSlop={10}>
                    <Text style={styles.cancelText}>‹ Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.title}>Repeat ends on</Text>
                  <View style={{ width: 56 }} />
                </View>
                <View style={styles.dateWrap}>
                  <Text style={styles.datePendingLabel}>{fullDateLabel(isoDate(endDatePickerDate))}</Text>
                  <DateTimePicker
                    value={endDatePickerDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
                    minimumDate={new Date()}
                    onChange={(e, d) => {
                      if (e.type === 'set' && d) setEndDatePickerDate(d)
                    }}
                  />
                </View>
                <View style={styles.dateActions}>
                  <TouchableOpacity
                    onPress={() => setSubView('repeat')}
                    style={styles.clearBtn}
                  >
                    <Text style={styles.clearBtnText}>{t.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      applyRecurrenceWithSnap({
                        freq: pendingFreq,
                        endDate: isoDate(endDatePickerDate),
                      })
                      setPendingFreq(null)
                      setSubView('main')
                    }}
                    style={[styles.addBtn, styles.applyBtn]}
                  >
                    <Text style={styles.addBtnText}>{t.done}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {subView === 'customRepeat' && (
              <CustomRecurrenceForm
                initial={recurrence}
                onDone={(rec) => {
                  applyRecurrenceWithSnap(rec)
                  setSubView('main')
                }}
                onBack={() => setSubView('repeat')}
              />
            )}

            {subView === 'remindAt' && (
              <ReminderSubView
                styles={styles as unknown as ReminderSubViewStyles}
                theme={theme}
                t={t}
                remindSubView={remindSubView}
                setRemindSubView={setRemindSubView}
                pendingRemindAt={pendingRemindAt}
                setPendingRemindAt={setPendingRemindAt}
                pendingRemindInterval={pendingRemindInterval}
                setPendingRemindInterval={setPendingRemindInterval}
                pendingRemindUntil={pendingRemindUntil}
                setPendingRemindUntil={setPendingRemindUntil}
                remindPickerDate={remindPickerDate}
                setRemindPickerDate={setRemindPickerDate}
                dueDate={dueDate}
                onCancel={() => setSubView('main')}
                onSave={async () => {
                  if (pendingRemindAt && !(await ensurePermission())) {
                    Alert.alert(
                      t.remindPermissionDeniedTitle,
                      t.remindPermissionDeniedBody,
                    )
                    return
                  }
                  let next: Todo["reminder"] | undefined
                  if (pendingRemindAt) {
                    next = { at: pendingRemindAt }
                    if (pendingRemindInterval) {
                      next.intervalMinutes = pendingRemindInterval
                      const fallbackUntil = pendingRemindUntil || dueDateAsUntil(dueDate)
                      if (fallbackUntil) next.until = fallbackUntil
                    }
                  }
                  setReminder(next)
                  setSubView('main')
                }}
              />
            )}

            {subView === 'date' && (
              <>
                <View style={styles.headerRow}>
                  <TouchableOpacity
                    onPress={() => setSubView('main')}
                    hitSlop={10}
                    style={styles.headerSideBtn}
                  >
                    <Text style={styles.cancelText}>‹ {t.back}</Text>
                  </TouchableOpacity>
                  <Text style={styles.title}>{t.composeDateLabel}</Text>
                  <TouchableOpacity
                    onPress={() => setPendingDueDate('')}
                    hitSlop={10}
                    style={styles.headerSideBtn}
                  >
                    <Text style={styles.dateClearBtnText}>{t.clear}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.dateWrap}>
                  {pendingDueDate ? (
                    <Text style={styles.datePendingLabel}>{fullDateLabel(pendingDueDate)}</Text>
                  ) : (
                    <Text style={[styles.datePendingLabel, styles.datePendingLabelEmpty]}>{t.noDate}</Text>
                  )}
                  <DateTimePicker
                    value={pickerDate}
                    mode="datetime"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
                    onChange={handleInlineDateChange}
                  />
                </View>
                <View style={styles.dateActions}>
                  <TouchableOpacity
                    style={styles.dateDoneBtnSolo}
                    onPress={() => {
                      setDueDate(pendingDueDate)
                      setSubView('main')
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Save"
                  >
                    <Text style={styles.dateDoneBtnText}>{t.save}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
      <AddSubtaskSheet
        visible={addSubtaskOpen}
        onAdd={(stepText, stepPriority, stepDue) => {
          setPendingSubtasks((prev) => [
            ...prev,
            {
              id: genUuid(),
              text: stepText,
              done: false,
              priority: stepPriority,
              dueDate: stepDue || undefined,
            },
          ])
        }}
        onClose={() => setAddSubtaskOpen(false)}
        defaultDueDate={dueDate}
      />
    </Modal>
  )
}

