import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  Pressable, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import Svg, { Rect, Path } from 'react-native-svg'
import { Repeat, Sparkles } from 'lucide-react-native'
import { Category, Priority, PRIORITY_VALUES, PRIORITY_COLORS, Recurrence, RecurrenceFreq, RECURRENCE_FREQS, Subtask, TodoReference } from '../types'
import { genUuid } from '../../../core/src/utils'
import { CategoryDef, categoryLabel } from '../categories'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'
import { formatDisplayDate, formatRecurrence, fullDateLabel, isoDate } from '../utils'
import { todayLocal } from '../../../core/src/utils'
import PriorityDot from './PriorityDot'
import CategoryIcon from './CategoryIcon'
import InlinePicker from './InlinePicker'
import CustomRecurrenceForm from './CustomRecurrenceForm'
import AddSubtaskSheet from './AddSubtaskSheet'
import { useTodoFieldSuggestions, TodoFieldSuggestPills } from './TodoFieldSuggestPills'
import {
  useSuggestSteps,
  SuggestStepsTrigger,
  SuggestStepsReview,
} from './SuggestStepsPanel'

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
    extras?: { notes?: string; subtasks?: Subtask[] },
  ) => void
  onClose: () => void
}

type SubView = 'main' | 'category' | 'priority' | 'date' | 'repeat' | 'repeatEndDate' | 'customRepeat'

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

export default function ComposeSheet({
  visible, categories, defaultCategory, references, agentEnabled = false, onCreateCategory, onAdd, onClose,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const inputRef = useRef<TextInput>(null)

  const [subView, setSubView] = useState<SubView>('main')
  const [text, setText] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [category, setCategory] = useState<Category>(defaultCategory)
  // Defaults to today so the compose opens with a sensible
  // "Completed by" — the user can clear it from the date sub-view if
  // they want a no-date task. Matches the spec for the Add flow.
  const [dueDate, setDueDate] = useState(todayLocal())
  const [pickerDate, setPickerDate] = useState<Date>(new Date())
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(undefined)
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

  function applyReference(ref: TodoReference) {
    setText(ref.text)
    if (ref.category) setCategory(ref.category)
    if (ref.priority) setPriority(ref.priority)
    setRecurrence(ref.recurrence)
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
    })
    // Reset compose state so the next open starts clean.
    setText('')
    setNotes('')
    setPendingSubtasks([])
    onClose()
  }

  function openDateView() {
    setPickerDate(dueDate ? new Date(`${dueDate}T00:00:00`) : new Date())
    setSubView('date')
  }

  function handleInlineDateChange(_event: DateTimePickerEvent, selected?: Date) {
    if (!selected) return
    setPickerDate(selected)
    setDueDate(isoDate(selected))
  }

  function clearInlineDate() {
    setDueDate('')
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
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
                    onApplyCategory={(id) => {
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
                      setRecurrence(rec)
                      Haptics.selectionAsync().catch(() => {})
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
                    setRecurrence({ freq: k as RecurrenceFreq })
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
                      setRecurrence({
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
                  setRecurrence(rec)
                  setSubView('main')
                }}
                onBack={() => setSubView('repeat')}
              />
            )}

            {subView === 'date' && (
              <>
                <View style={styles.headerRow}>
                  <TouchableOpacity onPress={() => setSubView('main')} hitSlop={10}>
                    <Text style={styles.cancelText}>‹ Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.title}>Completed by</Text>
                  <TouchableOpacity onPress={clearInlineDate} hitSlop={10}>
                    <Text style={styles.clearBtnText}>{t.clear}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.dateWrap}>
                  {dueDate ? (
                    <Text style={styles.datePendingLabel}>{fullDateLabel(dueDate)}</Text>
                  ) : (
                    <Text style={[styles.datePendingLabel, styles.datePendingLabelEmpty]}>{t.noDate}</Text>
                  )}
                  <DateTimePicker
                    value={pickerDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
                    onChange={handleInlineDateChange}
                  />
                </View>
                <View style={styles.dateActions}>
                  <TouchableOpacity
                    onPress={() => {
                      // Commit the picker's current value even when the
                      // user didn't interact (e.g., today was already
                      // pre-selected and they just tapped Done) — the
                      // DateTimePicker's onChange doesn't fire for a
                      // no-op tap, so we sync it explicitly here.
                      setDueDate(isoDate(pickerDate))
                      setSubView('main')
                    }}
                    style={[styles.addBtn, styles.applyBtn, { flex: 1 }]}
                  >
                    <Text style={styles.addBtnText}>Save</Text>
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

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.modal,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingTop: 16,
      paddingBottom: 24,
      paddingHorizontal: 16,
      // Cap at 90% of the (keyboard-aware) viewport. Without this,
      // when the keyboard opens the sheet's content can push past the
      // top of the screen — the title row and to-do textbox scroll
      // off-screen and become unreachable. Mirrors TaskDetailsSheet's
      // sheet which already had this cap.
      maxHeight: '90%',
      minHeight: 420,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.gray3,
      marginBottom: 12,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 8,
    },
    cancelText: {
      fontSize: 15,
      fontWeight: '500',
      color: c.blue,
      width: 56,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: c.label,
    },
    body: {
      flexGrow: 0,
    },
    bodyContent: {
      paddingTop: 4,
      paddingBottom: 16,
    },
    textInput: {
      minHeight: 96,
      fontSize: 16,
      color: c.label,
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 12,
      letterSpacing: -0.16,
      lineHeight: 22,
    },
    // Variant of textInput that lives inside the same card as the
    // field rows (mirrors Edit-Todo layout). No border/corners since
    // the wrapping fieldGroup card handles those.
    textInputInCard: {
      minHeight: 64,
      fontSize: 16,
      color: c.label,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 12,
      letterSpacing: -0.16,
      lineHeight: 22,
    },
    headerSideBtn: { width: 60 },
    saveHeaderText: {
      fontSize: 15,
      color: c.blue,
      fontWeight: '700',
      textAlign: 'right',
    },
    saveHeaderTextDisabled: { color: c.gray3 },
    sectionHeader: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: c.label3,
      marginTop: 20,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    // Row that holds the STEPS heading on the left and the
    // Suggest steps trigger pill on the right when applicable.
    // Mirrors TaskDetailsSheet's subtaskSectionRow.
    stepsHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      marginTop: 20,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    stepsCard: {
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      overflow: 'hidden',
    },
    stepsEmpty: {
      paddingVertical: 18,
      paddingHorizontal: 16,
      alignItems: 'center',
    },
    stepsEmptyDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.label3,
      marginBottom: 8,
    },
    stepsEmptyTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: c.label,
      marginBottom: 4,
    },
    stepsEmptyHint: {
      fontSize: 12,
      color: c.label3,
      textAlign: 'center',
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    stepCheckbox: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: c.gray3,
    },
    stepBody: { flex: 1 },
    stepText: { fontSize: 14, color: c.label },
    stepMeta: { fontSize: 11, color: c.label3, marginTop: 2 },
    stepRemoveBtn: { paddingHorizontal: 6 },
    stepRemoveText: { fontSize: 20, color: c.label3, lineHeight: 22 },
    addStepRow: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      alignItems: 'center',
    },
    addStepText: { fontSize: 14, color: c.blue, fontWeight: '600' },
    fieldGroup: {
      marginTop: 16,
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      overflow: 'hidden',
    },
    // Title + inline notes — sits above the suggestion list so the
    // user's typing surface is anchored at the top of the sheet.
    // Notes lives inside the same card under a hairline so quick
    // context capture doesn't require scrolling past every field row.
    titleCard: {
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      overflow: 'hidden',
    },
    titleCardDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginHorizontal: 14,
    },
    notesInputInline: {
      minHeight: 56,
      fontSize: 14,
      color: c.label,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 12,
      lineHeight: 19,
    },
    // Anchor wrapper for the title input + floating overlay. position:
    // relative so the overlay can absolute-position itself against
    // this container without escaping the parent sheet's coordinate
    // system. zIndex pulls the wrapper above the body ScrollView so
    // the overlay clip path covers form content underneath.
    titleAnchor: {
      position: 'relative',
      zIndex: 10,
    },
    // Suggestion overlay — anchored to the bottom edge of the title
    // card (top: 100%) so it appears to drop down from where the
    // user is typing. Doesn't push the form below; just floats over
    // it. The inner ScrollView caps tall lists at maxHeight.
    dupeOverlay: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      marginTop: 8,
      zIndex: 11,
      elevation: 8,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 10,
    },
    dupeScroll: {
      maxHeight: 240,
    },
    dupeScrollContent: {
      paddingBottom: 0,
    },
    dupePanel: {
      marginTop: 14,
      marginBottom: 4,
    },
    dupeHeaderRow: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 8,
    },
    dupeHeader: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: c.primary,
    },
    // Suggestion list reads as a distinct surface — mint-tinted
    // background + primary-tinted border + slight inner shadow so the
    // user immediately registers it as "history / past entries", not
    // part of the new-todo form being composed below.
    dupeCard: {
      backgroundColor: c.primarySoft,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.primary,
      overflow: 'hidden',
    },
    dupeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      minHeight: 40,
    },
    dupeRowText: { flex: 1, fontSize: 14, color: c.label },
    dupeRowIconSpacer: { width: 14 },
    dupeRowMeta: {
      fontSize: 12,
      color: c.label3,
      maxWidth: 110,
    },
    dupeRowRecur: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    dupeDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.primary,
      opacity: 0.18,
      marginLeft: 38,
    },
    dupeDividerFull: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.primary,
      opacity: 0.18,
    },
    dupeHint: {
      fontSize: 12,
      color: c.label2,
      paddingHorizontal: 12,
      paddingVertical: 10,
      lineHeight: 16,
      fontStyle: 'italic',
    },
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    fieldLabel: {
      flex: 1,
      fontSize: 15,
      color: c.label,
      fontWeight: '500',
    },
    fieldValue: {
      fontSize: 15,
      color: c.label2,
      maxWidth: 160,
    },
    fieldValueMuted: {
      color: c.gray3,
    },
    chevron: {
      fontSize: 18,
      color: c.gray3,
      fontWeight: '300',
      marginLeft: 2,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginLeft: 44,
    },
    addBtn: {
      marginTop: 20,
      height: 50,
      borderRadius: 12,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnDisabled: {
      backgroundColor: c.gray3,
      opacity: 0.5,
    },
    addBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
    dateWrap: {
      paddingTop: 8,
      alignItems: 'center',
    },
    datePendingLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: c.label2,
      marginBottom: 8,
    },
    datePendingLabelEmpty: {
      color: c.label3,
      fontStyle: 'italic',
      fontWeight: '500',
    },
    dateActions: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
    },
    clearBtn: {
      flex: 1,
      marginTop: 20,
      height: 50,
      borderRadius: 12,
      backgroundColor: c.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    clearBtnText: {
      color: c.label2,
      fontSize: 16,
      fontWeight: '500',
    },
    applyBtn: {
      flex: 1.4,
    },
  })
}
