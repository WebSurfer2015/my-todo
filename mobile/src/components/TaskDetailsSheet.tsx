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
import { Category, Priority, Subtask, Todo, Recurrence, RecurrenceFreq, RECURRENCE_FREQS, PRIORITY_VALUES, PRIORITY_COLORS } from '../types'

const RECURRENCE_LABELS: Record<'none' | RecurrenceFreq, string> = {
  none: 'Never',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { CategoryDef, categoryLabel } from '../categories'
import { formatDisplayDate, formatRecurrence, fullDateLabel, isoDate, todayLocal } from '../utils'
import { sortedSubs } from '../../../core/src/derive'
import { useTheme, ThemeColors } from '../theme'
import { useLang } from '../LangContext'
import PriorityDot from './PriorityDot'
import CategoryIcon from './CategoryIcon'
import PickerModal from './PickerModal'
import AddSubtaskSheet from './AddSubtaskSheet'
import EmptyState from './EmptyState'
import InlinePicker from './InlinePicker'
import {
  useSuggestSteps,
  SuggestStepsTrigger,
  SuggestStepsReview,
} from './SuggestStepsPanel'
import { useTodoFieldSuggestions, TodoFieldSuggestPills } from './TodoFieldSuggestPills'
import { ensurePermission } from '../notifications'
import CustomRecurrenceForm from './CustomRecurrenceForm'

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

/** Reasonable initial picker date when the user opens the sub-view
 * with no current reminder set: morning of the dueDate (9am), or
 * 1h from now if the todo has no dueDate. */
function defaultRemindDate(dueDate: string): Date {
  const dateOnly = dueDate.includes('T') ? dueDate.slice(0, dueDate.indexOf('T')) : dueDate
  if (dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    const d = new Date(`${dateOnly}T09:00:00`)
    if (d.valueOf() > Date.now()) return d
  }
  return new Date(Date.now() + 60 * 60 * 1000)
}

/** Interval choices surfaced in the Reminder sub-view. None disables
 * recurrence; any other value enables it and reveals the Until row. */
const REMIND_INTERVAL_CHOICES: Array<{ minutes: number | undefined; label: string }> = [
  { minutes: undefined, label: 'Once' },
  { minutes: 15, label: '15m' },
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '1h' },
  { minutes: 120, label: '2h' },
  { minutes: 240, label: '4h' },
  { minutes: 360, label: '6h' },
  { minutes: 720, label: '12h' },
]

function XIcon({ size = 18, color = '#999' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 6L6 18" />
      <Path d="M6 6l12 12" />
    </Svg>
  )
}

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
  onMoveToTrash: (id: string) => void
  /** Optional — used by the "Delete to-do" action to permanently delete a
   * done item (skipping the trash step). Open items still go to trash. */
  onPermanentDelete?: (id: string) => void
  /** Optional — when provided, "Delete to-do" on a recurring instance with
   * a seriesId offers a "Delete this and all future" option. */
  onMoveSeriesFutureToTrash?: (id: string) => void
  /** Optional — copies text/priority/category from this instance to every
   * future non-trashed sibling in the same series. */
  onApplySeriesFutureEdits?: (
    id: string,
    fields: { text?: string; priority?: Priority; category?: Category | undefined },
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
  onUpdatePriority, onUpdateDueDate, onUpdateCategory, onUpdateRecurrence, onUpdateReminder, onMoveToTrash, onPermanentDelete, onMoveSeriesFutureToTrash, onApplySeriesFutureEdits,
  onAddSubtask, onToggleSubtask, onUpdateSubtaskText,
  onUpdateSubtaskPriority, onUpdateSubtaskDueDate, onRemoveSubtask, onClearSubtasks,
  agentEnabled,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const subs = todo.subtasks ?? []
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
  const [remindPickerDate, setRemindPickerDate] = useState<Date>(new Date())
  // The 'at' working value while the sub-view is open. Empty means
  // "no reminder" (Clear). Interval/until live in their own pending
  // pieces below.
  const [pendingRemindAt, setPendingRemindAt] = useState<string>('')
  const [pendingRemindInterval, setPendingRemindInterval] = useState<number | undefined>(undefined)
  const [pendingRemindUntil, setPendingRemindUntil] = useState<string>('')
  // Which inner field of the Remind sub-view is being edited — 'main'
  // (the picker for `at`), 'until' (picker for the cutoff datetime).
  const [remindSubView, setRemindSubView] = useState<'main' | 'until'>('main')
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

  // Auto-save helpers: every picker change calls the prop immediately
  // (no Save button needed). Text saves on blur — calling on every
  // keystroke would cause one Firestore write per character.
  function applyText(next: string) {
    const trimmed = next.trim()
    if (trimmed && trimmed !== todo.text) onUpdateText(todo.id, trimmed)
  }
  function applyNotes(next: string) {
    // Notes are intentionally not trimmed — leading whitespace might be
    // meaningful (e.g., a list with indentation). Empty/unchanged is a
    // no-op so we don't churn updatedAt for nothing.
    if (!onUpdateNotes) return
    if (next === (todo.notes ?? '')) return
    onUpdateNotes(todo.id, next)
  }
  function applyPriority(p: Priority) {
    setEditPriority(p)
    if (p !== todo.priority) onUpdatePriority(todo.id, p)
  }
  function applyCategory(cId: string) {
    setEditCategory(cId)
    if (cId !== todo.category) onUpdateCategory(todo.id, cId)
  }
  function applyDueDate(d: string) {
    setEditDueDate(d)
    if (d !== (todo.dueDate ?? '')) onUpdateDueDate(todo.id, d)
  }
  function applyRecurrence(r: Recurrence | undefined) {
    setEditRecurrence(r)
    if (JSON.stringify(r ?? null) !== JSON.stringify(todo.recurrence ?? null)) {
      onUpdateRecurrence(todo.id, r)
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
  function closeAndFlushText() {
    // "Save" path — final flush in case the user closed without
    // blurring an input. Other fields (priority, date, category,
    // recurrence) auto-save on pick, so they need no flush here.
    applyText(editText)
    applyNotes(editNotes)
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
                <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.editStepBody}>
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
              <View style={styles.dateWrap}>
                {pendingEditDueDate ? (
                  <Text style={styles.datePendingLabel}>{fullDateLabel(pendingEditDueDate)}</Text>
                ) : (
                  <Text style={[styles.datePendingLabel, styles.datePendingLabelEmpty]}>{t.noDate}</Text>
                )}
                <DateTimePicker
                  value={editPickerDate}
                  mode="datetime"
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
            <ReminderSubView
              styles={styles}
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
              dueDate={editDueDate}
              onCancel={() => setParentEditView('main')}
              onSave={() => {
                // Build reminder from pending pieces. Empty at → clear.
                let next: Todo["reminder"] | undefined
                if (pendingRemindAt) {
                  next = { at: pendingRemindAt }
                  if (pendingRemindInterval) {
                    next.intervalMinutes = pendingRemindInterval
                    // Default `until` to dueDate (with time when set,
                    // else end-of-day) when the user enables an
                    // interval without picking an explicit cutoff.
                    const fallbackUntil = pendingRemindUntil || dueDateAsUntil(editDueDate)
                    if (fallbackUntil) next.until = fallbackUntil
                  }
                }
                void applyReminder(next).then(() => setParentEditView('main'))
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
            <TouchableOpacity onPress={closeAndFlushText} hitSlop={10} style={styles.headerSideBtn}>
              <Text style={styles.saveHeaderText}>{t.save}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.editBody}
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
                <View style={styles.editGroupDivider} />
                <TouchableOpacity
                  style={styles.editFieldRowInGroup}
                  onPress={() => setParentEditView('repeat')}
                  activeOpacity={0.6}
                  accessibilityRole="button"
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
                {onUpdateReminder && (
                  <>
                    <View style={styles.editGroupDivider} />
                    <TouchableOpacity
                      style={styles.editFieldRowInGroup}
                      onPress={() => {
                        setRemindPickerDate(
                          editReminder?.at
                            ? new Date(editReminder.at)
                            : defaultRemindDate(editDueDate),
                        )
                        setPendingRemindAt(editReminder?.at ?? '')
                        setPendingRemindInterval(editReminder?.intervalMinutes)
                        setPendingRemindUntil(editReminder?.until ?? '')
                        setRemindSubView('main')
                        setParentEditView('remindAt')
                      }}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`Remind me, ${editReminder ? formatReminder(editReminder) : t.remindNone}. Tap to change.`}
                    >
                      <Bell size={18} color={editReminder ? theme.blue : theme.gray3} strokeWidth={2} />
                      <Text style={styles.editFieldLabel}>{t.remindMe}</Text>
                      <Text
                        style={[
                          styles.editFieldValue,
                          !editReminder && styles.editFieldValueMuted,
                        ]}
                        numberOfLines={1}
                      >
                        {editReminder ? formatReminder(editReminder) : t.remindNone}
                      </Text>
                      <Text style={styles.editChevron}>›</Text>
                    </TouchableOpacity>
                  </>
                )}
                {editRecurrence && (
                  <>
                    <View style={styles.editGroupDivider} />
                    <TouchableOpacity
                      style={styles.editFieldRowInGroup}
                      onPress={() => {
                        setEndDatePickerDate(
                          editRecurrence.endDate
                            ? new Date(`${editRecurrence.endDate}T00:00:00`)
                            : new Date(),
                        )
                        setPendingRecurEndDate(editRecurrence.endDate ?? '')
                        setParentEditView('recurEndDate')
                      }}
                      activeOpacity={0.6}
                      accessibilityRole="button"
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

              {todo.seriesId && onApplySeriesFutureEdits && (
                <TouchableOpacity
                  style={styles.seriesAction}
                  onPress={() => {
                    Alert.alert(
                      'Apply to all future?',
                      'Copy this to-do\'s text, priority, and category to every future to-do in this recurring series. Past instances are not changed.',
                      [
                        { text: t.cancel, style: 'cancel' },
                        {
                          text: 'Apply to all future',
                          onPress: () => {
                            onApplySeriesFutureEdits!(todo.id, {
                              text: editText.trim() || todo.text,
                              priority: editPriority,
                              category: editCategory,
                            })
                          },
                        },
                      ],
                    )
                  }}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={t.series.applyToFutureA11y}
                >
                  <Text style={styles.seriesActionText}>Apply changes to all future in series</Text>
                </TouchableOpacity>
              )}

              <View style={styles.bottomActionRow}>
                {onPermanentDelete ? (
                  <TouchableOpacity
                    style={styles.bottomActionButton}
                    onPress={() => {
                      Alert.alert(
                        t.deletePermanently,
                        t.deletePermanentlyConfirm(todo.text),
                        [
                          { text: t.cancel, style: 'cancel' },
                          {
                            text: t.deletePermanently,
                            style: 'destructive',
                            onPress: () => {
                              onPermanentDelete(todo.id)
                              onClose()
                            },
                          },
                        ],
                      )
                    }}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={t.deletePermanently}
                  >
                    <Text style={styles.deleteActionText}>{t.deleteTask}</Text>
                  </TouchableOpacity>
                ) : (
                  <View />
                )}
                <TouchableOpacity
                  style={styles.bottomActionButton}
                  onPress={() => {
                    const isInSeries = !!todo.seriesId && !!onMoveSeriesFutureToTrash
                    if (isInSeries) {
                      Alert.alert(
                        t.markDone,
                        'This is part of a recurring series.',
                        [
                          { text: t.cancel, style: 'cancel' },
                          {
                            text: 'Just this one',
                            onPress: () => {
                              onMoveToTrash(todo.id)
                              onClose()
                            },
                          },
                          {
                            text: 'This and all future',
                            style: 'destructive',
                            onPress: () => {
                              onMoveSeriesFutureToTrash!(todo.id)
                              onClose()
                            },
                          },
                        ],
                      )
                    } else {
                      onMoveToTrash(todo.id)
                      onClose()
                    }
                  }}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={t.markDone}
                >
                  <Text style={styles.markDoneActionText}>{t.markDone}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
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

/**
 * Compose an `until` datetime from a possibly date-only dueDate. A
 * dueDate already carrying a time → use as-is. A date-only dueDate →
 * 23:59 that day. Empty dueDate → empty string (caller handles).
 * Lets "every 2h" without an explicit cutoff still bound itself.
 */
export function dueDateAsUntil(dueDate: string): string {
  if (!dueDate) return ''
  if (dueDate.includes('T')) return dueDate
  return `${dueDate}T23:59`
}

export interface ReminderSubViewProps {
  styles: ReturnType<typeof makeStyles>
  theme: ThemeColors
  // t comes from useLang().t — kept generic to avoid pulling the
  // full Strings type into this file's signature.
  t: ReturnType<typeof useLang>['t']
  remindSubView: 'main' | 'until'
  setRemindSubView: (v: 'main' | 'until') => void
  pendingRemindAt: string
  setPendingRemindAt: (s: string) => void
  pendingRemindInterval: number | undefined
  setPendingRemindInterval: (n: number | undefined) => void
  pendingRemindUntil: string
  setPendingRemindUntil: (s: string) => void
  remindPickerDate: Date
  setRemindPickerDate: (d: Date) => void
  dueDate: string
  onCancel: () => void
  onSave: () => void
}

/**
 * Shared sub-view rendering for the Reminder editor — used by both
 * TaskDetailsSheet and ComposeSheet so the picker UX stays
 * consistent. Splits into `main` (first-fire datetime + interval +
 * Until row) and `until` (datetime picker for the cutoff). The user
 * can Save from main; until has its own Save that flips back.
 */
export function ReminderSubView({
  styles,
  theme,
  t,
  remindSubView,
  setRemindSubView,
  pendingRemindAt,
  setPendingRemindAt,
  pendingRemindInterval,
  setPendingRemindInterval,
  pendingRemindUntil,
  setPendingRemindUntil,
  remindPickerDate,
  setRemindPickerDate,
  dueDate,
  onCancel,
  onSave,
}: ReminderSubViewProps) {
  // Until-picker working state. Kept in a ref-like local so the
  // shared sub-view doesn't need separate parent state. Initial
  // value falls back to dueDate (with time) so the picker opens
  // somewhere reasonable.
  const [untilPickerDate, setUntilPickerDate] = useState<Date>(() => {
    const seed = pendingRemindUntil || dueDateAsUntil(dueDate)
    return seed ? new Date(seed) : new Date(Date.now() + 3 * 60 * 60 * 1000)
  })

  if (remindSubView === 'until') {
    return (
      <>
        <View style={styles.editHeader}>
          <TouchableOpacity onPress={() => setRemindSubView('main')} hitSlop={10} style={styles.headerSideBtn}>
            <Text style={styles.cancelText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.editHeaderTitle}>{t.remindUntil}</Text>
          <View style={styles.headerSideBtn} />
        </View>
        <View style={styles.dateWrap}>
          <Text style={styles.datePendingLabel}>
            {pendingRemindUntil ? formatDateTime(pendingRemindUntil) : t.remindUntilUnset}
          </Text>
          <DateTimePicker
            value={untilPickerDate}
            mode="datetime"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
            minimumDate={new Date()}
            onChange={(_e: DateTimePickerEvent, d?: Date) => {
              if (!d) return
              setUntilPickerDate(d)
              setPendingRemindUntil(isoLocalDateTime(d))
            }}
          />
        </View>
        <View style={styles.dateActions}>
          <TouchableOpacity
            style={styles.dateDoneBtnSolo}
            onPress={() => setRemindSubView('main')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t.done}
          >
            <Text style={styles.dateDoneBtnText}>{t.done}</Text>
          </TouchableOpacity>
        </View>
      </>
    )
  }

  return (
    <>
      <View style={styles.editHeader}>
        <TouchableOpacity onPress={onCancel} hitSlop={10} style={styles.headerSideBtn}>
          <Text style={styles.cancelText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.editHeaderTitle}>{t.remindMe}</Text>
        <TouchableOpacity
          onPress={() => {
            setPendingRemindAt('')
            setPendingRemindInterval(undefined)
            setPendingRemindUntil('')
          }}
          hitSlop={10}
          style={styles.headerSideBtn}
        >
          <Text style={styles.dateClearBtnText}>{t.clear}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.dateWrap}>
        {pendingRemindAt ? (
          <Text style={styles.datePendingLabel}>{formatDateTime(pendingRemindAt)}</Text>
        ) : (
          <Text style={[styles.datePendingLabel, styles.datePendingLabelEmpty]}>{t.remindNone}</Text>
        )}
        <DateTimePicker
          value={remindPickerDate}
          mode="datetime"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
          minimumDate={new Date()}
          onChange={(_e: DateTimePickerEvent, d?: Date) => {
            if (!d) return
            setRemindPickerDate(d)
            setPendingRemindAt(isoLocalDateTime(d))
          }}
        />
      </View>
      {/* Repeat-every chip row — None disables interval (one-shot).
          Selecting any other chip surfaces the Until row beneath. */}
      <View style={styles.remindChipRow}>
        <Text style={styles.remindChipRowLabel}>{t.remindEvery}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.remindChipScroll}
        >
          {REMIND_INTERVAL_CHOICES.map((c) => {
            const active = (pendingRemindInterval ?? undefined) === c.minutes
            return (
              <TouchableOpacity
                key={c.label}
                onPress={() => {
                  setPendingRemindInterval(c.minutes)
                  // Seed Until from dueDate the first time the user
                  // turns on an interval, so the recurrence has a
                  // bound right away.
                  if (c.minutes && !pendingRemindUntil) {
                    const seed = dueDateAsUntil(dueDate)
                    if (seed) setPendingRemindUntil(seed)
                  }
                }}
                style={[styles.remindChip, active && styles.remindChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.remindChipText, active && styles.remindChipTextActive]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>
      {pendingRemindInterval && (
        <TouchableOpacity
          style={styles.editFieldRow}
          onPress={() => setRemindSubView('until')}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={`${t.remindUntil}, ${pendingRemindUntil ? formatDateTime(pendingRemindUntil) : t.remindUntilUnset}. Tap to change.`}
        >
          <Text style={styles.editFieldLabel}>{t.remindUntil}</Text>
          <Text
            style={[
              styles.editFieldValue,
              !pendingRemindUntil && styles.editFieldValueMuted,
            ]}
            numberOfLines={1}
          >
            {pendingRemindUntil ? formatDateTime(pendingRemindUntil) : t.remindUntilUnset}
          </Text>
          <Text style={styles.editChevron}>›</Text>
        </TouchableOpacity>
      )}
      <View style={styles.dateActions}>
        <TouchableOpacity
          style={styles.dateDoneBtnSolo}
          onPress={onSave}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t.done}
        >
          <Text style={styles.dateDoneBtnText}>{t.done}</Text>
        </TouchableOpacity>
      </View>
    </>
  )
}

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

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    overlayTouch: {
      flex: 1,
    },
    sheet: {
      backgroundColor: c.modal,
      // Sheet radius standardized to 18 across the app (was 16 here).
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingTop: 16,
      paddingBottom: Platform.OS === 'ios' ? 32 : 16,
      paddingHorizontal: 16,
      maxHeight: '90%',
      minHeight: '50%',
    },
    // Step / subtask edit views — shaved bottom padding so the Done
    // CTA doesn't float over a large empty band. The 8px floor still
    // clears the iOS home indicator on phones that have one.
    sheetTight: {
      paddingBottom: Platform.OS === 'ios' ? 12 : 8,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: c.label,
      lineHeight: 23,
    },
    titleEdit: {
      fontSize: 18,
      fontWeight: '700',
      color: c.label,
      lineHeight: 23,
      backgroundColor: c.bg,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    subtitle: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 6,
    },
    statusPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
    },
    statusPill_notstarted: { backgroundColor: c.bg },
    statusPill_progress: { backgroundColor: 'rgba(255,149,0,0.18)' },
    statusPill_done: { backgroundColor: 'rgba(52,199,89,0.20)' },
    statusPillText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.4,
    },
    statusPillText_notstarted: { color: c.label2 },
    statusPillText_progress: { color: '#FF9500' },
    statusPillText_done: { color: '#34C759' },
    metaSep: { color: c.label3, fontSize: 12 },
    metaCat: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    metaCatText: { fontSize: 12, fontWeight: '600' },
    metaDate: { fontSize: 12, fontWeight: '500', color: c.label2 },
    metaDateOverdue: { color: c.red, fontWeight: '600' },
    metaDateToday: { color: c.orange, fontWeight: '600' },
    metaDateMuted: { color: c.label3, fontStyle: 'italic' },
    metaProgress: { fontSize: 12, color: c.label2, fontVariant: ['tabular-nums'] },
    closeBtn: { padding: 4 },
    list: { flexGrow: 0, flexShrink: 1 },
    listFilled: { paddingVertical: 8, gap: 6 },
    listEmpty: { paddingVertical: 24, alignItems: 'center' },

    /* Subtask row — borderless single line, sidecar style.
       paddingHorizontal:14 matches the editFieldRowInGroup so the checkbox
       aligns with the Category/Completed-by icons above. */
    subCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
      paddingLeft: 14,
      paddingRight: 14,
    },
    subCardCheckbox: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: c.gray3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subCardCheckboxDone: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    subCardCheckmark: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 14,
    },
    subCardTapArea: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 2,
    },
    subCardText: { flex: 1, fontSize: 15, color: c.label, letterSpacing: -0.2 },
    subCardTextDone: { color: c.label3, textDecorationLine: 'line-through' },
    subCardTextEdit: {
      flex: 1,
      fontSize: 15,
      color: c.label,
      backgroundColor: c.bg,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    subPriorityBtn: { padding: 4 },
    subDateChip: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 5,
    },
    subDateChipText: { fontSize: 12, fontWeight: '500' },
    subDateChipMuted: { color: c.gray3, fontStyle: 'italic', fontWeight: '500' },
    subDateChipPlain: { color: c.label3, fontWeight: '500' },
    subDateChipOverdue: { color: c.red, fontWeight: '600' },
    subDateChipToday: { color: c.orange, fontWeight: '600' },
    subRemoveBtn: { padding: 4 },

    /* Action bar (view mode): Add a subtask primary */
    actionBar: {
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.separator,
    },
    addSubtaskBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 50,
      borderRadius: 12,
      backgroundColor: c.blue,
    },
    addSubtaskBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
    /* Header: Cancel | Edit to-do | Save */
    editHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
      paddingBottom: 12,
    },
    editHeaderTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: c.label,
    },
    headerSideBtn: {
      width: 64,
    },
    cancelText: {
      fontSize: 15,
      fontWeight: '500',
      color: c.blue,
    },
    saveHeaderText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.blue,
      textAlign: 'right',
    },
    saveHeaderTextDisabled: {
      color: c.gray3,
    },
    cancelHeaderText: {
      fontSize: 15,
      fontWeight: '500',
      color: c.label2,
      textAlign: 'left',
    },
    /* Edit-mode body */
    editBody: {
      paddingTop: 16,
      paddingBottom: 16,
    },
    editGroupCard: {
      backgroundColor: c.bg,
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 16,
    },
    editTextInputInCard: {
      minHeight: 96,
      fontSize: 16,
      color: c.label,
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 14,
      letterSpacing: -0.16,
      lineHeight: 22,
    },
    // Inline notes inside the title editGroupCard — smaller font and a
    // shorter min-height so the title remains the dominant element.
    // Matches ComposeSheet's notesInputInline footprint.
    notesInputInGroup: {
      minHeight: 56,
      fontSize: 14,
      lineHeight: 20,
      color: c.label,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 12,
    },
    editGroupDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginLeft: 14,
    },
    editFieldRowInGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    subtaskSectionHeader: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: c.label3,
      marginTop: 4,
      marginBottom: 8,
    },
    notesSectionHeader: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: c.label3,
      marginTop: 16,
      marginBottom: 8,
    },
    notesCard: {
      backgroundColor: c.card,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 4,
    },
    notesInput: {
      fontSize: 15,
      lineHeight: 21,
      color: c.label,
      minHeight: 84,
      padding: 0,
    },
    editFieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    remindChipRow: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 6,
    },
    remindChipRowLabel: {
      fontSize: 13,
      color: c.label2,
      fontWeight: '600',
      letterSpacing: 0.1,
    },
    remindChipScroll: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 4,
    },
    remindChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: c.primarySoft,
    },
    remindChipActive: {
      backgroundColor: c.primary,
    },
    remindChipText: {
      fontSize: 13,
      color: c.primary,
      fontWeight: '600',
    },
    remindChipTextActive: {
      color: c.primaryOn,
    },
    editFieldLabel: {
      flex: 1,
      fontSize: 15,
      color: c.label,
      fontWeight: '500',
    },
    editFieldValue: {
      fontSize: 15,
      color: c.label2,
      maxWidth: 160,
    },
    editFieldValueMuted: {
      color: c.gray3,
    },
    editChevron: {
      fontSize: 18,
      color: c.gray3,
      fontWeight: '300',
      marginLeft: 2,
    },
    editDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginLeft: 44,
    },
    editSubtasks: {
      gap: 6,
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
      marginTop: 12,
    },
    dateClearBtn: {
      flex: 1,
      height: 50,
      borderRadius: 12,
      backgroundColor: c.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateClearBtnText: {
      color: c.label2,
      fontSize: 16,
      fontWeight: '500',
    },
    dateDoneBtn: {
      flex: 1.4,
      height: 50,
      borderRadius: 12,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateDoneBtnSolo: {
      flex: 1,
      height: 50,
      borderRadius: 12,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateDoneBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    // Row holding the STEPS header on the left and the Suggest steps
    // pill on the right. Mirrors the web subtask-section-header row.
    subtaskSectionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      minHeight: 24,
      marginBottom: 4,
    },
    // Bottom-of-section row: Clear all (left) + Add a step (right).
    // Rendered after the subtask list (or empty state) and after the
    // optional Suggest review panel.
    subtaskActionsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      paddingTop: 6,
    },
    // Empty-list variant — only the Add link renders, so center it
    // instead of letting space-between push it to one edge.
    subtaskActionsRowCentered: {
      justifyContent: 'center',
    },
    addSubtaskLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    clearStepsLink: {
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    clearStepsLinkText: {
      color: c.label3,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: -0.1,
    },
    destructiveAction: {
      alignItems: 'flex-start',
      paddingVertical: 14,
      paddingHorizontal: 4,
      marginTop: 12,
    },
    destructiveActionText: {
      color: c.label3,
      fontSize: 14,
      fontWeight: '500',
      letterSpacing: -0.16,
    },
    subEditDoneBtn: {
      // Tightened from 16 to 8 so the Done CTA hugs the field group.
      marginTop: 8,
      alignSelf: 'stretch',
      backgroundColor: c.primary,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Step view's ScrollView contentContainerStyle — shaves the
    // paddingBottom relative to the shared editBody so there's less
    // dead space under the Done CTA. Other edit views keep editBody.
    editStepBody: {
      paddingTop: 16,
      paddingBottom: 4,
    },
    editHeaderCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editHeaderSubtitle: {
      marginTop: 2,
      fontSize: 12,
      color: c.label2,
      maxWidth: '90%',
    },
    headerSideBtnRight: {
      alignItems: 'flex-end',
    },
    deleteHeaderText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.red,
      textAlign: 'right',
    },
    subEditDoneText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
    bottomActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
      paddingHorizontal: 4,
    },
    bottomActionButton: {
      paddingVertical: 14,
      paddingHorizontal: 4,
    },
    deleteActionText: {
      color: c.red,
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
    markDoneActionText: {
      color: c.primary,
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
    seriesAction: {
      alignItems: 'flex-start',
      paddingVertical: 12,
      paddingHorizontal: 4,
      marginTop: 8,
    },
    seriesActionText: {
      color: c.primary,
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
    addSubtaskLinkText: {
      color: c.blue,
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: -0.16,
    },

    dateOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    dateSheet: {
      backgroundColor: c.modal,
      borderRadius: 16,
      paddingHorizontal: 8,
      paddingTop: 4,
      paddingBottom: 8,
      width: '100%',
      maxWidth: 360,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 16,
      elevation: 10,
    },
    dateBtnRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.separator,
    },
    dateClear: { color: c.label2, fontSize: 16, fontWeight: '500' },
    dateDone: { color: c.blue, fontSize: 16, fontWeight: '600' },
  })
}
