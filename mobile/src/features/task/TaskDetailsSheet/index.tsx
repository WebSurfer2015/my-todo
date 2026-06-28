import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from 'react-native'
import Svg, { Path, Line, Polyline, Rect } from 'react-native-svg'
import { Bell, Repeat } from 'lucide-react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import * as Haptics from 'expo-haptics'
import { Category, Priority, Reminder, Subtask, Todo, Recurrence, RecurrenceFreq, RECURRENCE_FREQS, PRIORITY_VALUES, PRIORITY_COLORS } from '../../../core-bindings/types'
import { getReminders } from '../../../../../core/src/logic/derive'
import ReminderSheet from '../ReminderSheet'

const RECURRENCE_LABELS: Record<'none' | RecurrenceFreq, string> = {
  none: 'Never',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { CategoryDef, categoryLabel } from '../../../core-bindings/categories'
import { formatDisplayDate, formatRecurrence, fullDateLabel, isoDate, todayLocal } from '../../../core-bindings/utils'
import {
  endOfWeekLocal,
  endOfMonthLocal,
  endOfYearLocal,
  dueDateOnly,
} from '../../../../../core/src/logic/utils'
import { sortedSubs, snapDueDateToRecurrence } from '../../../../../core/src/logic/derive'
import { useTheme, ThemeColors } from '../../../app/theme'
import { useLang } from '../../../app/LangContext'
import { useNotify } from '../../../app/notify'
import PriorityDot from '../../../ui/PriorityDot'
import CategoryIcon from '../../../ui/CategoryIcon'
import PickerModal from '../../../ui/PickerModal'
import AddSubtaskSheet from '../AddSubtaskSheet'
import EmptyState from '../../../ui/EmptyState'
import InlinePicker from '../../../ui/InlinePicker'
import {
  useSuggestSteps,
  SuggestStepsTrigger,
  SuggestStepsReview,
} from '../SuggestStepsPanel'
import { useTodoFieldSuggestions, TodoFieldSuggestPills } from '../TodoFieldSuggestPills'
import MochiThinking from '../../mochi/MochiThinking'
import { ensurePermission } from '../../../adapters/notifications'
import CustomRecurrenceForm from '../CustomRecurrenceForm'
import { makeStyles } from './styles';

function recurrenceLabel(rec: Recurrence | undefined): string {
  if (!rec) return RECURRENCE_LABELS.none
  let base: string
  if (rec.byWeekday && rec.byWeekday.length > 0) {
    base = formatRecurrence(rec)
  } else {
    base = RECURRENCE_LABELS[rec.freq] ?? RECURRENCE_LABELS.none
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

/**
 * Absolute date label for "Completed by" — "May 17" (current year) or
 * "May 17, 2027" (other year). Distinct from formatDisplayDate which
 * gives a relative reading ("in 2 days") that's wrong for a target
 * date the user explicitly picked.
 */
function absoluteDateLabel(iso: string): string {
  const tIndex = iso.indexOf('T')
  const datePart = tIndex === -1 ? iso : iso.slice(0, tIndex)
  const timePart = tIndex === -1 ? '' : iso.slice(tIndex + 1)
  const d = new Date(`${datePart}T00:00:00`)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  const dateLabel = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
  if (!timePart) return dateLabel
  const [hh, mm] = timePart.slice(0, 5).split(':').map(Number)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return dateLabel
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm)
  return `${dateLabel}, ${dt.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`
}

function isCustomRecurrence(rec: Recurrence | undefined): boolean {
  return !!rec && Array.isArray(rec.byWeekday) && rec.byWeekday.length > 0
}

/** ISO-8601 local datetime without timezone suffix — what we store for
 * remindAt. Matches the format the AI is asked to return so the
 * scheduler can read either source identically. */
function isoLocalDateTime(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${hh}:${mm}`
}

/** Friendly label for a datetime: short date + local time. */
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

/** Compact label for an interval — "1h", "30m", "2h 30m". */
function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** Compose the user-visible label for a reminder. One-shot → just
 * the datetime. Recurring → "every Xh until Wed 3pm". */
function formatReminder(reminder: Todo["reminder"] | undefined): string {
  if (!reminder?.at) return ''
  if (!reminder.intervalMinutes) return formatDateTime(reminder.at)
  const cadence = formatInterval(reminder.intervalMinutes)
  return reminder.until
    ? `every ${cadence} until ${formatDateTime(reminder.until)}`
    : `every ${cadence}`
}

/** Summary string for the Bell row field-value when a todo carries
 * the multi-reminder array. 0 → t.remindNone. 1 → formatReminder.
 * N → t.remindYourRemindersWithCount(N) ("Your reminders (N)"). */
function reminderSummary(
  reminders: Reminder[],
  t: ReturnType<typeof useLang>['t'],
): string {
  if (reminders.length === 0) return t.remindNone
  if (reminders.length === 1) return formatReminder(reminders[0])
  return t.remindYourRemindersWithCount(reminders.length)
}

// Reminder-picker chip constants + helpers moved to
// ../ReminderSheet/index.tsx. defaultRemindDate / XIcon / dueDateAsUntil
// retired with the inline ReminderSubView.

function PlusIcon({ size = 18, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 5v14" />
      <Path d="M5 12h14" />
    </Svg>
  )
}

function TrashIcon({ size = 16, color = '#999' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="3,6 5,6 21,6" />
      <Path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <Line x1="10" y1="11" x2="10" y2="17" />
      <Line x1="14" y1="11" x2="14" y2="17" />
      <Path d="M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2" />
    </Svg>
  )
}

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
  todo: Todo
  categories: CategoryDef[]
  /** When set, opening the sheet jumps directly into the subtask-edit
   * sub-view for this subtask id (skipping the parent edit view). */
  initialSubtaskEditId?: string | null
  onClose: () => void
  onUpdateText: (id: string, text: string) => void
  onUpdateNotes?: (id: string, notes: string) => void
  onUpdatePriority: (id: string, priority: Priority) => void
  onUpdateDueDate: (id: string, dueDate: string) => void
  onUpdateCategory: (id: string, category: Category) => void
  onUpdateRecurrence: (id: string, recurrence: Recurrence | undefined) => void
  /** Set/clear the reminder. Pass `undefined` to clear; pass a
   * reminder object for one-shot (`{at}`) or recurring (`{at,
   * intervalMinutes, until}`). The OS-level schedule is reconciled
   * separately by App.tsx's syncTodoReminders effect. */
  onUpdateReminder?: (id: string, reminder: Todo["reminder"] | undefined) => void
  /** Multi-reminder write — replaces the entire `reminders[]` on a
   * todo. Used by the new ReminderSheet (multi-select chips, "Your
   * reminders" pill list, Clear all). */
  onUpdateReminders?: (id: string, reminders: Reminder[]) => void
  onMoveToTrash: (id: string) => void
  /** Optional — used by the "Delete to-do" action to permanently delete a
   * done item (skipping the trash step). Open items still go to trash. */
  onPermanentDelete?: (id: string) => void
  /** Optional — when provided, "Delete to-do" on a recurring instance with
   * a seriesId offers a "Delete this and all future" option. */
  onMoveSeriesFutureToTrash?: (id: string) => void
  /** Skip this occurrence (recurring/series). */
  onSkip?: (id: string) => void
  /** Skip this + all future occurrences in the series. */
  onSkipSeries?: (id: string) => void
  /** Permanently delete this + all future occurrences in the series. */
  onPermanentDeleteSeries?: (id: string) => void
  /** Optional — copies text/priority/category/notes from this instance to
   * every future non-trashed sibling in the same series. Skips detached
   * instances unless `options.overwriteDetached` is true. */
  onApplySeriesFutureEdits?: (
    id: string,
    fields: {
      text?: string;
      priority?: Priority;
      category?: Category | undefined;
      notes?: string;
    },
    options?: { overwriteDetached?: boolean; silent?: boolean },
  ) => void
  /** R6a — Mark this series instance as detached so later series-wide
   * edits skip it by default. Fires when the user edits a
   * series-eligible field in "Edit this only" mode on a series row. */
  onDetachFromSeries?: (id: string) => void
  /** R6b — Apply a new recurrence to the whole series and recreate
   * the tail. Called by the "Recreate all / Keep modified" dialog
   * fired at Save in series mode when the user changes the
   * recurrence shape. */
  onApplyRecurrenceChange?: (
    id: string,
    newRecurrence: Recurrence | undefined,
    options: { keepDetached: boolean },
  ) => void
  /** R6c — Propagate the target's current subtasks shape to every
   * future non-trashed sibling. Called by the "Overwrite all /
   * Keep modified" dialog fired at Save in series mode when the
   * user changed the subtask shape during the session. */
  onApplySeriesSubtasks?: (
    id: string,
    options: { keepDetached: boolean },
  ) => void
  onAddSubtask: (id: string, text: string, priority?: Priority, dueDate?: string) => void
  onToggleSubtask: (id: string, subId: string) => void
  onUpdateSubtaskText: (id: string, subId: string, text: string) => void
  onUpdateSubtaskPriority?: (id: string, subId: string, priority: Priority) => void
  onUpdateSubtaskDueDate?: (id: string, subId: string, dueDate: string) => void
  onRemoveSubtask: (id: string, subId: string) => void
  /** Optional bulk clear — when provided, the sheet renders a
   * "Clear all steps" link below the subtask list. */
  onClearSubtasks?: (id: string) => void
  /** When true, shows the AI "Suggest steps" panel in the empty
   * subtask state. Off by default; flipped by profile.agentEnabled at
   * the call site. */
  agentEnabled?: boolean
}

export default function TaskDetailsSheet({
  visible, todo, categories, initialSubtaskEditId, onClose, onUpdateText, onUpdateNotes,
  onUpdatePriority, onUpdateDueDate, onUpdateCategory, onUpdateRecurrence, onUpdateReminder, onUpdateReminders, onMoveToTrash, onPermanentDelete, onMoveSeriesFutureToTrash, onSkip, onSkipSeries, onPermanentDeleteSeries, onApplySeriesFutureEdits, onDetachFromSeries, onApplyRecurrenceChange, onApplySeriesSubtasks,
  onAddSubtask, onToggleSubtask, onUpdateSubtaskText,
  onUpdateSubtaskPriority, onUpdateSubtaskDueDate, onRemoveSubtask, onClearSubtasks,
  agentEnabled,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const notify = useNotify()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const subs = todo.subtasks ?? []
  // R6a — Edit-scope toggle for series instances. Hidden when the
  // row has no seriesId. Default "this only" is the safer choice.
  // Reset on every visible-true so reopening the sheet doesn't
  // remember a previous session's pick.
  const isSeriesRow = !!todo.seriesId
  const [editMode, setEditMode] = useState<'this' | 'series'>('this')
  // Recurrence is locked (visible but non-editable) when editing a single
  // occurrence of a series — changing the cadence only makes sense series-wide.
  const repeatLocked = isSeriesRow && editMode === 'this'
  // When editing the whole series, the bottom actions apply to this + all
  // future occurrences ("Delete series" / "Skip all" / "Mark all done");
  // otherwise they act on this single todo/occurrence.
  const seriesScope = isSeriesRow && editMode === 'series'
  // Toast bookkeeping: only show the detach toast the first time the
  // user makes a series-eligible edit per sheet-open. Resets on each
  // visible toggle.
  const detachToastShownRef = useRef(false)
  // R6c — snapshot of the subtask shape (text/priority/dueDate/order)
  // taken when the sheet opens. Diffed at Save in series mode to
  // decide whether to fire the "Overwrite all / Keep modified"
  // dialog. Sub.done changes intentionally don't count — those are
  // per-instance progress markers, not series edits.
  const initialSubtasksRef = useRef<Subtask[] | undefined>(undefined)
  useEffect(() => {
    if (visible) {
      setEditMode('this')
      detachToastShownRef.current = false
      initialSubtasksRef.current = todo.subtasks
        ? todo.subtasks.map((s) => ({ ...s }))
        : undefined
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])
  const doneCount = subs.filter((s) => s.done).length
  const ai = useSuggestSteps({ parentTitle: todo.text, parentNotes: todo.notes })

  // The sheet is a Modal — it stays mounted across close→reopen
  // cycles, so without an explicit reset the `ai.suggestions` from
  // a previous open lingers. That breaks the Suggest pill render
  // (gated on !ai.suggestions) and shows a stale review panel
  // instead. Same reasoning applies to fieldAi (defined below).
  useEffect(() => {
    if (visible) {
      ai.reset()
      fieldAi.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const [addSubtaskOpen, setAddSubtaskOpen] = useState(false)

  // Edit form state (sheet is always in edit mode for the parent task)
  const [editText, setEditText] = useState(todo.text)
  const [editNotes, setEditNotes] = useState(todo.notes ?? '')
  const [editPriority, setEditPriority] = useState<Priority>(todo.priority)
  const [editCategory, setEditCategory] = useState<Category | undefined>(todo.category)
  const [editDueDate, setEditDueDate] = useState(todo.dueDate ?? '')

  // Ambient AI field suggestions for the edit flow. Mirrors the
  // ComposeSheet wiring: same hook, same pill component, same
  // no-op suppression based on current edit-form state. Hook is a
  // no-op when agentEnabled is false (skips the AI call).
  const aiFieldCategories = useMemo(
    () => categories.map((c) => ({ id: c.id, label: categoryLabel(c, t) })),
    [categories, t],
  )
  const fieldAi = useTodoFieldSuggestions({
    text: editText,
    today: todayLocal(),
    categories: aiFieldCategories,
    agentEnabled: !!agentEnabled,
    // Seed text so AI doesn't fire when the user just opens an
    // existing todo — only when they actually edit the title.
    initialText: todo.text,
  })
  const [editPriorityOpen, setEditPriorityOpen] = useState(false)
  const [editCategoryOpen, setEditCategoryOpen] = useState(false)
  const [editPickerDate, setEditPickerDate] = useState<Date>(new Date())
  // Pending value while the "Completed by" page is open. Tapping a date or
  // Clear updates this only; the field on the parent edit card is committed
  // when the user taps the bottom Done action (or discarded on Back).
  const [pendingEditDueDate, setPendingEditDueDate] = useState<string>('')
  const [editRecurrence, setEditRecurrence] = useState<Recurrence | undefined>(undefined)
  const [parentEditView, setParentEditView] = useState<'main' | 'repeat' | 'customRepeat' | 'date' | 'recurEndDate' | 'remindAt'>('main')
  // Reminder state — editor tracks the pending object (or null when
  // cleared); on Save we commit + sync. Mirrors the existing
  // pending-date pattern.
  const [editReminder, setEditReminder] = useState<Todo["reminder"] | undefined>(todo.reminder)
  // Multi-reminder shadow state — what the ReminderSheet writes back.
  // Initialized from `getReminders(todo)` so legacy single-reminder
  // docs read in cleanly.
  const [editReminders, setEditReminders] = useState<Reminder[]>(() =>
    getReminders(todo),
  )
  // (Pending pickerDate / pendingRemindAt / Interval / Until and
  // remindSubView removed — the redesigned ReminderSubView owns
  // its own chip-selection state and returns the built reminder
  // via onSave.)
  const [endDatePickerDate, setEndDatePickerDate] = useState<Date>(new Date())
  // Pending while the Repeat-ends page is open; same semantics as the
  // other pending date states.
  const [pendingRecurEndDate, setPendingRecurEndDate] = useState<string>('')

  // Subtask edit (in-sheet) — when set, renders the edit-subtask sub-view.
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null)
  const [editSubText, setEditSubText] = useState('')
  const [editSubPriority, setEditSubPriority] = useState<Priority>('medium')
  const [editSubDueDate, setEditSubDueDate] = useState('')
  // Snapshot of the sub's text/priority/dueDate at the moment the
  // user opened the Edit Step sheet. Cancel reverts to this; Done
  // keeps whatever auto-saved during the session. Used by
  // cancelSubtaskEdit — never read elsewhere.
  const [editSubOriginal, setEditSubOriginal] = useState<{
    text: string
    priority: Priority
    dueDate: string
  } | null>(null)
  // Pending while the subtask Completed-by page is open; same semantics
  // as pendingEditDueDate for the parent task.
  const [pendingEditSubDueDate, setPendingEditSubDueDate] = useState<string>('')
  const [editSubPickerView, setEditSubPickerView] = useState<'main' | 'priority' | 'date'>('main')
  const [editSubPickerDate, setEditSubPickerDate] = useState<Date>(new Date())

  const [subPriorityForId, setSubPriorityForId] = useState<string | null>(null)
  const [subDateForId, setSubDateForId] = useState<string | null>(null)
  const [subPickerDate, setSubPickerDate] = useState<Date>(new Date())
  // Pending value for the per-subtask iOS date modal (separate from the
  // sub-page editor's pendingEditSubDueDate).
  const [pendingSubModalDate, setPendingSubModalDate] = useState<string>('')

  // Re-seed form values when sheet opens or task changes.
  useEffect(() => {
    if (visible) {
      setEditText(todo.text)
      setEditNotes(todo.notes ?? '')
      setEditPriority(todo.priority)
      setEditCategory(todo.category)
      setEditDueDate(todo.dueDate ?? '')
      setEditRecurrence(todo.recurrence)
      setEditReminder(todo.reminder)
      setEditReminders(getReminders(todo))
      setParentEditView('main')
      // Honor an opener-provided "open into subtask edit" intent. If the
      // caller passed a subtask id, jump straight into its edit form.
      if (initialSubtaskEditId) {
        const sub = todo.subtasks?.find((s) => s.id === initialSubtaskEditId)
        if (sub) {
          setEditSubText(sub.text)
          setEditSubPriority(sub.priority ?? 'medium')
          setEditSubDueDate(sub.dueDate ?? '')
          setEditSubOriginal({
            text: sub.text,
            priority: sub.priority ?? 'medium',
            dueDate: sub.dueDate ?? '',
          })
          setEditSubPickerView('main')
          setEditingSubtaskId(sub.id)
        }
      } else {
        setEditingSubtaskId(null)
        setEditSubOriginal(null)
      }
    }
  }, [visible, todo, initialSubtaskEditId])

  const editActiveCat = categories.find((c) => c.id === editCategory) ?? categories[0]

  // R6c — ordered shape diff for the subtask list. Returns true when
  // the user added, removed, reordered, or edited text/priority/
  // dueDate of any sub during this sheet-open. Toggling done is
  // intentionally ignored (those are per-instance progress markers).
  function subtasksShapeDiffers(
    before: Subtask[] | undefined,
    after: Subtask[] | undefined,
  ): boolean {
    const a = before ?? []
    const b = after ?? []
    if (a.length !== b.length) return true
    for (let i = 0; i < a.length; i++) {
      const x = a[i]
      const y = b[i]
      if (x.id !== y.id) return true
      if (x.text !== y.text) return true
      if ((x.priority ?? 'medium') !== (y.priority ?? 'medium')) return true
      if ((x.dueDate ?? '') !== (y.dueDate ?? '')) return true
    }
    return false
  }

  // R6a — series-aware detach helper. Fires once per sheet-open on
  // the first series-eligible edit in "Edit this only" mode. Idempotent
  // at the core layer so re-firing is safe; the toast gate makes it
  // user-visible only the first time.
  function maybeDetachOnEdit() {
    if (!isSeriesRow) return
    if (todo.detachedFromSeries) return
    if (editMode !== 'this') return
    onDetachFromSeries?.(todo.id)
    if (!detachToastShownRef.current) {
      detachToastShownRef.current = true
      notify.showSnackbar({ message: t.detachedToast })
    }
  }

  // Auto-save helpers. In "this only" mode every picker change commits
  // immediately to this row. In "Edit series" mode text / notes /
  // priority / category buffer locally until the header Save button —
  // that's the explicit commit point that also propagates the changes
  // to every future sibling. dueDate / recurrence / reminder stay live
  // in both modes (R6b/R7 scope).
  function applyText(next: string) {
    const trimmed = next.trim()
    if (!trimmed || trimmed === todo.text) return
    if (editMode === 'series' && isSeriesRow) return // buffered until Save
    onUpdateText(todo.id, trimmed)
    maybeDetachOnEdit()
  }
  function applyNotes(next: string) {
    if (!onUpdateNotes) return
    if (next === (todo.notes ?? '')) return
    if (editMode === 'series' && isSeriesRow) return // buffered until Save
    onUpdateNotes(todo.id, next)
    maybeDetachOnEdit()
  }
  function applyPriority(p: Priority) {
    setEditPriority(p)
    if (p === todo.priority) return
    if (editMode === 'series' && isSeriesRow) return // buffered until Save
    onUpdatePriority(todo.id, p)
    maybeDetachOnEdit()
  }
  function applyCategory(cId: string) {
    setEditCategory(cId)
    if (cId === todo.category) return
    if (editMode === 'series' && isSeriesRow) return // buffered until Save
    onUpdateCategory(todo.id, cId)
    maybeDetachOnEdit()
  }
  function applyDueDate(d: string) {
    setEditDueDate(d)
    if (d !== (todo.dueDate ?? '')) onUpdateDueDate(todo.id, d)
  }
  function applyRecurrence(r: Recurrence | undefined) {
    setEditRecurrence(r)
    // R6b — in series mode the change is buffered until Save so the
    // commit path can fire the "Recreate all / Keep modified" dialog
    // before mutating cloud state. In "this only" mode the change
    // commits live (existing R6a behavior).
    const seriesBuffer = editMode === 'series' && isSeriesRow
    if (!seriesBuffer && JSON.stringify(r ?? null) !== JSON.stringify(todo.recurrence ?? null)) {
      onUpdateRecurrence(todo.id, r)
    }
    // Snap dueDate to the first matching occurrence when the
    // recurrence has a weekday filter and the current dueDate
    // doesn't fall on it. Keeps edit-flow parity with compose.
    // In series mode the snap stays local; the eventual
    // applyRecurrenceChange in the slice re-snaps as part of the
    // recreate so the persisted dueDate stays consistent.
    if (r) {
      const snapped = snapDueDateToRecurrence(editDueDate, r)
      if (snapped !== editDueDate) {
        setEditDueDate(snapped)
        if (!seriesBuffer) onUpdateDueDate(todo.id, snapped)
      }
    }
  }
  async function applyReminder(reminder: Todo["reminder"] | undefined) {
    setEditReminder(reminder)
    const sameAsStored =
      JSON.stringify(reminder ?? null) === JSON.stringify(todo.reminder ?? null)
    if (sameAsStored) return
    if (reminder?.at && !(await ensurePermission())) {
      Alert.alert(
        t.remindPermissionDeniedTitle,
        t.remindPermissionDeniedBody,
      )
      // Bail without committing — the OS won't fire the notification
      // and saving the field would lie to the user. Reset the local
      // editor so the row reflects the actual stored value.
      setEditReminder(todo.reminder)
      return
    }
    onUpdateReminder?.(todo.id, reminder)
  }
  // Multi-reminder commit — called from the redesigned ReminderSheet.
  // Same permission-denied revert pattern as applyReminder.
  async function applyReminders(next: Reminder[]) {
    setEditReminders(next)
    const sameAsStored =
      JSON.stringify(next) === JSON.stringify(getReminders(todo))
    if (sameAsStored) return
    if (next.length > 0 && !(await ensurePermission())) {
      Alert.alert(t.remindPermissionDeniedTitle, t.remindPermissionDeniedBody)
      setEditReminders(getReminders(todo))
      return
    }
    onUpdateReminders?.(todo.id, next)
  }
  function closeAndFlushText() {
    // "Save" path. In "this only" mode this is a final flush for
    // text + notes (other fields auto-save on pick). In "Edit
    // series" mode every series-eligible field has been buffered
    // locally — Save is the commit point: write changed fields to
    // this row, then propagate to all future siblings via
    // applySeriesFutureEdits. Cancel / scrim-tap routes through
    // closeWithoutFlush which drops the buffer.
    const seriesCommit = editMode === 'series' && isSeriesRow
    const trimmedText = editText.trim()
    const textChanged = !!trimmedText && trimmedText !== todo.text
    const notesChanged = onUpdateNotes !== undefined && editNotes !== (todo.notes ?? '')
    const priorityChanged = editPriority !== todo.priority
    const categoryChanged = editCategory !== todo.category
    const recurrenceChanged =
      JSON.stringify(editRecurrence ?? null) !== JSON.stringify(todo.recurrence ?? null)

    // Commits the buffered text/notes/priority/category to this row +
    // propagates to future series siblings. Called from both the
    // straight-Save and the post-dialog paths so the same diff lands
    // either way.
    function commitBufferedSeriesFields() {
      if (textChanged) onUpdateText(todo.id, trimmedText)
      if (notesChanged) onUpdateNotes!(todo.id, editNotes)
      if (priorityChanged) onUpdatePriority(todo.id, editPriority)
      if (categoryChanged && editCategory !== undefined) onUpdateCategory(todo.id, editCategory)
      const fields: {
        text?: string
        priority?: Priority
        category?: Category | undefined
        notes?: string
      } = {}
      if (textChanged) fields.text = trimmedText
      if (notesChanged) fields.notes = editNotes
      if (priorityChanged) fields.priority = editPriority
      if (categoryChanged) fields.category = editCategory
      if (Object.keys(fields).length > 0) {
        onApplySeriesFutureEdits?.(todo.id, fields)
      }
    }

    const subtasksChanged =
      seriesCommit &&
      subtasksShapeDiffers(initialSubtasksRef.current, todo.subtasks)

    // R6b — series + recurrence change: fire the three-option dialog
    // before any persistence happens. When the recurrence is replaced
    // the new tail is freshly expanded from the target row, which
    // already carries the user's just-edited subtasks; so the R6c
    // propagation is redundant in this branch and skipped.
    if (seriesCommit && recurrenceChanged && onApplyRecurrenceChange) {
      Alert.alert(
        t.seriesFreqChangeTitle,
        t.seriesFreqChangeBody,
        [
          { text: t.cancel, style: 'cancel' },
          {
            text: t.seriesFreqKeepModified,
            onPress: () => {
              commitBufferedSeriesFields()
              onApplyRecurrenceChange(todo.id, editRecurrence, { keepDetached: true })
              onClose()
            },
          },
          {
            text: t.seriesFreqRecreateAll,
            style: 'destructive',
            onPress: () => {
              commitBufferedSeriesFields()
              onApplyRecurrenceChange(todo.id, editRecurrence, { keepDetached: false })
              onClose()
            },
          },
        ],
        { cancelable: true },
      )
      return // wait for dialog choice
    }

    // R6c — series + subtask shape change (and no recurrence change):
    // ask whether to overwrite all or keep modified.
    if (subtasksChanged && onApplySeriesSubtasks) {
      Alert.alert(
        t.seriesSubtasksChangeTitle,
        t.seriesSubtasksChangeBody,
        [
          { text: t.cancel, style: 'cancel' },
          {
            text: t.seriesSubtasksKeepModified,
            onPress: () => {
              commitBufferedSeriesFields()
              onApplySeriesSubtasks(todo.id, { keepDetached: true })
              onClose()
            },
          },
          {
            text: t.seriesSubtasksOverwriteAll,
            style: 'destructive',
            onPress: () => {
              commitBufferedSeriesFields()
              onApplySeriesSubtasks(todo.id, { keepDetached: false })
              onClose()
            },
          },
        ],
        { cancelable: true },
      )
      return // wait for dialog choice
    }

    if (seriesCommit) {
      commitBufferedSeriesFields()
    } else {
      applyText(editText)
      applyNotes(editNotes)
    }
    onClose()
  }
  function closeWithoutFlush() {
    // "Cancel" path — drop any unblurred text/notes edits and close.
    // Picker-based fields that already auto-saved (priority, date,
    // category, recurrence) cannot be cancelled here; that's a known
    // tradeoff of the auto-save UX.
    onClose()
  }

  function openEditDatePicker() {
    setEditPickerDate(editDueDate ? new Date(`${editDueDate}T00:00:00`) : new Date())
    setPendingEditDueDate(editDueDate)
    setParentEditView('date')
  }


  function handleEditDateChange(_event: DateTimePickerEvent, selected?: Date) {
    if (!selected) return
    setEditPickerDate(selected)
    // Completed by now stores full local datetime. AI-extracted
    // times also flow through this field. The grouping helpers in
    // core (dueDateOnly) strip the time when bucketing.
    setPendingEditDueDate(isoLocalDateTime(selected))
  }

  function openSubDate(s: Subtask) {
    setSubPickerDate(s.dueDate ? new Date(`${s.dueDate}T00:00:00`) : new Date())
    setPendingSubModalDate(s.dueDate ?? '')
    setSubDateForId(s.id)
  }

  function startEditSubtask(s: Subtask) {
    setEditSubText(s.text)
    setEditSubPriority(s.priority ?? 'medium')
    setEditSubDueDate(s.dueDate ?? '')
    setEditSubOriginal({
      text: s.text,
      priority: s.priority ?? 'medium',
      dueDate: s.dueDate ?? '',
    })
    setEditSubPickerView('main')
    setEditingSubtaskId(s.id)
  }

  function openEditSubDate() {
    setEditSubPickerDate(editSubDueDate ? new Date(`${editSubDueDate}T00:00:00`) : new Date())
    setPendingEditSubDueDate(editSubDueDate)
    setEditSubPickerView('date')
  }


  function clearEditSubDate() {
    setPendingEditSubDueDate('')
  }

  function handleEditSubDateChange(_event: DateTimePickerEvent, selected?: Date) {
    if (!selected) return
    setEditSubPickerDate(selected)
    setPendingEditSubDueDate(isoDate(selected))
  }

  // Subtask auto-save helpers — same pattern as the parent.
  function applySubText(next: string) {
    if (!editingSubtaskId) return
    const trimmed = next.trim()
    if (!trimmed) return
    const current = subs.find((s) => s.id === editingSubtaskId)
    if (current && trimmed !== current.text) {
      onUpdateSubtaskText(todo.id, editingSubtaskId, trimmed)
    }
  }
  function applySubPriority(p: Priority) {
    setEditSubPriority(p)
    if (!editingSubtaskId || !onUpdateSubtaskPriority) return
    const current = subs.find((s) => s.id === editingSubtaskId)
    if (current && p !== (current.priority ?? 'medium')) {
      onUpdateSubtaskPriority(todo.id, editingSubtaskId, p)
    }
  }
  function applySubDueDate(d: string) {
    setEditSubDueDate(d)
    if (!editingSubtaskId || !onUpdateSubtaskDueDate) return
    const current = subs.find((s) => s.id === editingSubtaskId)
    if (current && d !== (current.dueDate ?? '')) {
      onUpdateSubtaskDueDate(todo.id, editingSubtaskId, d)
    }
  }
  function leaveSubtaskEdit() {
    // Done — flush any pending text on the way out.
    applySubText(editSubText)
    setEditingSubtaskId(null)
    setEditSubPickerView('main')
    setEditSubOriginal(null)
  }

  function cancelSubtaskEdit() {
    // Cancel — discard the session's changes by writing the entry
    // snapshot back over each field. Unconditional writes (vs.
    // current-vs-orig comparison) because the TextInput's onBlur may
    // have just dispatched an "apply" with the in-progress text and
    // that state isn't visible synchronously here. Empty-text guard
    // matches applySubText: never write an empty string.
    const orig = editSubOriginal
    const subId = editingSubtaskId
    if (orig && subId) {
      if (orig.text.trim()) {
        onUpdateSubtaskText(todo.id, subId, orig.text)
      }
      if (onUpdateSubtaskPriority) {
        onUpdateSubtaskPriority(todo.id, subId, orig.priority)
      }
      if (onUpdateSubtaskDueDate) {
        onUpdateSubtaskDueDate(todo.id, subId, orig.dueDate)
      }
    }
    setEditingSubtaskId(null)
    setEditSubPickerView('main')
    setEditSubOriginal(null)
    // When the sheet was opened DIRECTLY into step edit (long-press a
    // step on Home/Todos), Cancel should dismiss the whole sheet —
    // not silently fall back to the parent edit view, which would
    // look like "nothing happened" to the user. When entered from the
    // parent edit screen (in-sheet navigation), keep the parent
    // sheet open so the back-out is local.
    if (initialSubtaskEditId) {
      onClose()
    }
  }

  const cat = todo.category ? categories.find((c) => c.id === todo.category) : undefined
  const today = todayLocal()
  const parentOverdue = !!todo.dueDate && !todo.done && todo.dueDate < today
  const parentToday = !!todo.dueDate && !todo.done && todo.dueDate === today

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.overlayTouch} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, editingSubtaskId && styles.sheetTight]}>
          {editingSubtaskId ? (
            editSubPickerView === 'priority' ? (
              <InlinePicker
                title={t.composePriorityLabel}
                options={PRIORITY_VALUES.map((v) => ({
                  key: v,
                  label: t.priority[v],
                  color: PRIORITY_COLORS[v],
                  icon: <PriorityDot level={v} size={14} />,
                }))}
                selectedKey={editSubPriority}
                onSelect={(k) => {
                  applySubPriority(k as Priority)
                  setEditSubPickerView('main')
                }}
              />
            ) : editSubPickerView === 'date' ? (
              <>
                <View style={styles.editHeader}>
                  <TouchableOpacity onPress={() => setEditSubPickerView('main')} hitSlop={10} style={styles.headerSideBtn}>
                    <Text style={styles.cancelText}>‹ Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.editHeaderTitle}>{t.edit.completedBy}</Text>
                  <TouchableOpacity onPress={clearEditSubDate} hitSlop={10} style={styles.headerSideBtn}>
                    <Text style={styles.dateClearBtnText}>{t.clear}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.dateWrap}>
                  {pendingEditSubDueDate ? (
                    <Text style={styles.datePendingLabel}>{fullDateLabel(pendingEditSubDueDate)}</Text>
                  ) : (
                    <Text style={[styles.datePendingLabel, styles.datePendingLabelEmpty]}>{t.noDate}</Text>
                  )}
                  <DateTimePicker
                    value={editSubPickerDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
                    onChange={handleEditSubDateChange}
                  />
                </View>
                <View style={styles.dateActions}>
                  <TouchableOpacity
                    style={styles.dateDoneBtnSolo}
                    onPress={() => {
                      applySubDueDate(pendingEditSubDueDate)
                      setEditSubPickerView('main')
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Save"
                  >
                    <Text style={styles.dateDoneBtnText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={styles.editHeader}>
                  {/* Top-left Cancel closes the step editor (changes
                      already auto-save on blur, so Cancel is functionally
                      the same as Done — just a clearer back-out
                      affordance). Center: stacked "Edit Step" title +
                      parent-todo subtitle so the user knows which task's
                      step they're editing. Top-right: "Delete" label
                      replaces the previous trash icon. */}
                  <TouchableOpacity
                    onPress={cancelSubtaskEdit}
                    hitSlop={10}
                    style={styles.headerSideBtn}
                    accessibilityRole="button"
                    accessibilityLabel={t.cancel}
                  >
                    <Text style={styles.cancelText}>{t.cancel}</Text>
                  </TouchableOpacity>
                  <View style={styles.editHeaderCenter}>
                    <Text style={styles.editHeaderTitle}>{t.edit.step}</Text>
                    <Text style={styles.editHeaderSubtitle} numberOfLines={1}>
                      {todo.text}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      const subId = editingSubtaskId
                      if (!subId) return
                      Alert.alert(
                        t.deleteSubtask,
                        'Delete this step?',
                        [
                          { text: t.cancel, style: 'cancel' },
                          {
                            text: t.deleteSubtask,
                            style: 'destructive',
                            onPress: () => {
                              onRemoveSubtask(todo.id, subId)
                              setEditingSubtaskId(null)
                              setEditSubPickerView('main')
                            },
                          },
                        ],
                      )
                    }}
                    hitSlop={10}
                    style={[styles.headerSideBtn, styles.headerSideBtnRight]}
                    accessibilityRole="button"
                    accessibilityLabel={t.deleteSubtask}
                  >
                    <Text style={styles.deleteHeaderText}>{t.deleteTask}</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.editStepBody} showsVerticalScrollIndicator={false}>
                  <View style={styles.editGroupCard}>
                    <TextInput
                      style={styles.editTextInputInCard}
                      value={editSubText}
                      onChangeText={setEditSubText}
                      onBlur={() => applySubText(editSubText)}
                      placeholder={t.addSubtask}
                      placeholderTextColor={theme.gray3}
                      multiline
                      maxLength={1024}
                      textAlignVertical="top"
                    />
                    <View style={styles.editGroupDivider} />
                    <TouchableOpacity
                      style={styles.editFieldRowInGroup}
                      onPress={() => setEditSubPickerView('priority')}
                      activeOpacity={0.6}
                    >
                      <PriorityDot level={editSubPriority} size={14} />
                      <Text style={styles.editFieldLabel}>{t.composePriorityLabel}</Text>
                      <Text style={styles.editFieldValue} numberOfLines={1}>
                        {t.priority[editSubPriority]}
                      </Text>
                      <Text style={styles.editChevron}>›</Text>
                    </TouchableOpacity>
                    <View style={styles.editGroupDivider} />
                    <TouchableOpacity
                      style={styles.editFieldRowInGroup}
                      onPress={openEditSubDate}
                      activeOpacity={0.6}
                    >
                      <CalendarIcon size={18} color={editSubDueDate ? theme.blue : theme.gray3} />
                      <Text style={styles.editFieldLabel}>{t.edit.completedBy}</Text>
                      <Text
                        style={[
                          styles.editFieldValue,
                          !editSubDueDate && styles.editFieldValueMuted,
                        ]}
                        numberOfLines={1}
                      >
                        {editSubDueDate ? absoluteDateLabel(editSubDueDate) : t.noDate}
                      </Text>
                      <Text style={styles.editChevron}>›</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.subEditDoneBtn}
                    onPress={leaveSubtaskEdit}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={t.done}
                  >
                    <Text style={styles.subEditDoneText}>{t.done}</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )
          ) : parentEditView === 'repeat' ? (
            <InlinePicker
              title={t.edit.repeat}
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
                !editRecurrence
                  ? 'none'
                  : isCustomRecurrence(editRecurrence)
                    ? 'custom'
                    : editRecurrence.freq
              }
              onSelect={(k) => {
                if (k === 'custom') {
                  setParentEditView('customRepeat')
                } else if (k === 'none') {
                  applyRecurrence(undefined)
                  setParentEditView('main')
                } else {
                  applyRecurrence({ freq: k as RecurrenceFreq })
                  setParentEditView('main')
                }
              }}
              // No back button — every option commits and returns to
              // main, so a back affordance reads as redundant.
            />
          ) : parentEditView === 'customRepeat' ? (
            <CustomRecurrenceForm
              initial={editRecurrence}
              onDone={(rec) => {
                applyRecurrence(rec)
                setParentEditView('main')
              }}
              onBack={() => setParentEditView('repeat')}
            />
          ) : parentEditView === 'date' ? (
            <>
              <View style={styles.editHeader}>
                <TouchableOpacity onPress={() => setParentEditView('main')} hitSlop={10} style={styles.headerSideBtn}>
                  <Text style={styles.cancelText}>‹ Back</Text>
                </TouchableOpacity>
                <Text style={styles.editHeaderTitle}>Completed by</Text>
                <TouchableOpacity
                  onPress={() => setPendingEditDueDate('')}
                  hitSlop={10}
                  style={styles.headerSideBtn}
                >
                  <Text style={styles.dateClearBtnText}>{t.clear}</Text>
                </TouchableOpacity>
              </View>
              {/* End-of-period due-date presets (Clear = unspecified). */}
              <View style={styles.datePresetRow}>
                {[
                  { label: 'Today', value: todayLocal() },
                  { label: 'This week', value: endOfWeekLocal() },
                  { label: 'This month', value: endOfMonthLocal() },
                  { label: 'This year', value: endOfYearLocal() },
                ].map((p) => {
                  const active = dueDateOnly(pendingEditDueDate) === p.value
                  return (
                    <TouchableOpacity
                      key={p.label}
                      style={[styles.datePresetChip, active && styles.datePresetChipActive]}
                      onPress={() => {
                        setPendingEditDueDate(p.value)
                        setEditPickerDate(new Date(`${p.value}T00:00:00`))
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Due ${p.label}`}
                    >
                      <Text style={[styles.datePresetChipText, active && styles.datePresetChipTextActive]}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
              <View style={styles.dateWrap}>
                {pendingEditDueDate ? (
                  <Text style={styles.datePendingLabel}>{fullDateLabel(pendingEditDueDate)}</Text>
                ) : (
                  <Text style={[styles.datePendingLabel, styles.datePendingLabelEmpty]}>{t.noDate}</Text>
                )}
                <DateTimePicker
                  value={editPickerDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
                  onChange={handleEditDateChange}
                />
              </View>
              <View style={styles.dateActions}>
                <TouchableOpacity
                  style={styles.dateDoneBtnSolo}
                  onPress={() => {
                    applyDueDate(pendingEditDueDate)
                    setParentEditView('main')
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Save"
                >
                  <Text style={styles.dateDoneBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : parentEditView === 'remindAt' ? (
            <ReminderSheet
              initial={editReminders}
              dueDate={editDueDate}
              recurs={!!editRecurrence}
              onCancel={() => setParentEditView('main')}
              onSave={(next) => {
                void applyReminders(next).then(() => setParentEditView('main'))
              }}
            />
          ) : parentEditView === 'recurEndDate' && editRecurrence ? (
            <>
              <View style={styles.editHeader}>
                <TouchableOpacity onPress={() => setParentEditView('main')} hitSlop={10} style={styles.headerSideBtn}>
                  <Text style={styles.cancelText}>‹ Back</Text>
                </TouchableOpacity>
                <Text style={styles.editHeaderTitle}>{t.edit.repeatEnds}</Text>
                <TouchableOpacity
                  onPress={() => setPendingRecurEndDate('')}
                  hitSlop={10}
                  style={styles.headerSideBtn}
                >
                  <Text style={styles.dateClearBtnText}>{t.clear}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.dateWrap}>
                {pendingRecurEndDate ? (
                  <Text style={styles.datePendingLabel}>{fullDateLabel(pendingRecurEndDate)}</Text>
                ) : (
                  <Text style={[styles.datePendingLabel, styles.datePendingLabelEmpty]}>{t.edit.noEnd}</Text>
                )}
                <DateTimePicker
                  value={endDatePickerDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
                  minimumDate={new Date()}
                  onChange={(_e: DateTimePickerEvent, d?: Date) => {
                    if (!d) return
                    setEndDatePickerDate(d)
                    setPendingRecurEndDate(isoDate(d))
                  }}
                />
              </View>
              <View style={styles.dateActions}>
                <TouchableOpacity
                  style={styles.dateDoneBtnSolo}
                  onPress={() => {
                    if (pendingRecurEndDate) {
                      applyRecurrence({ ...editRecurrence, endDate: pendingRecurEndDate })
                    } else {
                      const { endDate: _drop, ...rest } = editRecurrence
                      applyRecurrence(rest)
                    }
                    setParentEditView('main')
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t.done}
                >
                  <Text style={styles.dateDoneBtnText}>{t.done}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
          <>
          <View style={styles.editHeader}>
            <TouchableOpacity onPress={closeWithoutFlush} hitSlop={10} style={styles.headerSideBtn}>
              <Text style={styles.cancelHeaderText}>{t.cancel}</Text>
            </TouchableOpacity>
            <Text style={styles.editHeaderTitle}>{t.edit.toDo}</Text>
            {/* All commit/destructive actions live at the bottom now; this
                spacer keeps the title centered against the Cancel button. */}
            <View style={styles.headerSideBtn} />
          </View>

          {/* R6a — Edit-scope toggle. Only renders for series rows.
              "This only" auto-saves field changes immediately and
              detaches the row from the series on first edit.
              "Edit series" buffers text/notes/priority/category
              locally until Save, which then propagates to every
              future sibling. */}
          {isSeriesRow && (
            <View style={styles.editModeWrap}>
              <View style={styles.editModeSegmented}>
                <TouchableOpacity
                  style={[
                    styles.editModeSegment,
                    editMode === 'this' && styles.editModeSegmentActive,
                  ]}
                  onPress={() => setEditMode('this')}
                  accessibilityRole="button"
                  accessibilityState={{ selected: editMode === 'this' }}
                  accessibilityLabel={t.editThisOnly}
                >
                  <Text
                    style={[
                      styles.editModeSegmentText,
                      editMode === 'this' && styles.editModeSegmentTextActive,
                    ]}
                  >
                    {t.editThisOnly}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.editModeSegment,
                    editMode === 'series' && styles.editModeSegmentActive,
                  ]}
                  onPress={() => setEditMode('series')}
                  accessibilityRole="button"
                  accessibilityState={{ selected: editMode === 'series' }}
                  accessibilityLabel={t.editSeries}
                >
                  <Text
                    style={[
                      styles.editModeSegmentText,
                      editMode === 'series' && styles.editModeSegmentTextActive,
                    ]}
                  >
                    {t.editSeries}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <ScrollView
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.editBody}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.editGroupCard}>
                <TextInput
                  style={styles.editTextInputInCard}
                  value={editText}
                  onChangeText={setEditText}
                  onBlur={() => applyText(editText)}
                  placeholder={t.addPlaceholder}
                  placeholderTextColor={theme.gray3}
                  multiline
                  maxLength={4096}
                  textAlignVertical="top"
                />
                {onUpdateNotes && (
                  <>
                    <View style={styles.editGroupDivider} />
                    {/* Notes inline below the title — matches the
                        ComposeSheet (Add To-do) arrangement so the
                        "what & why" sit together at the top of the
                        sheet. Standalone notes card lower in the
                        layout was removed. */}
                    <TextInput
                      style={styles.notesInputInGroup}
                      value={editNotes}
                      onChangeText={setEditNotes}
                      onBlur={() => applyNotes(editNotes)}
                      placeholder={t.notes.placeholder}
                      placeholderTextColor={theme.gray3}
                      multiline
                      maxLength={8192}
                      textAlignVertical="top"
                      accessibilityLabel="Notes — anything that helps you externalize the thinking around this task"
                    />
                  </>
                )}
                {/* Mochi-thinking status row — surfaced inside the
                    text card so the user sees the AI is working in
                    the same area where they're typing. Same pattern
                    as the Add to-do (ComposeSheet) accessory row. */}
                {(fieldAi.thinking || ai.thinking) && (
                  <View style={styles.inputAccessoryRow}>
                    <MochiThinking label="Reading your to-do…" />
                  </View>
                )}
                <View style={styles.editGroupDivider} />
                <TodoFieldSuggestPills
                  suggestions={fieldAi.suggestions}
                  thinking={fieldAi.thinking}
                  categories={categories}
                  currentCategory={editCategory ?? ''}
                  currentPriority={editPriority}
                  currentDueDate={editDueDate}
                  currentRecurrenceFreq={editRecurrence?.freq}
                  currentRecurrenceEndDate={editRecurrence?.endDate}
                  currentRecurrenceByWeekday={editRecurrence?.byWeekday}
                  currentReminder={editReminder}
                  onApplyCategory={(id) => {
                    applyCategory(id)
                    Haptics.selectionAsync().catch(() => {})
                  }}
                  onApplyPriority={(p) => {
                    applyPriority(p)
                    Haptics.selectionAsync().catch(() => {})
                  }}
                  onApplyDueDate={(iso) => {
                    applyDueDate(iso)
                    Haptics.selectionAsync().catch(() => {})
                  }}
                  onApplyRecurrence={(rec) => {
                    applyRecurrence(rec)
                    Haptics.selectionAsync().catch(() => {})
                  }}
                  onApplyReminder={onUpdateReminder ? (rem) => {
                    void applyReminder(rem)
                    Haptics.selectionAsync().catch(() => {})
                  } : undefined}
                  onDismissField={fieldAi.dismissField}
                />
                <TouchableOpacity
                  style={styles.editFieldRowInGroup}
                  onPress={() => setEditCategoryOpen(true)}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={`Category, ${editActiveCat ? categoryLabel(editActiveCat, t) : 'none'}. Tap to change.`}
                >
                  {editActiveCat && <CategoryIcon icon={editActiveCat.icon} size={18} color={editActiveCat.color} />}
                  <Text style={styles.editFieldLabel}>{t.composeCategoryLabel}</Text>
                  <Text style={styles.editFieldValue} numberOfLines={1}>
                    {editActiveCat ? categoryLabel(editActiveCat, t) : ''}
                  </Text>
                  <Text style={styles.editChevron}>›</Text>
                </TouchableOpacity>
                <View style={styles.editGroupDivider} />
                <TouchableOpacity
                  style={styles.editFieldRowInGroup}
                  onPress={() => setEditPriorityOpen(true)}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={`Priority, ${t.priority[editPriority]}. Tap to change.`}
                >
                  <PriorityDot level={editPriority} size={14} />
                  <Text style={styles.editFieldLabel}>{t.composePriorityLabel}</Text>
                  <Text style={styles.editFieldValue} numberOfLines={1}>
                    {t.priority[editPriority]}
                  </Text>
                  <Text style={styles.editChevron}>›</Text>
                </TouchableOpacity>
                <View style={styles.editGroupDivider} />
                <TouchableOpacity
                  style={styles.editFieldRowInGroup}
                  onPress={openEditDatePicker}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={`Completed by, ${editDueDate ? absoluteDateLabel(editDueDate) : t.noDate}. Tap to change.`}
                >
                  <CalendarIcon size={18} color={editDueDate ? theme.blue : theme.gray3} />
                  <Text style={styles.editFieldLabel}>{t.edit.completedBy}</Text>
                  <Text
                    style={[
                      styles.editFieldValue,
                      !editDueDate && styles.editFieldValueMuted,
                    ]}
                    numberOfLines={1}
                  >
                    {editDueDate ? absoluteDateLabel(editDueDate) : t.noDate}
                  </Text>
                  <Text style={styles.editChevron}>›</Text>
                </TouchableOpacity>
                {/* Recurrence is a SERIES-level property — editing a single
                    instance ("Edit this only") can't change the repeat rule,
                    so Repeat + Repeat-ends are hidden in that mode. They show
                    for one-off rows and in "Edit series" mode. */}
                {/* Repeat — shown for all rows; disabled (not hidden) in
                    "Edit this only" so the recurrence is visible but can't
                    be changed for a single occurrence. */}
                <View style={styles.editGroupDivider} />
                <TouchableOpacity
                  style={[
                    styles.editFieldRowInGroup,
                    repeatLocked && styles.editFieldRowDisabled,
                  ]}
                  onPress={() => setParentEditView('repeat')}
                  disabled={repeatLocked}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: repeatLocked }}
                  accessibilityLabel={`Repeat, ${recurrenceLabel(editRecurrence)}. Tap to change.`}
                >
                  <Repeat size={18} color={editRecurrence ? theme.blue : theme.gray3} strokeWidth={2} />
                  <Text style={styles.editFieldLabel}>{t.edit.repeat}</Text>
                  <Text
                    style={[
                      styles.editFieldValue,
                      !editRecurrence && styles.editFieldValueMuted,
                    ]}
                    numberOfLines={1}
                  >
                    {editRecurrence
                      ? (editRecurrence.byWeekday && editRecurrence.byWeekday.length > 0
                          ? formatRecurrence(editRecurrence)
                          : RECURRENCE_LABELS[editRecurrence.freq])
                      : RECURRENCE_LABELS.none}
                  </Text>
                  <Text style={styles.editChevron}>›</Text>
                </TouchableOpacity>
                {(onUpdateReminders || onUpdateReminder) && (
                  <>
                    <View style={styles.editGroupDivider} />
                    <TouchableOpacity
                      style={styles.editFieldRowInGroup}
                      onPress={() => setParentEditView('remindAt')}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`${t.remindMe}, ${reminderSummary(editReminders, t)}. Tap to change.`}
                    >
                      <Bell size={18} color={editReminders.length > 0 ? theme.blue : theme.gray3} strokeWidth={2} />
                      <Text style={styles.editFieldLabel}>{t.remindMe}</Text>
                      <Text
                        style={[
                          styles.editFieldValue,
                          editReminders.length === 0 && styles.editFieldValueMuted,
                        ]}
                        numberOfLines={1}
                      >
                        {reminderSummary(editReminders, t)}
                      </Text>
                      <Text style={styles.editChevron}>›</Text>
                    </TouchableOpacity>
                  </>
                )}
                {editRecurrence && (
                  <>
                    <View style={styles.editGroupDivider} />
                    <TouchableOpacity
                      style={[
                        styles.editFieldRowInGroup,
                        repeatLocked && styles.editFieldRowDisabled,
                      ]}
                      onPress={() => {
                        setEndDatePickerDate(
                          editRecurrence.endDate
                            ? new Date(`${editRecurrence.endDate}T00:00:00`)
                            : new Date(),
                        )
                        setPendingRecurEndDate(editRecurrence.endDate ?? '')
                        setParentEditView('recurEndDate')
                      }}
                      disabled={repeatLocked}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: repeatLocked }}
                      accessibilityLabel={`Repeat ends, ${editRecurrence.endDate ? absoluteDateLabel(editRecurrence.endDate) : 'never'}. Tap to change.`}
                    >
                      <CalendarIcon size={18} color={editRecurrence.endDate ? theme.blue : theme.gray3} />
                      <Text style={styles.editFieldLabel}>{t.edit.repeatEnds}</Text>
                      <Text
                        style={[
                          styles.editFieldValue,
                          !editRecurrence.endDate && styles.editFieldValueMuted,
                        ]}
                        numberOfLines={1}
                      >
                        {editRecurrence.endDate ? absoluteDateLabel(editRecurrence.endDate) : t.edit.noEnd}
                      </Text>
                      <Text style={styles.editChevron}>›</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* Notes moved into the title group card above; the
                  standalone Notes section here was removed so the
                  layout mirrors the Add To-do sheet. */}

              <View style={styles.subtaskSectionRow}>
                <Text style={styles.subtaskSectionHeader}>{t.steps.header}</Text>
                {agentEnabled && subs.length === 0 && !ai.suggestions && (
                  <SuggestStepsTrigger
                    thinking={ai.thinking}
                    error={ai.error}
                    onClick={ai.request}
                  />
                )}
                {onClearSubtasks && subs.length > 0 && (
                  <TouchableOpacity
                    style={styles.clearStepsLink}
                    onPress={() => {
                      Alert.alert(
                        t.clearAllSteps,
                        t.clearAllStepsConfirm,
                        [
                          { text: t.cancel, style: 'cancel' },
                          {
                            text: t.clearAllSteps,
                            style: 'destructive',
                            onPress: () => onClearSubtasks(todo.id),
                          },
                        ],
                      )
                    }}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={t.clearAllSteps}
                  >
                    <Text style={styles.clearStepsLinkText}>{t.clearAllSteps}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {subs.length === 0 ? (
                <EmptyState
                  variant="compact"
                  title={t.steps.noneYet}
                  hint={t.steps.noneHint}
                />
              ) : (
                <View style={styles.editSubtasks}>
                  {sortedSubs(subs).map((s) => (
                    <SubtaskCard
                      key={s.id}
                      parentId={todo.id}
                      subtask={s}
                      styles={styles}
                      theme={theme}
                      onToggle={onToggleSubtask}
                      onUpdateText={onUpdateSubtaskText}
                      onRemove={onRemoveSubtask}
                      onOpenPriority={onUpdateSubtaskPriority ? () => setSubPriorityForId(s.id) : undefined}
                      onOpenDate={onUpdateSubtaskDueDate ? () => openSubDate(s) : undefined}
                      onTap={() => startEditSubtask(s)}
                    />
                  ))}
                </View>
              )}

              {ai.suggestions && (
                <SuggestStepsReview
                  suggestions={ai.suggestions}
                  parentDueDate={todo.dueDate}
                  onAddSelected={(picks) => {
                    for (const p of picks) {
                      onAddSubtask(todo.id, p.text, todo.priority, p.dueDate)
                    }
                    ai.reset()
                  }}
                  onCancel={ai.reset}
                />
              )}

              <View style={[styles.subtaskActionsRow, styles.subtaskActionsRowCentered]}>
                <TouchableOpacity
                  style={styles.addSubtaskLink}
                  onPress={() => setAddSubtaskOpen(true)}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={t.addSubtask}
                >
                  <PlusIcon size={16} color={theme.blue} />
                  <Text style={styles.addSubtaskLinkText}>{t.addSubtask}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Sticky footer — actions pinned to the bottom; the fields +
                STEPS above scroll independently. */}
            <View style={styles.stickyFooter}>
              {/* Primary action — Save. */}
              <TouchableOpacity
                style={styles.primarySaveBtn}
                onPress={closeAndFlushText}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t.save}
              >
                <Text style={styles.primarySaveBtnText}>{t.save}</Text>
              </TouchableOpacity>

              {/* Action row — Delete · Skip · Mark done. In "Edit series"
                  mode these apply to this + all future occurrences
                  ("Delete series" / "Skip all" / "Mark all done"). */}
              <View style={styles.bottomActionRow}>
                {(seriesScope ? !!onPermanentDeleteSeries : !!onPermanentDelete) ? (
                  <TouchableOpacity
                    style={styles.bottomActionButton}
                    onPress={() => {
                      Alert.alert(
                        seriesScope ? 'Delete series?' : t.deletePermanently,
                        seriesScope
                          ? 'Permanently delete this and all future to-dos in this series. Past instances are kept.'
                          : t.deletePermanentlyConfirm(todo.text),
                        [
                          { text: t.cancel, style: 'cancel' },
                          {
                            text: seriesScope ? 'Delete series' : t.deletePermanently,
                            style: 'destructive',
                            onPress: () => {
                              if (seriesScope) onPermanentDeleteSeries!(todo.id)
                              else onPermanentDelete!(todo.id)
                              onClose()
                            },
                          },
                        ],
                      )
                    }}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={seriesScope ? 'Delete series' : t.deletePermanently}
                  >
                    <Text style={styles.deleteActionText}>
                      {seriesScope ? 'Delete series' : t.deleteTask}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View />
                )}

                {onSkip ? (
                  <TouchableOpacity
                    style={styles.bottomActionButton}
                    onPress={() => {
                      if (seriesScope && onSkipSeries) onSkipSeries(todo.id)
                      else onSkip(todo.id)
                      onClose()
                    }}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={seriesScope ? 'Skip all' : 'Skip'}
                  >
                    <Text style={styles.skipActionText}>
                      {seriesScope ? 'Skip all' : 'Skip'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View />
                )}

                <TouchableOpacity
                  style={styles.bottomActionButton}
                  onPress={() => {
                    if (seriesScope && onMoveSeriesFutureToTrash) {
                      onMoveSeriesFutureToTrash(todo.id)
                    } else {
                      onMoveToTrash(todo.id)
                    }
                    onClose()
                  }}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={seriesScope ? 'Mark all done' : t.markDone}
                >
                  <Text style={styles.markDoneActionText}>
                    {seriesScope ? 'Mark all done' : t.markDone}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
          )}

          <AddSubtaskSheet
            visible={addSubtaskOpen}
            defaultDueDate={todo.dueDate ?? ''}
            onAdd={(text, priority, dueDate) => {
              onAddSubtask(todo.id, text, priority, dueDate)
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
            }}
            onClose={() => setAddSubtaskOpen(false)}
          />

          {/* Parent task category picker (edit mode) */}
          <PickerModal
            visible={editCategoryOpen}
            selectedKey={editCategory ?? ''}
            onSelect={(k) => applyCategory(k)}
            onClose={() => setEditCategoryOpen(false)}
            options={categories.map((c) => ({
              key: c.id,
              label: categoryLabel(c, t),
              color: c.color,
              icon: <CategoryIcon icon={c.icon} size={16} color={c.color} />,
            }))}
          />

          {/* Parent task priority picker (edit mode) */}
          <PickerModal
            visible={editPriorityOpen}
            selectedKey={editPriority}
            onSelect={(k) => applyPriority(k as Priority)}
            onClose={() => setEditPriorityOpen(false)}
            options={PRIORITY_VALUES.map((v) => ({
              key: v,
              label: t.priority[v],
              color: PRIORITY_COLORS[v],
              icon: <PriorityDot level={v} size={12} />,
            }))}
          />

          {/* Parent task date picker now lives as an in-sheet sub-view
              above (parentEditView === 'date'). No Modal-on-Modal. */}

          {/* Per-subtask priority picker */}
          {onUpdateSubtaskPriority && (
            <PickerModal
              visible={subPriorityForId !== null}
              selectedKey={subPriorityForId
                ? (subs.find((s) => s.id === subPriorityForId)?.priority ?? 'medium')
                : 'medium'}
              onSelect={(k) => {
                if (subPriorityForId) onUpdateSubtaskPriority(todo.id, subPriorityForId, k as Priority)
              }}
              onClose={() => setSubPriorityForId(null)}
              options={PRIORITY_VALUES.map((v) => ({
                key: v,
                label: t.priority[v],
                color: PRIORITY_COLORS[v],
                icon: <PriorityDot level={v} size={12} />,
              }))}
            />
          )}

          {/* Per-subtask date picker */}
          {onUpdateSubtaskDueDate && subDateForId !== null && Platform.OS === 'ios' && (
            <Modal
              visible
              transparent
              animationType="fade"
              onRequestClose={() => setSubDateForId(null)}
            >
              <TouchableOpacity
                style={styles.dateOverlay}
                onPress={() => setSubDateForId(null)}
                activeOpacity={1}
              >
                <View style={styles.dateSheet} onStartShouldSetResponder={() => true}>
                  {pendingSubModalDate ? (
                    <Text style={styles.datePendingLabel}>{fullDateLabel(pendingSubModalDate)}</Text>
                  ) : (
                    <Text style={[styles.datePendingLabel, styles.datePendingLabelEmpty]}>{t.noDate}</Text>
                  )}
                  <DateTimePicker
                    value={subPickerDate}
                    mode="date"
                    display="inline"
                    themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
                    onChange={(e, d) => {
                      if (e.type === 'set' && d) {
                        setSubPickerDate(d)
                        setPendingSubModalDate(isoDate(d))
                      }
                    }}
                  />
                  <View style={styles.dateBtnRow}>
                    <TouchableOpacity onPress={() => setPendingSubModalDate('')}>
                      <Text style={styles.dateClear}>{t.clear}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        if (subDateForId) onUpdateSubtaskDueDate(todo.id, subDateForId, pendingSubModalDate)
                        setSubDateForId(null)
                      }}
                    >
                      <Text style={styles.dateDone}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            </Modal>
          )}
          {onUpdateSubtaskDueDate && subDateForId !== null && Platform.OS === 'android' && (
            <DateTimePicker
              value={subPickerDate}
              mode="date"
              display="default"
              onChange={(e, d) => {
                if (e.type === 'set' && d && subDateForId) {
                  onUpdateSubtaskDueDate(todo.id, subDateForId, isoDate(d))
                }
                setSubDateForId(null)
              }}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// (dueDateAsUntil + ReminderSubView retired — the multi-reminder
// picker now lives in ../ReminderSheet/index.tsx.)

function SubtaskCard({
  parentId, subtask, styles, theme,
  onToggle, onUpdateText, onRemove, onOpenPriority, onOpenDate, onTap,
}: {
  parentId: string
  subtask: Subtask
  styles: ReturnType<typeof makeStyles>
  theme: ThemeColors
  onToggle: (id: string, subId: string) => void
  onUpdateText: (id: string, subId: string, text: string) => void
  onRemove: (id: string, subId: string) => void
  onOpenPriority?: () => void
  onOpenDate?: () => void
  /** If provided, tapping the row's text area opens this callback instead of inline edit. */
  onTap?: () => void
}) {
  const { t } = useLang()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(subtask.text)
  const inputRef = useRef<TextInput>(null)

  const priority: Priority = subtask.priority ?? 'medium'
  const dueDate = subtask.dueDate ?? ''
  const today = todayLocal()
  const overdue = !!dueDate && !subtask.done && dueDate < today
  const isToday = !!dueDate && !subtask.done && dueDate === today

  function startEdit() {
    setText(subtask.text)
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function commit() {
    const trimmed = text.trim()
    if (trimmed && trimmed !== subtask.text) {
      onUpdateText(parentId, subtask.id, trimmed)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } else setText(subtask.text)
    setEditing(false)
  }

  return (
    <View style={styles.subCard}>
      <TouchableOpacity
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
          onToggle(parentId, subtask.id)
        }}
        hitSlop={10}
        style={[styles.subCardCheckbox, subtask.done && styles.subCardCheckboxDone]}
      >
        {subtask.done && <Text style={styles.subCardCheckmark}>✓</Text>}
      </TouchableOpacity>
      {editing ? (
        <TextInput
          ref={inputRef}
          style={styles.subCardTextEdit}
          value={text}
          onChangeText={setText}
          onBlur={commit}
          onSubmitEditing={commit}
          returnKeyType="done"
          maxLength={500}
        />
      ) : (
        <TouchableOpacity
          style={styles.subCardTapArea}
          onPress={onTap ?? startEdit}
          activeOpacity={0.6}
        >
          <Text
            style={[styles.subCardText, subtask.done && styles.subCardTextDone]}
            numberOfLines={1}
          >
            {subtask.text}
          </Text>
          <PriorityDot level={priority} size={11} />
          <Text style={[
            styles.subDateChipText,
            overdue
              ? styles.subDateChipOverdue
              : isToday
                ? styles.subDateChipToday
                : !dueDate
                  ? styles.subDateChipMuted
                  : styles.subDateChipPlain,
          ]}>
            {dueDate ? formatDisplayDate(dueDate, t.locale) : t.noDate}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

