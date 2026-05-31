import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal, Alert, Pressable, ActionSheetIOS, Animated, Easing, Dimensions } from 'react-native'

const SCREEN_WIDTH = Dimensions.get('window').width
// Trigger-to-commit threshold for full-swipe gestures. Pairs with the
// Swipeable's `friction: 1` below so the finger-distance required to
// reach the threshold is the same as the row offset: 30% of screen
// width is comfortably reachable in a single pull on every iPhone size
// (and matches iOS Mail/Notes full-swipe feel).
const FULL_SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3

// Module-level tracker so any TaskItem can close another row's open
// swipe menu on tap — Reminders.app convention. Single-open-at-a-time
// across all TaskItem instances. Reset when the open row's swipe
// closes itself.
let openSwipeable: { ref: React.RefObject<Swipeable | null>; id: string } | null = null
function trackOpenSwipeable(
  ref: React.RefObject<Swipeable | null>,
  id: string,
): void {
  if (openSwipeable && openSwipeable.id !== id) {
    openSwipeable.ref.current?.close()
  }
  openSwipeable = { ref, id }
}
function clearOpenSwipeable(id: string): void {
  if (openSwipeable?.id === id) openSwipeable = null
}
function closeOtherSwipeables(id: string): void {
  if (openSwipeable && openSwipeable.id !== id) {
    openSwipeable.ref.current?.close()
    openSwipeable = null
  }
}

/** Listens to a Swipeable's drag animated value and fires onFullSwipe when |drag| exceeds the threshold. */
function FullSwipeWatcher({
  dragX,
  direction,
  onFullSwipe,
}: {
  dragX: Animated.AnimatedInterpolation<number>
  direction: 'left' | 'right'
  onFullSwipe: () => void
}) {
  const firedRef = useRef(false)
  useEffect(() => {
    const id = (dragX as Animated.Value).addListener(({ value }: { value: number }) => {
      const past =
        direction === 'left'
          ? value > FULL_SWIPE_THRESHOLD
          : value < -FULL_SWIPE_THRESHOLD
      if (past && !firedRef.current) {
        firedRef.current = true
        onFullSwipe()
      }
      // Reset when the row returns near closed so we can re-fire next gesture.
      if (Math.abs(value) < 20) {
        firedRef.current = false
      }
    })
    return () => (dragX as Animated.Value).removeListener(id)
  }, [dragX, direction, onFullSwipe])
  return null
}
import { Swipeable } from 'react-native-gesture-handler'
import * as Haptics from 'expo-haptics'
import {
  Repeat as LucideRepeat,
  ChevronRight,
  ChevronDown,
  Trash2,
  RotateCcw,
  Pencil,
  Check,
  Calendar,
} from 'lucide-react-native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { Category, Priority, Recurrence, Todo, PRIORITY_VALUES, PRIORITY_COLORS } from '../../types'
import { CategoryDef, categoryLabel } from '../../categories'
import type { Density } from '../../profile'
import { formatDisplayDate, fullDateLabel, todayLocal, isoDate } from '../../utils'
import { sortedSubs } from '../../../../core/src/derive'
import { useTriggerPebbleFlight } from '../PebbleFlight'
import { useTheme, ThemeColors } from '../../theme'
import PriorityDot from '../PriorityDot'
import CategoryIcon from '../CategoryIcon'
import PickerModal from '../PickerModal'
import TaskDetailsSheet from '../TaskDetailsSheet'
import { useLang } from '../../LangContext'
import { makeStyles } from './styles';

export type SubtaskVisibility = 'all' | 'open' | 'done'

interface Props {
  todo: Todo
  inTrash?: boolean
  /**
   * True when this row renders inside the Done filter (the merged-bin
   * view). Behaves like a normal row for tap/checkbox/expand, but the
   * left-swipe and long-press menu shift to bin actions (Restore +
   * Delete Permanently) since the item is already in the bin.
   */
  binFilterView?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
  categories: CategoryDef[]
  density?: Density
  /** When true, animate the checkbox on done-transition. Defaults to true. */
  celebrate?: boolean
  /** When true, play a chime on done-transition. Defaults to true. */
  playSound?: boolean
  subtaskVisibility?: SubtaskVisibility
  onToggle: (id: string) => void
  onMoveToTrash: (id: string) => void
  /** R5 — Skip ("Not Do"). Marks status='notDo' and tucks the row
   * into the Done bin without flipping done. Pebble-neutral. */
  onSkip?: (id: string) => void
  onMoveSeriesFutureToTrash?: (id: string) => void
  onApplySeriesFutureEdits?: (
    id: string,
    fields: {
      text?: string
      priority?: Priority
      category?: Category | undefined
      notes?: string
    },
    options?: { overwriteDetached?: boolean; silent?: boolean },
  ) => void
  /** R6a — Mark this series instance as detached. Wired through to
   * TaskDetailsSheet which fires it when the user makes a
   * series-eligible edit in "Edit this only" mode. */
  onDetachFromSeries?: (id: string) => void
  /** R6b — Series recurrence change. Wired through to
   * TaskDetailsSheet for the "Recreate all / Keep modified" dialog
   * fired at Save in series mode. */
  onApplyRecurrenceChange?: (
    id: string,
    newRecurrence: Recurrence | undefined,
    options: { keepDetached: boolean },
  ) => void
  onRestore?: (id: string) => void
  onPermanentDelete?: (id: string) => void
  onUpdatePriority: (id: string, priority: Priority) => void
  onUpdateDueDate: (id: string, dueDate: string) => void
  onSnooze?: (id: string, daysFromToday: number) => void
  /** Long-press defer handler — opens the same bottom-sheet picker
   * the group "Defer all to" action uses, scoped to this single todo.
   * If omitted, the long-press snooze action sheet is used as
   * fallback. No-op on done items. */
  onLongPressDefer?: (todo: Todo) => void
  onUpdateCategory: (id: string, category: Category) => void
  onUpdateText: (id: string, text: string) => void
  onUpdateNotes?: (id: string, notes: string) => void
  onUpdateRecurrence?: (id: string, recurrence: Recurrence | undefined) => void
  onUpdateReminder?: (id: string, reminder: Todo["reminder"] | undefined) => void
  onAddSubtask?: (id: string, text: string, priority?: Priority, dueDate?: string) => void
  onToggleSubtask?: (id: string, subId: string) => void
  onUpdateSubtaskText?: (id: string, subId: string, text: string) => void
  onUpdateSubtaskPriority?: (id: string, subId: string, priority: Priority) => void
  onUpdateSubtaskDueDate?: (id: string, subId: string, dueDate: string) => void
  onRemoveSubtask?: (id: string, subId: string) => void
  onClearSubtasks?: (id: string) => void
  /** Home-specific date chip rendering: hide the "Today" label for
   * items due today, swap the formatted past date for a "carried over"
   * label on overdue items. Default rendering shows the full
   * formatted date for every row. */
  dateChipFormat?: 'default' | 'home-today'
  /** Default 'toggle' — tap row toggles done. 'expandIfHasSubs' makes
   * tap on a parent-with-subs row toggle the expand chevron instead
   * (since the parent's done state is derived and tap-to-toggle is a
   * no-op). Plain rows still toggle. Home uses this. */
  tapBehavior?: 'toggle' | 'expandIfHasSubs'
  /** When 'due-today', filter the rendered subtasks to those with a
   * dueDate today or earlier, auto-expand the row so the user sees
   * those steps without tapping, and dim the row when every visible
   * (today-or-earlier) sub is done but future subs are still open —
   * the "today's work is finished" state. Home uses this. */
  subtaskDateFilter?: 'due-today'
  /** When true, TaskDetailsSheet shows the AI "Suggest steps" panel
   * in the empty subtask state. Mirrors profile.agentEnabled. */
  agentEnabled?: boolean
}

function TaskItem({
  todo, inTrash = false, binFilterView = false, selected = false, onToggleSelect,
  categories, density = 'comfortable', celebrate = true, playSound = true,
  subtaskVisibility = 'all',
  onToggle, onMoveToTrash, onSkip, onMoveSeriesFutureToTrash, onApplySeriesFutureEdits, onDetachFromSeries, onApplyRecurrenceChange, onRestore, onPermanentDelete,
  onUpdatePriority, onUpdateDueDate, onSnooze, onLongPressDefer, onUpdateCategory, onUpdateText, onUpdateNotes, onUpdateRecurrence, onUpdateReminder,
  onAddSubtask, onToggleSubtask, onUpdateSubtaskText,
  onUpdateSubtaskPriority, onUpdateSubtaskDueDate, onRemoveSubtask, onClearSubtasks,
  dateChipFormat = 'default', tapBehavior = 'toggle', subtaskDateFilter,
  agentEnabled,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme, density), [theme, density])
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  // When set, TaskDetailsSheet opens jumped straight into the named
  // subtask's edit view. Cleared on close.
  const [pendingSubtaskEditId, setPendingSubtaskEditId] = useState<string | null>(null)
  // Rows start collapsed; user taps the chevron (or the row body when
  // tapBehavior='expandIfHasSubs') to reveal subtasks.
  const [expanded, setExpanded] = useState(false)
  // Shared per-subtask pickers — track which sub has the modal open.
  const [subPriorityForId, setSubPriorityForId] = useState<string | null>(null)
  const [subDateForId, setSubDateForId] = useState<string | null>(null)
  const [subPickerDate, setSubPickerDate] = useState<Date>(new Date())
  // Pending values while iOS date pickers are open. Commit happens on
  // Done; Clear empties the pending value but keeps the modal open.
  const [pendingDate, setPendingDate] = useState<string>('')
  const [pendingSubDate, setPendingSubDate] = useState<string>('')
  const subs = todo.subtasks ?? []
  const hasSubs = subs.length > 0
  const subsDoneCount = subs.filter((s) => s.done).length
  const detailsAvailable =
    !!onAddSubtask && !!onToggleSubtask && !!onUpdateSubtaskText && !!onRemoveSubtask
  const today = todayLocal()
  const visibleSubs = sortedSubs(
    subtaskDateFilter === 'due-today'
      ? // Home's TODAY rendering: only render subs whose due-date is
        // today or earlier. Future subs and no-date subs stay hidden.
        subs.filter((s) => !!s.dueDate && s.dueDate <= today)
      : subtaskVisibility === 'open'
        ? subs.filter((s) => !s.done)
        : subtaskVisibility === 'done'
          ? subs.filter((s) => s.done)
          : subs,
  )
  // "Today's work is done" — every visible (today-or-earlier) sub is
  // done, but at least one future sub remains open. Distinct from the
  // fully-done parent state. Drives a dimmed row on Home so the user
  // can tell at a glance which rows still have actionable steps today.
  const partiallyDoneToday =
    subtaskDateFilter === 'due-today' &&
    hasSubs &&
    visibleSubs.length > 0 &&
    visibleSubs.every((s) => s.done) &&
    !todo.done
  const [pickerDate, setPickerDate] = useState<Date>(() =>
    todo.dueDate ? new Date(`${todo.dueDate}T00:00:00`) : new Date()
  )

  // Calm completion animation + sound — fires when a task transitions to done.
  // Both the row-flash and the checkbox bounce are skipped when the OS-level
  // Reduce Motion accessibility setting is on; the haptic + sound still fire.
  const checkboxScale = useRef(new Animated.Value(1)).current
  const rowFlash = useRef(new Animated.Value(0)).current
  const prevDoneRef = useRef(todo.done)
  // Track dueDate too so rolling-recurrence completions fire the pebble
  // flight — todoToggle preserves done=false on the rolled-forward row
  // and only advances dueDate, so a done-only watcher misses these.
  const prevDueDateRef = useRef(todo.dueDate)
  // Mochi pebble-flight overlay — captures the row's screen position via
  // onLayout (more reliable across RN versions / production bundles than
  // measuring on a ref at trigger time) and arcs a Mochi sprite up to
  // the PebbleStrip cairn registered at the top of the app. Skips when
  // reduce-motion is on (handled by the provider).
  const triggerPebbleFlight = useTriggerPebbleFlight()
  const rowMeasureRef = useRef<View>(null)
  // Per-sub measure refs so a checked-off step fires the pebble flight
  // from its own screen position, not the parent row's. Cleared on
  // unmount via the ref callback's null branch.
  const subMeasureRefs = useRef<Map<string, View>>(new Map())
  // Category color → fed to PebbleFlight as the `tint` for the
  // default-Mochi pebble glyph so the celebration carries the
  // visual identity of the thing the user just completed. Looked
  // up lazily inside the flight callbacks so the latest category
  // metadata is used at trigger time (categories can be edited
  // while a row is mounted).
  const categoryTint =
    todo.category
      ? categories.find((c) => c.id === todo.category)?.color
      : undefined

  const fireSubFlight = useCallback(
    (subId: string) => {
      if (!celebrate && !playSound) return
      const fallback = {
        x: Dimensions.get('window').width / 2,
        y: Dimensions.get('window').height / 2,
      }
      const measure = subMeasureRefs.current.get(subId)
      if (measure) {
        measure.measureInWindow((x, y, w, h) => {
          const from =
            typeof x === 'number' && typeof y === 'number' && w > 0 && h > 0
              ? { x: x + w / 2, y: y + h / 2 }
              : fallback
          triggerPebbleFlight(from, { animate: celebrate, chime: playSound, tint: categoryTint })
        })
      } else {
        triggerPebbleFlight(fallback, { animate: celebrate, chime: playSound, tint: categoryTint })
      }
    },
    [celebrate, playSound, triggerPebbleFlight, categoryTint],
  )
  // Fire the pebble flight from the row's CURRENT screen position
  // synchronously on tap — strict Open filters unmount the row
  // immediately when it flips done, so a post-render useEffect would
  // miss the transition entirely.
  const fireRowFlight = useCallback(() => {
    if (!celebrate && !playSound) return
    const fallback = {
      x: Dimensions.get('window').width / 2,
      y: Dimensions.get('window').height / 2,
    }
    const measure = rowMeasureRef.current
    if (measure) {
      measure.measureInWindow((x, y, w, h) => {
        const from =
          typeof x === 'number' && typeof y === 'number' && w > 0 && h > 0
            ? { x: x + w / 2, y: y + h / 2 }
            : fallback
        triggerPebbleFlight(from, { animate: celebrate, chime: playSound, tint: categoryTint })
      })
    } else {
      triggerPebbleFlight(fallback, { animate: celebrate, chime: playSound, tint: categoryTint })
    }
  }, [celebrate, playSound, triggerPebbleFlight, categoryTint])
  useEffect(() => {
    const becameDone = todo.done && !prevDoneRef.current
    const rolledForward =
      !!todo.recurrence &&
      !todo.done &&
      !prevDoneRef.current &&
      prevDueDateRef.current !== todo.dueDate &&
      !!prevDueDateRef.current
    if ((becameDone || rolledForward) && celebrate) {
      // Row flash + checkbox bounce — both honor `celebrate`, which is
      // false when the user has Reduce motion or Completion animation
      // turned off in Settings. No motion at all on done in that mode.
      Animated.sequence([
        Animated.timing(rowFlash, {
          toValue: 1,
          duration: 100,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(rowFlash, {
          toValue: 0,
          duration: 240,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start()
      Animated.sequence([
        Animated.timing(checkboxScale, {
          toValue: 1.35,
          duration: 140,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(checkboxScale, {
          toValue: 1,
          duration: 220,
          easing: Easing.elastic(1.2),
          useNativeDriver: true,
        }),
      ]).start()
      // Pebble flight is fired synchronously in handleToggle (so it
      // survives a strict-Open-filter unmount). This effect now only
      // owns the on-row visual feedback (row flash + checkbox bounce)
      // for the brief window before the row may unmount.
    }
    prevDoneRef.current = todo.done
    prevDueDateRef.current = todo.dueDate
  }, [todo.done, todo.dueDate, todo.recurrence, celebrate, checkboxScale, rowFlash])
  const swipeableRef = useRef<Swipeable>(null)
  const [swipeOpen, setSwipeOpen] = useState(false)
  // Suppress the row Pressable's onPress / onLongPress when the touch
  // includes any horizontal drag — Pressable's built-in cancellation
  // only triggers when the finger leaves the Pressable's bounds, but
  // a swipe slides inside the row's width and would otherwise toggle
  // the row on release alongside opening the swipe menu.
  const touchStartXRef = useRef(0)
  const touchStartYRef = useRef(0)
  const touchMovedRef = useRef(false)
  function onRowTouchStart(e: { nativeEvent: { touches: Array<{ pageX: number; pageY: number }> } }) {
    const t = e.nativeEvent.touches[0]
    if (!t) return
    touchStartXRef.current = t.pageX
    touchStartYRef.current = t.pageY
    touchMovedRef.current = false
  }
  function onRowTouchMove(e: { nativeEvent: { touches: Array<{ pageX: number; pageY: number }> } }) {
    const t = e.nativeEvent.touches[0]
    if (!t) return
    const dx = Math.abs(t.pageX - touchStartXRef.current)
    const dy = Math.abs(t.pageY - touchStartYRef.current)
    if (dx > 8 || dy > 8) touchMovedRef.current = true
  }
  // Single-open-swipe coordination — sync this row's swipe state into
  // the module-level tracker so a tap elsewhere closes us.
  useEffect(() => {
    return () => clearOpenSwipeable(todo.id)
  }, [todo.id])

  const overdue = !!todo.dueDate && !todo.done && todo.dueDate < today
  const isToday = !!todo.dueDate && !todo.done && todo.dueDate === today
  const cat = todo.category ? categories.find((c) => c.id === todo.category) : undefined

  function openDetails() {
    swipeableRef.current?.close()
    setPendingSubtaskEditId(null)
    // Unified model: long-press always opens the edit sheet (including
    // in the bin), so the user can correct a row's metadata without
    // first restoring. Tap on the row body toggles done — that's the
    // un-check path; this function is for the long-press/edit path.
    if (detailsAvailable) setDetailsOpen(true)
  }

  function openSubtaskEdit(subId: string) {
    swipeableRef.current?.close()
    if (inTrash || !detailsAvailable) return
    setPendingSubtaskEditId(subId)
    setDetailsOpen(true)
  }

  function handleToggle() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    // Not-Do rows: tap reopens them, not mark-done.
    if (todo.trashed && !todo.done) {
      onRestore?.(todo.id)
      return
    }
    // Parent rows with subtasks: parent.done is derived from subs, so
    // a tap-toggle is a no-op at the data layer. Skip the flight too
    // so the user doesn't see a pebble fly for "nothing happened".
    // Step rows still toggle individually via their own checkbox.
    if (hasSubs) return
    // Tap that COMPLETES (or rolls a recurring row forward) measures
    // the row's position FIRST, then fires the pebble flight, then
    // calls onToggle. The serialization matters because the row may
    // unmount the moment state updates (strict Open filter), and
    // measureInWindow's async callback never fires for an unmounted
    // node. Doing it in this order keeps the row mounted long enough
    // for the measurement to succeed.
    const wantsFlight = !todo.done && (celebrate || playSound)
    if (!wantsFlight) {
      onToggle(todo.id)
      return
    }
    const measure = rowMeasureRef.current
    if (!measure) {
      // No measurable view — fire from screen center and move on.
      triggerPebbleFlight(
        {
          x: Dimensions.get('window').width / 2,
          y: Dimensions.get('window').height / 2,
        },
        { animate: celebrate, chime: playSound },
      )
      onToggle(todo.id)
      return
    }
    measure.measureInWindow((x, y, w, h) => {
      const fallback = {
        x: Dimensions.get('window').width / 2,
        y: Dimensions.get('window').height / 2,
      }
      const from =
        typeof x === 'number' && typeof y === 'number' && w > 0 && h > 0
          ? { x: x + w / 2, y: y + h / 2 }
          : fallback
      triggerPebbleFlight(from, { animate: celebrate, chime: playSound })
      onToggle(todo.id)
    })
  }

  function handleMoveToTrash() {
    swipeableRef.current?.close()
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    // In the merged Done-bin model, this routes through onMoveToTrash
    // which marks the item done + trashed (sits in the bin for 30
    // days). Same destination as tapping the checkbox; named "Mark
    // done" in the swipe action so the user knows what happens.
    onMoveToTrash(todo.id)
  }

  function handleMarkDone() {
    swipeableRef.current?.close()
    if (!todo.done) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    }
    onToggle(todo.id)
  }

  function confirmPermanentDelete() {
    swipeableRef.current?.close()
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
    Alert.alert(
      t.deletePermanently,
      t.deletePermanentlyConfirm(todo.text),
      [
        { text: t.cancel, style: 'cancel' },
        { text: t.deletePermanently, style: 'destructive', onPress: () => onPermanentDelete?.(todo.id) },
      ],
    )
  }

  function handleRestore() {
    swipeableRef.current?.close()
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    onRestore?.(todo.id)
  }

  // Long-press menu. Bin rows get Restore + Delete Permanently. Non-bin
  // rows open the same bottom-sheet defer picker the group "Defer all
  // to" action uses (scoped to this single todo). Completed todos no-op
  // — they don't need to be deferred.
  function handleLongPress() {
    const cancel = t.cancel
    if (inTrash || binFilterView) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
      const opts = [t.restoreTask, t.deletePermanently, cancel]
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          { options: opts, cancelButtonIndex: 2, destructiveButtonIndex: 1 },
          (i) => { if (i === 0) handleRestore(); else if (i === 1) confirmPermanentDelete() },
        )
      } else {
        Alert.alert(todo.text, undefined, [
          { text: t.restoreTask, onPress: handleRestore },
          { text: t.deletePermanently, style: 'destructive', onPress: confirmPermanentDelete },
          { text: cancel, style: 'cancel' },
        ])
      }
      return
    }
    // Already-completed todos don't need to be deferred — silent no-op.
    if (todo.done) return
    if (onLongPressDefer) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
      onLongPressDefer(todo)
      return
    }
    if (!onSnooze) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    const opts = [t.snooze.tomorrow, t.snooze.nextWeek, t.snooze.pickDate, cancel]
    if (Platform.OS === 'ios') {
      // iOS 17+ ActionSheetIOS sometimes hides the dedicated Cancel
      // (cancelButtonIndex) row, expecting tap-outside-to-dismiss. We want
      // an explicit, visible Cancel pill, so render it as a regular option
      // and ignore the tap.
      ActionSheetIOS.showActionSheetWithOptions(
        { options: opts, title: t.snooze.title },
        (i) => {
          if (i === 0) onSnooze(todo.id, 1)
          else if (i === 1) onSnooze(todo.id, 7)
          else if (i === 2) openDatePicker()
        },
      )
    } else {
      Alert.alert(t.snooze.title, undefined, [
        { text: t.snooze.tomorrow, onPress: () => onSnooze(todo.id, 1) },
        { text: t.snooze.nextWeek, onPress: () => onSnooze(todo.id, 7) },
        { text: t.snooze.pickDate, onPress: openDatePicker },
        { text: cancel, style: 'cancel' },
      ])
    }
  }

  // iOS conventions: leading swipe (rightward, reveals leftActions) → non-destructive.
  // Trailing swipe (leftward, reveals rightActions) → destructive.
  // Full-swipe auto-commit: dragging more than half the screen triggers the action.
  // Trashed-not-done items always swipe to Restore (left) / Delete (right),
  // regardless of which page they appear on (All shows trashed items inside
  // their date buckets, Done view, legacy trash view, etc.). Active items
  // keep the Mark-done / Move-to-bin behavior.
  const trashedRow = todo.trashed && !todo.done

  // Unified swipe model (2026-05-19):
  //   Right swipe (drag right, reveals leftActions):
  //     - Open: Edit + Mark Done, full-swipe-right = Mark Done
  //     - Done / Not-Do: Edit only
  //   Left swipe (drag left, reveals rightActions):
  //     - Open: Defer + Not Do + Delete (no full-swipe shortcut — too many
  //       destructive options to auto-commit one)
  //     - Done / Not-Do: Restore + Delete
  const isBin = inTrash || binFilterView || trashedRow

  function renderLeftActions(_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) {
    // Parent todos with steps suppress the swipe Edit action — the
    // steps live INSIDE the row and have their own tap-to-edit on the
    // sub text. Surfacing a parent Edit from a swipe is confusing in
    // that context. Long-press still opens the parent edit sheet for
    // anyone who needs it.
    if (isBin) {
      // Bin row's only left action was Edit; remove it for parents
      // with steps and the menu is empty — return null so Swipeable
      // skips rendering a left-action area entirely.
      if (hasSubs) return null
      return (
        <View style={styles.swipeActionsRow}>
          <TouchableOpacity style={[styles.swipeAction, styles.swipeEdit]} onPress={openDetails}>
            <Pencil size={20} color="#fff" strokeWidth={2} />
            <Text style={styles.swipeActionText}>{t.editTask}</Text>
          </TouchableOpacity>
        </View>
      )
    }
    return (
      <View style={styles.swipeActionsRow}>
        <FullSwipeWatcher dragX={dragX} direction="left" onFullSwipe={handleMarkDone} />
        {!hasSubs && (
          <TouchableOpacity style={[styles.swipeAction, styles.swipeEdit]} onPress={openDetails}>
            <Pencil size={20} color="#fff" strokeWidth={2} />
            <Text style={styles.swipeActionText}>{t.editTask}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.swipeAction, styles.swipeMarkDone]} onPress={handleMarkDone}>
          <Check size={20} color="#fff" strokeWidth={2} />
          <Text style={styles.swipeActionText}>{todo.done ? t.markNotDone : t.markDone}</Text>
        </TouchableOpacity>
      </View>
    )
  }

  function renderRightActions(_progress: Animated.AnimatedInterpolation<number>, _dragX: Animated.AnimatedInterpolation<number>) {
    if (isBin) {
      return (
        <View style={styles.swipeActionsRow}>
          <TouchableOpacity style={[styles.swipeAction, styles.swipeRestore]} onPress={handleRestore}>
            <RotateCcw size={20} color="#fff" strokeWidth={2} />
            <Text style={styles.swipeActionText}>{t.restoreTask}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.swipeAction, styles.swipeDelete]} onPress={confirmPermanentDelete}>
            <Trash2 size={20} color="#fff" strokeWidth={2} />
            <Text style={styles.swipeActionText}>{t.deleteTask}</Text>
          </TouchableOpacity>
        </View>
      )
    }
    return (
      <View style={styles.swipeActionsRow}>
        <TouchableOpacity
          style={[styles.swipeAction, styles.swipeDefer]}
          onPress={() => {
            swipeableRef.current?.close()
            onLongPressDefer?.(todo)
          }}
        >
          <Calendar size={20} color="#fff" strokeWidth={2} />
          <Text style={styles.swipeActionText}>{t.deferTask}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.swipeAction, styles.swipeTrash]}
          onPress={() => {
            swipeableRef.current?.close()
            if (onSkip) onSkip(todo.id)
            else handleMoveToTrash()
          }}
        >
          {/* Solid white disc + dark X — lucide's XCircle outline reads
              as "dotted" / thin at button scale, so we draw a filled
              circle with a contrasting ✕ glyph instead. */}
          <View style={styles.notDoIcon}>
            <Text style={styles.notDoIconX}>✕</Text>
          </View>
          <Text style={styles.swipeActionText}>{t.notDo}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.swipeAction, styles.swipeDelete]} onPress={confirmPermanentDelete}>
          <Trash2 size={20} color="#fff" strokeWidth={2} />
          <Text style={styles.swipeActionText}>{t.deleteTask}</Text>
        </TouchableOpacity>
      </View>
    )
  }

  function openDatePicker() {
    if (inTrash) return
    setPickerDate(todo.dueDate ? new Date(`${todo.dueDate}T00:00:00`) : new Date())
    setPendingDate(todo.dueDate ?? '')
    setDateOpen(true)
  }

  function commitDate() {
    onUpdateDueDate(todo.id, pendingDate)
    setDateOpen(false)
  }

  function handleDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === 'set' && selected) {
      setPickerDate(selected)
      if (Platform.OS === 'android') {
        onUpdateDueDate(todo.id, isoDate(selected))
        setDateOpen(false)
      } else {
        setPendingDate(isoDate(selected))
      }
    } else if (Platform.OS === 'android') {
      setDateOpen(false)
    }
  }

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      leftThreshold={40}
      rightThreshold={40}
      overshootLeft={true}
      overshootRight={true}
      friction={1}
      containerStyle={styles.swipeContainer}
      onSwipeableWillOpen={() => {
        setSwipeOpen(true)
        trackOpenSwipeable(swipeableRef, todo.id)
      }}
      onSwipeableWillClose={() => {
        setSwipeOpen(false)
        clearOpenSwipeable(todo.id)
      }}
    >
      <Pressable
        onTouchStart={onRowTouchStart}
        onTouchMove={onRowTouchMove}
        onPress={() => {
          if (touchMovedRef.current || swipeOpen) return
          // Reminders.app convention: tap on any row closes other rows'
          // open swipe menus before the tap action runs.
          closeOtherSwipeables(todo.id)
          if (inTrash && onToggleSelect) {
            onToggleSelect(todo.id)
            return
          }
          if (tapBehavior === 'expandIfHasSubs' && hasSubs) {
            setExpanded((v) => !v)
            return
          }
          handleToggle()
        }}
        onLongPress={() => {
          if (touchMovedRef.current || swipeOpen) return
          closeOtherSwipeables(todo.id)
          openDetails()
        }}
        delayLongPress={350}
        style={({ pressed }) => [
          styles.row,
          todo.done && styles.rowDone,
          // Trashed rows render dimmed in any view (trash filter or
          // mixed-in via the All filter), so the user can tell them
          // apart from done items at a glance.
          (inTrash || todo.trashed) && styles.rowTrashed,
          pressed && styles.rowPressed,
        ]}
      >
        {/* Layout-pass position capture for the Mochi pebble flight.
            Absolute-fill so it follows the row's bounds without adding
            layout, and pointerEvents:none so it never intercepts taps.
            measureInWindow inside onLayout is bulletproof across RN
            versions / production bundles, where ref-on-Pressable +
            measure-at-trigger-time has had spotty support. */}
        <View
          ref={rowMeasureRef}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
        {/* Always-on subtle row flash on done-transition. Sits above the
            row content via absolute positioning + pointerEvents:none so it
            doesn't intercept taps. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.rowFlash,
            { opacity: rowFlash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] }) },
          ]}
        />
        {!inTrash && hasSubs ? (
          <TouchableOpacity
            style={styles.expandToggle}
            onPress={() => setExpanded((v) => !v)}
            hitSlop={10}
            accessibilityLabel={t.subtasks}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
          >
            {expanded ? (
              <ChevronDown size={16} color={theme.label2} strokeWidth={2.5} />
            ) : (
              <ChevronRight size={16} color={theme.label2} strokeWidth={2.5} />
            )}
          </TouchableOpacity>
        ) : (
          <Animated.View style={{ transform: [{ scale: checkboxScale }] }}>
            <TouchableOpacity
              style={[
                styles.checkbox,
                todo.done && styles.checkboxDone,
                inTrash && selected && styles.checkboxSelected,
                todo.trashed && !todo.done && styles.checkboxRemoved,
              ]}
              onPress={inTrash && onToggleSelect ? () => onToggleSelect(todo.id) : handleToggle}
              disabled={inTrash && !onToggleSelect}
              hitSlop={10}
              accessibilityRole="checkbox"
              accessibilityState={
                inTrash && onToggleSelect
                  ? { checked: selected }
                  : { checked: todo.done }
              }
              accessibilityLabel={
                inTrash && onToggleSelect
                  ? `Select ${todo.text}`
                  : todo.done
                    ? `${todo.text}, completed. Mark as not done.`
                    : todo.trashed
                      ? `${todo.text}, removed.`
                      : `${todo.text}. Mark as done.`
              }
            >
              {todo.done || (inTrash && selected) ? (
                <Text style={styles.checkmark}>✓</Text>
              ) : todo.trashed ? (
                <Text style={styles.removedMark}>×</Text>
              ) : null}
            </TouchableOpacity>
          </Animated.View>
        )}

        <View style={styles.body}>
          <View style={styles.mainLine}>
            <Text
              style={[
                styles.text,
                todo.done && styles.textDone,
                todo.trashed && !todo.done && styles.textRemoved,
              ]}
              numberOfLines={3}
              suppressHighlighting
            >
              {todo.text}
            </Text>
            {/* Priority is now the top-right glance, swapped with
                the steps badge below. Reads as "what's the urgency"
                next to the title; steps progress drops into the
                meta row where the category chip lives. */}
            <View
              style={styles.priorityBtn}
              accessibilityLabel={`Priority ${todo.priority}${todo.recurrence ? ', recurring' : ''}`}
            >
              <PriorityDot level={todo.priority} size={11} />
            </View>
          </View>

          <View style={styles.metaLine}>
            <View style={styles.chip}>
              {cat && <CategoryIcon icon={cat.icon} size={11} color={cat.color} />}
              <Text style={[
                styles.chipText,
                cat
                  ? { color: cat.color, fontWeight: '600' }
                  : styles.chipTextMuted,
              ]}>
                {cat ? categoryLabel(cat, t) : t.noCategory}
              </Text>
            </View>

            {/* Date chip + separator are suppressed for today's rows on
                Home (the section header already says TODAY). Overdue
                rows on Home swap the formatted past date for a calm
                "carried over" label. */}
            {!(dateChipFormat === 'home-today' && (isToday || hasSubs)) && (
              <Text style={styles.metaSep}>·</Text>
            )}

            {!(dateChipFormat === 'home-today' && (isToday || hasSubs)) && (
            <View style={styles.chip}>
              {binFilterView ? (
                <Text style={[
                  styles.chipText,
                  todo.completionDate ? styles.chipTextDate : styles.chipTextMutedItalic,
                ]}>
                  {/* R5 — Skipped rows show "Not Do" instead of
                      "Done <date>" so the Done bin clearly
                      distinguishes them from completed rows. */}
                  {todo.status === 'notDo'
                    ? t.notDoChip
                    : todo.completionDate
                      ? `Done ${formatDisplayDate(todo.completionDate, t.locale).toLowerCase()}`
                      : 'No completion date'}
                </Text>
              ) : dateChipFormat === 'home-today' && overdue ? (
                <Text style={[styles.chipText, styles.chipTextOverdue]}>
                  carried over
                </Text>
              ) : (
                <Text style={[
                  styles.chipText,
                  overdue
                    ? styles.chipTextOverdue
                    : isToday
                      ? styles.chipTextToday
                      : !todo.dueDate
                        ? styles.chipTextMuted
                        : styles.chipTextDate,
                ]}>
                  {todo.dueDate
                    ? formatDisplayDate(todo.dueDate, t.locale)
                    : t.noDate}
                </Text>
              )}
              {todo.recurrence && (
                <LucideRepeat
                  size={11}
                  color={theme.label3}
                  strokeWidth={2}
                />
              )}
            </View>
            )}

            <View style={{ flex: 1 }} />

            {/* Steps progress (formerly top-right) lives down here
                with the rest of the meta — kept in the same right-
                edge spot where the priority dot used to sit. */}
            {!inTrash && hasSubs && (
              <View style={styles.progressPill}>
                <Text style={styles.progressPillText}>
                  {t.subtaskProgress(subsDoneCount, subs.length)}
                </Text>
              </View>
            )}
          </View>

          {expanded && detailsAvailable && !inTrash && visibleSubs.length > 0 && (
            <View style={styles.subList}>
              {visibleSubs.map((s) => {
                const sPriority: Priority = s.priority ?? 'medium'
                const sDue = s.dueDate ?? ''
                const sOverdue = !!sDue && !s.done && sDue < today
                const sIsToday = !!sDue && !s.done && sDue === today
                return (
                  <View
                    key={s.id}
                    ref={(r) => {
                      if (r) subMeasureRefs.current.set(s.id, r)
                      else subMeasureRefs.current.delete(s.id)
                    }}
                    collapsable={false}
                    style={styles.subRow}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                        // Fire the pebble flight from this sub's screen
                        // position when it's about to become done.
                        // sub.done reflects the PRE-toggle state here.
                        if (!s.done) fireSubFlight(s.id)
                        onToggleSubtask!(todo.id, s.id)
                      }}
                      hitSlop={10}
                      style={[styles.subCheckbox, s.done && styles.subCheckboxDone]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: s.done }}
                      accessibilityLabel={
                        s.done
                          ? `${s.text}, completed subtask. Mark as not done.`
                          : `${s.text}, subtask. Mark as done.`
                      }
                    >
                      {s.done && <Text style={styles.subCheckmark}>✓</Text>}
                    </TouchableOpacity>
                    <Text
                      style={[styles.subText, s.done && styles.subTextDone]}
                      numberOfLines={1}
                      onPress={() => openSubtaskEdit(s.id)}
                      suppressHighlighting
                    >
                      {s.text}
                    </Text>
                    {onUpdateSubtaskPriority && (
                      <TouchableOpacity
                        onPress={() => openSubtaskEdit(s.id)}
                        hitSlop={12}
                        style={styles.subPriorityBtn}
                      >
                        <PriorityDot level={sPriority} size={9} />
                      </TouchableOpacity>
                    )}
                    {onUpdateSubtaskDueDate &&
                      // Home's due-today mode hides the date chip on
                      // sub rows that are already done — the chip
                      // reads as redundant noise once the work is
                      // complete. Open subs still show their date.
                      !(subtaskDateFilter === 'due-today' && s.done) && (
                      <TouchableOpacity
                        onPress={() => openSubtaskEdit(s.id)}
                        hitSlop={12}
                        style={styles.subChip}
                      >
                        <Text style={[
                          styles.subChipText,
                          sOverdue
                            ? styles.chipTextOverdue
                            : sIsToday
                              ? styles.chipTextToday
                              : !sDue
                                ? styles.chipTextMuted
                                : styles.chipTextDate,
                        ]}>
                          {sDue ? formatDisplayDate(sDue, t.locale) : t.noDate}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )
              })}
            </View>
          )}
        </View>

        <PickerModal
          visible={priorityOpen}
          selectedKey={todo.priority}
          onSelect={(k) => onUpdatePriority(todo.id, k as Priority)}
          onClose={() => setPriorityOpen(false)}
          options={PRIORITY_VALUES.map((v) => ({
            key: v,
            label: t.priority[v],
            color: PRIORITY_COLORS[v],
            icon: <PriorityDot level={v} size={12} />,
          }))}
        />

        <PickerModal
          visible={categoryOpen}
          selectedKey={todo.category || ''}
          onSelect={(k) => onUpdateCategory(todo.id, k)}
          onClose={() => setCategoryOpen(false)}
          options={categories.map((c) => ({
            key: c.id,
            label: categoryLabel(c, t),
            color: c.color,
            icon: <CategoryIcon icon={c.icon} size={16} color={c.color} />,
          }))}
        />

        {dateOpen && Platform.OS === 'ios' && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setDateOpen(false)}>
            <TouchableOpacity
              style={styles.dateOverlay}
              onPress={() => setDateOpen(false)}
              activeOpacity={1}
            >
              <View
                style={styles.dateSheet}
                onStartShouldSetResponder={() => true}
              >
                {pendingDate ? (
                  <Text style={styles.datePendingLabel}>{fullDateLabel(pendingDate)}</Text>
                ) : (
                  <Text style={[styles.datePendingLabel, styles.datePendingLabelEmpty]}>{t.noDate}</Text>
                )}
                <DateTimePicker
                  value={pickerDate}
                  mode="date"
                  display="inline"
                  themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
                  onChange={handleDateChange}
                />
                <View style={styles.dateBtnRow}>
                  <TouchableOpacity onPress={() => setPendingDate('')}>
                    <Text style={styles.dateClear}>{t.clear}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={commitDate}>
                    <Text style={styles.dateDone}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </Modal>
        )}
        {dateOpen && Platform.OS === 'android' && (
          <DateTimePicker
            value={pickerDate}
            mode="date"
            display="default"
            onChange={handleDateChange}
          />
        )}

        {/* Per-subtask priority picker (shared, scoped by subPriorityForId). */}
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

        {/* Per-subtask date picker (iOS sheet / Android native). */}
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

        {detailsAvailable && (
          <TaskDetailsSheet
            visible={detailsOpen}
            todo={todo}
            categories={categories}
            initialSubtaskEditId={pendingSubtaskEditId}
            onClose={() => {
              setDetailsOpen(false)
              setPendingSubtaskEditId(null)
            }}
            onUpdateText={onUpdateText}
            onUpdateNotes={onUpdateNotes}
            onUpdatePriority={onUpdatePriority}
            onUpdateDueDate={onUpdateDueDate}
            onUpdateCategory={onUpdateCategory}
            onUpdateRecurrence={onUpdateRecurrence ?? (() => {})}
            onUpdateReminder={onUpdateReminder}
            onMoveToTrash={onMoveToTrash}
            onPermanentDelete={onPermanentDelete}
            onMoveSeriesFutureToTrash={onMoveSeriesFutureToTrash}
            onApplySeriesFutureEdits={onApplySeriesFutureEdits}
            onDetachFromSeries={onDetachFromSeries}
            onApplyRecurrenceChange={onApplyRecurrenceChange}
            onAddSubtask={onAddSubtask!}
            onToggleSubtask={onToggleSubtask!}
            onUpdateSubtaskText={onUpdateSubtaskText!}
            onUpdateSubtaskPriority={onUpdateSubtaskPriority}
            onUpdateSubtaskDueDate={onUpdateSubtaskDueDate}
            onRemoveSubtask={onRemoveSubtask!}
            onClearSubtasks={onClearSubtasks}
            agentEnabled={agentEnabled}
          />
        )}
      </Pressable>
    </Swipeable>
  )
}


export default memo(TaskItem);
