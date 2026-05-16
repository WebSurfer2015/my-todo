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
import { Repeat } from 'lucide-react-native'
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
import { formatDisplayDate, formatRecurrence, isoDate, todayLocal } from '../utils'
import { sortedSubs } from '../../../core/src/derive'
import { useTheme, ThemeColors } from '../theme'
import { useLang } from '../LangContext'
import PriorityDot from './PriorityDot'
import CategoryIcon from './CategoryIcon'
import PickerModal from './PickerModal'
import AddSubtaskSheet from './AddSubtaskSheet'
import EmptyState from './EmptyState'
import InlinePicker from './InlinePicker'
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
  const d = new Date(`${iso}T00:00:00`)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

function isCustomRecurrence(rec: Recurrence | undefined): boolean {
  return !!rec && Array.isArray(rec.byWeekday) && rec.byWeekday.length > 0
}

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
  onUpdatePriority: (id: string, priority: Priority) => void
  onUpdateDueDate: (id: string, dueDate: string) => void
  onUpdateCategory: (id: string, category: Category) => void
  onUpdateRecurrence: (id: string, recurrence: Recurrence | undefined) => void
  onMoveToTrash: (id: string) => void
  /** Optional — when provided, "Delete to-do" on a recurring instance with
   * a seriesId offers a "Delete this and all future" option. */
  onMoveSeriesFutureToTrash?: (id: string) => void
  onAddSubtask: (id: string, text: string, priority?: Priority, dueDate?: string) => void
  onToggleSubtask: (id: string, subId: string) => void
  onUpdateSubtaskText: (id: string, subId: string, text: string) => void
  onUpdateSubtaskPriority?: (id: string, subId: string, priority: Priority) => void
  onUpdateSubtaskDueDate?: (id: string, subId: string, dueDate: string) => void
  onRemoveSubtask: (id: string, subId: string) => void
}

export default function TaskDetailsSheet({
  visible, todo, categories, initialSubtaskEditId, onClose, onUpdateText,
  onUpdatePriority, onUpdateDueDate, onUpdateCategory, onUpdateRecurrence, onMoveToTrash, onMoveSeriesFutureToTrash,
  onAddSubtask, onToggleSubtask, onUpdateSubtaskText,
  onUpdateSubtaskPriority, onUpdateSubtaskDueDate, onRemoveSubtask,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const subs = todo.subtasks ?? []
  const doneCount = subs.filter((s) => s.done).length

  const [addSubtaskOpen, setAddSubtaskOpen] = useState(false)

  // Edit form state (sheet is always in edit mode for the parent task)
  const [editText, setEditText] = useState(todo.text)
  const [editPriority, setEditPriority] = useState<Priority>(todo.priority)
  const [editCategory, setEditCategory] = useState<Category | undefined>(todo.category)
  const [editDueDate, setEditDueDate] = useState(todo.dueDate ?? '')
  const [editPriorityOpen, setEditPriorityOpen] = useState(false)
  const [editCategoryOpen, setEditCategoryOpen] = useState(false)
  const [editPickerDate, setEditPickerDate] = useState<Date>(new Date())
  const [editRecurrence, setEditRecurrence] = useState<Recurrence | undefined>(undefined)
  const [parentEditView, setParentEditView] = useState<'main' | 'repeat' | 'customRepeat' | 'date' | 'recurEndDate'>('main')
  const [endDatePickerDate, setEndDatePickerDate] = useState<Date>(new Date())

  // Subtask edit (in-sheet) — when set, renders the edit-subtask sub-view.
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null)
  const [editSubText, setEditSubText] = useState('')
  const [editSubPriority, setEditSubPriority] = useState<Priority>('medium')
  const [editSubDueDate, setEditSubDueDate] = useState('')
  const [editSubPickerView, setEditSubPickerView] = useState<'main' | 'priority' | 'date'>('main')
  const [editSubPickerDate, setEditSubPickerDate] = useState<Date>(new Date())

  const [subPriorityForId, setSubPriorityForId] = useState<string | null>(null)
  const [subDateForId, setSubDateForId] = useState<string | null>(null)
  const [subPickerDate, setSubPickerDate] = useState<Date>(new Date())

  // Re-seed form values when sheet opens or task changes.
  useEffect(() => {
    if (visible) {
      setEditText(todo.text)
      setEditPriority(todo.priority)
      setEditCategory(todo.category)
      setEditDueDate(todo.dueDate ?? '')
      setEditRecurrence(todo.recurrence)
      setParentEditView('main')
      // Honor an opener-provided "open into subtask edit" intent. If the
      // caller passed a subtask id, jump straight into its edit form.
      if (initialSubtaskEditId) {
        const sub = todo.subtasks?.find((s) => s.id === initialSubtaskEditId)
        if (sub) {
          setEditSubText(sub.text)
          setEditSubPriority(sub.priority ?? 'medium')
          setEditSubDueDate(sub.dueDate ?? '')
          setEditSubPickerView('main')
          setEditingSubtaskId(sub.id)
        }
      } else {
        setEditingSubtaskId(null)
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
  function closeAndFlushText() {
    // Final text flush in case the user closed without blurring the input.
    applyText(editText)
    onClose()
  }

  function openEditDatePicker() {
    setEditPickerDate(editDueDate ? new Date(`${editDueDate}T00:00:00`) : new Date())
    setParentEditView('date')
  }


  function handleEditDateChange(_event: DateTimePickerEvent, selected?: Date) {
    if (!selected) return
    setEditPickerDate(selected)
    // Auto-commit on date pick — feels like a normal date picker (tap day,
    // it's saved). The Clear button up in the header is the explicit
    // way out for users who want to remove the date entirely.
    applyDueDate(isoDate(selected))
    setParentEditView('main')
  }

  function openSubDate(s: Subtask) {
    setSubPickerDate(s.dueDate ? new Date(`${s.dueDate}T00:00:00`) : new Date())
    setSubDateForId(s.id)
  }

  function startEditSubtask(s: Subtask) {
    setEditSubText(s.text)
    setEditSubPriority(s.priority ?? 'medium')
    setEditSubDueDate(s.dueDate ?? '')
    setEditSubPickerView('main')
    setEditingSubtaskId(s.id)
  }

  function openEditSubDate() {
    setEditSubPickerDate(editSubDueDate ? new Date(`${editSubDueDate}T00:00:00`) : new Date())
    setEditSubPickerView('date')
  }


  function clearEditSubDate() {
    applySubDueDate('')
    setEditSubPickerView('main')
  }

  function handleEditSubDateChange(_event: DateTimePickerEvent, selected?: Date) {
    if (!selected) return
    setEditSubPickerDate(selected)
    // Auto-commit on date pick (matches the parent date pickers).
    applySubDueDate(isoDate(selected))
    setEditSubPickerView('main')
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
    // Flush any pending text on the way out.
    applySubText(editSubText)
    setEditingSubtaskId(null)
    setEditSubPickerView('main')
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
        <View style={styles.sheet}>
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
                  <Text style={styles.editHeaderTitle}>Completed by</Text>
                  {editSubDueDate ? (
                    <TouchableOpacity onPress={clearEditSubDate} hitSlop={10} style={styles.headerSideBtn}>
                      <Text style={styles.dateClearBtnText}>{t.clear}</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.headerSideBtn} />
                  )}
                </View>
                <View style={styles.dateWrap}>
                  <DateTimePicker
                    value={editSubPickerDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
                    onChange={handleEditSubDateChange}
                  />
                </View>
              </>
            ) : (
              <>
                <View style={styles.editHeader}>
                  <TouchableOpacity onPress={leaveSubtaskEdit} hitSlop={10} style={styles.headerSideBtn}>
                    <Text style={styles.cancelText}>‹ Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.editHeaderTitle}>Edit step</Text>
                  <View style={styles.headerSideBtn} />
                </View>
                <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.editBody}>
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
                      <Text style={styles.editFieldLabel}>Completed by</Text>
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
                    style={styles.destructiveAction}
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
                    activeOpacity={0.6}
                  >
                    <Text style={styles.destructiveActionText}>Delete step</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )
          ) : parentEditView === 'repeat' ? (
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
              onBack={() => setParentEditView('main')}
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
                {editDueDate ? (
                  <TouchableOpacity
                    onPress={() => { applyDueDate(''); setParentEditView('main') }}
                    hitSlop={10}
                    style={styles.headerSideBtn}
                  >
                    <Text style={styles.dateClearBtnText}>{t.clear}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.headerSideBtn} />
                )}
              </View>
              <View style={styles.dateWrap}>
                <DateTimePicker
                  value={editPickerDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
                  onChange={handleEditDateChange}
                />
              </View>
            </>
          ) : parentEditView === 'recurEndDate' && editRecurrence ? (
            <>
              <View style={styles.editHeader}>
                <TouchableOpacity onPress={() => setParentEditView('main')} hitSlop={10} style={styles.headerSideBtn}>
                  <Text style={styles.cancelText}>‹ Back</Text>
                </TouchableOpacity>
                <Text style={styles.editHeaderTitle}>Repeat ends</Text>
                {editRecurrence.endDate ? (
                  <TouchableOpacity
                    onPress={() => {
                      const { endDate: _drop, ...rest } = editRecurrence
                      applyRecurrence(rest)
                      setParentEditView('main')
                    }}
                    hitSlop={10}
                    style={styles.headerSideBtn}
                  >
                    <Text style={styles.dateClearBtnText}>{t.clear}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.headerSideBtn} />
                )}
              </View>
              <View style={styles.dateWrap}>
                <DateTimePicker
                  value={endDatePickerDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
                  minimumDate={new Date()}
                  onChange={(_e: DateTimePickerEvent, d?: Date) => {
                    if (!d) return
                    setEndDatePickerDate(d)
                    applyRecurrence({ ...editRecurrence, endDate: isoDate(d) })
                    setParentEditView('main')
                  }}
                />
              </View>
            </>
          ) : (
          <>
          <View style={styles.editHeader}>
            <View style={styles.headerSideBtn} />
            <Text style={styles.editHeaderTitle}>Edit to-do</Text>
            <TouchableOpacity onPress={closeAndFlushText} hitSlop={10} style={styles.headerSideBtn}>
              <Text style={styles.saveHeaderText}>{t.done}</Text>
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
                <View style={styles.editGroupDivider} />
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
                  onPress={openEditDatePicker}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={`Completed by, ${editDueDate ? absoluteDateLabel(editDueDate) : t.noDate}. Tap to change.`}
                >
                  <CalendarIcon size={18} color={editDueDate ? theme.blue : theme.gray3} />
                  <Text style={styles.editFieldLabel}>Completed by</Text>
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
                  <Text style={styles.editFieldLabel}>Repeat</Text>
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
                        setParentEditView('recurEndDate')
                      }}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`Repeat ends, ${editRecurrence.endDate ? absoluteDateLabel(editRecurrence.endDate) : 'never'}. Tap to change.`}
                    >
                      <CalendarIcon size={18} color={editRecurrence.endDate ? theme.blue : theme.gray3} />
                      <Text style={styles.editFieldLabel}>Repeat ends</Text>
                      <Text
                        style={[
                          styles.editFieldValue,
                          !editRecurrence.endDate && styles.editFieldValueMuted,
                        ]}
                        numberOfLines={1}
                      >
                        {editRecurrence.endDate ? absoluteDateLabel(editRecurrence.endDate) : 'No end'}
                      </Text>
                      <Text style={styles.editChevron}>›</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              <Text style={styles.subtaskSectionHeader}>SUBTASKS</Text>
              {subs.length === 0 ? (
                <EmptyState
                  variant="compact"
                  title="No steps yet"
                  hint="Break this task into smaller steps when you're ready."
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
              <TouchableOpacity
                style={styles.addSubtaskLink}
                onPress={() => setAddSubtaskOpen(true)}
                activeOpacity={0.6}
              >
                <PlusIcon size={16} color={theme.blue} />
                <Text style={styles.addSubtaskLinkText}>{t.addSubtask}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.destructiveAction}
                onPress={() => {
                  const isInSeries = !!todo.seriesId && !!onMoveSeriesFutureToTrash
                  if (isInSeries) {
                    // Multi-instance recurring — let the user choose scope.
                    Alert.alert(
                      'Delete to-do',
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
                    Alert.alert(
                      t.moveToTrash,
                      `Move "${todo.text}" to trash? You can restore it within 30 days.`,
                      [
                        { text: t.cancel, style: 'cancel' },
                        {
                          text: t.moveToTrash,
                          style: 'destructive',
                          onPress: () => {
                            onMoveToTrash(todo.id)
                            onClose()
                          },
                        },
                      ],
                    )
                  }
                }}
                activeOpacity={0.6}
              >
                <Text style={styles.destructiveActionText}>Delete to-do</Text>
              </TouchableOpacity>
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
                  <DateTimePicker
                    value={subPickerDate}
                    mode="date"
                    display="inline"
                    themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
                    onChange={(e, d) => {
                      if (e.type === 'set' && d) setSubPickerDate(d)
                    }}
                  />
                  <View style={styles.dateBtnRow}>
                    <TouchableOpacity
                      onPress={() => {
                        if (subDateForId) onUpdateSubtaskDueDate(todo.id, subDateForId, '')
                        setSubDateForId(null)
                      }}
                    >
                      <Text style={styles.dateClear}>{t.clear}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        if (subDateForId) onUpdateSubtaskDueDate(todo.id, subDateForId, isoDate(subPickerDate))
                        setSubDateForId(null)
                      }}
                    >
                      <Text style={styles.dateDone}>{t.done}</Text>
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
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingTop: 12,
      paddingBottom: Platform.OS === 'ios' ? 32 : 16,
      paddingHorizontal: 16,
      maxHeight: '90%',
      minHeight: '50%',
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
      paddingVertical: 13,
    },
    subtaskSectionHeader: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: c.label3,
      marginTop: 4,
      marginBottom: 8,
    },
    editFieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
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
      color: c.red,
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
    dateDoneBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    addSubtaskLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
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
    dateClear: { color: c.red, fontSize: 16, fontWeight: '500' },
    dateDone: { color: c.blue, fontSize: 16, fontWeight: '600' },
  })
}
