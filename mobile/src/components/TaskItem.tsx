import React, { memo, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal, Alert, Pressable, ActionSheetIOS, Animated, Easing, Dimensions } from 'react-native'

const SCREEN_WIDTH = Dimensions.get('window').width
const FULL_SWIPE_THRESHOLD = SCREEN_WIDTH * 0.5

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
import { Audio } from 'expo-av'
import { Repeat as LucideRepeat, ChevronRight, ChevronDown, Trash2, RotateCcw } from 'lucide-react-native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { Category, Priority, Recurrence, Todo, PRIORITY_VALUES, PRIORITY_COLORS } from '../types'
import { CategoryDef, categoryLabel } from '../categories'
import type { Density } from '../profile'
import { formatDisplayDate, todayLocal, isoDate } from '../utils'
import { useTheme, ThemeColors } from '../theme'
import PriorityDot from './PriorityDot'
import CategoryIcon from './CategoryIcon'
import PickerModal from './PickerModal'
import TaskDetailsSheet from './TaskDetailsSheet'
import { useLang } from '../LangContext'
import { useReduceMotion } from '../useReduceMotion'

export type SubtaskVisibility = 'all' | 'open' | 'done'

interface Props {
  todo: Todo
  inTrash?: boolean
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
  onMoveSeriesFutureToTrash?: (id: string) => void
  onApplySeriesFutureEdits?: (
    id: string,
    fields: { text?: string; priority?: Priority; category?: Category | undefined },
  ) => void
  onRestore?: (id: string) => void
  onPermanentDelete?: (id: string) => void
  onUpdatePriority: (id: string, priority: Priority) => void
  onUpdateDueDate: (id: string, dueDate: string) => void
  onSnooze?: (id: string, daysFromToday: number) => void
  onUpdateCategory: (id: string, category: Category) => void
  onUpdateText: (id: string, text: string) => void
  onUpdateRecurrence?: (id: string, recurrence: Recurrence | undefined) => void
  onAddSubtask?: (id: string, text: string, priority?: Priority, dueDate?: string) => void
  onToggleSubtask?: (id: string, subId: string) => void
  onUpdateSubtaskText?: (id: string, subId: string, text: string) => void
  onUpdateSubtaskPriority?: (id: string, subId: string, priority: Priority) => void
  onUpdateSubtaskDueDate?: (id: string, subId: string, dueDate: string) => void
  onRemoveSubtask?: (id: string, subId: string) => void
}

function TaskItem({
  todo, inTrash = false, selected = false, onToggleSelect,
  categories, density = 'comfortable', celebrate = true, playSound = true,
  subtaskVisibility = 'all',
  onToggle, onMoveToTrash, onMoveSeriesFutureToTrash, onApplySeriesFutureEdits, onRestore, onPermanentDelete,
  onUpdatePriority, onUpdateDueDate, onSnooze, onUpdateCategory, onUpdateText, onUpdateRecurrence,
  onAddSubtask, onToggleSubtask, onUpdateSubtaskText,
  onUpdateSubtaskPriority, onUpdateSubtaskDueDate, onRemoveSubtask,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const reduceMotion = useReduceMotion()
  const styles = useMemo(() => makeStyles(theme, density), [theme, density])
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  // When set, TaskDetailsSheet opens jumped straight into the named
  // subtask's edit view. Cleared on close.
  const [pendingSubtaskEditId, setPendingSubtaskEditId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  // Shared per-subtask pickers — track which sub has the modal open.
  const [subPriorityForId, setSubPriorityForId] = useState<string | null>(null)
  const [subDateForId, setSubDateForId] = useState<string | null>(null)
  const [subPickerDate, setSubPickerDate] = useState<Date>(new Date())
  const subs = todo.subtasks ?? []
  const hasSubs = subs.length > 0
  const subsDoneCount = subs.filter((s) => s.done).length
  const detailsAvailable =
    !!onAddSubtask && !!onToggleSubtask && !!onUpdateSubtaskText && !!onRemoveSubtask
  const visibleSubs =
    subtaskVisibility === 'open'
      ? subs.filter((s) => !s.done)
      : subtaskVisibility === 'done'
        ? subs.filter((s) => s.done)
        : subs
  const [pickerDate, setPickerDate] = useState<Date>(() =>
    todo.dueDate ? new Date(`${todo.dueDate}T00:00:00`) : new Date()
  )

  // Calm completion animation + sound — fires when a task transitions to done.
  // Both the row-flash and the checkbox bounce are skipped when the OS-level
  // Reduce Motion accessibility setting is on; the haptic + sound still fire.
  const checkboxScale = useRef(new Animated.Value(1)).current
  const rowFlash = useRef(new Animated.Value(0)).current
  const prevDoneRef = useRef(todo.done)
  useEffect(() => {
    if (todo.done && !prevDoneRef.current) {
      if (!reduceMotion) {
        // Subtle row flash — 100ms in, 240ms out, max opacity 0.45.
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
        if (celebrate) {
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
        }
      }
      if (playSound) {
        // Replace assets/sounds/complete.wav with a calm chime for an audible cue.
        Audio.Sound.createAsync(require('../../assets/sounds/complete.wav'), { shouldPlay: true })
          .then(({ sound }) => {
            sound.setOnPlaybackStatusUpdate((status) => {
              if ('isLoaded' in status && status.isLoaded && status.didJustFinish) {
                sound.unloadAsync().catch(() => {})
              }
            })
          })
          .catch(() => {
            // Silent fail — sound is optional.
          })
      }
    }
    prevDoneRef.current = todo.done
  }, [todo.done, celebrate, playSound, reduceMotion, checkboxScale, rowFlash])
  const swipeableRef = useRef<Swipeable>(null)
  const [swipeOpen, setSwipeOpen] = useState(false)

  const today = todayLocal()
  const overdue = !!todo.dueDate && !todo.done && todo.dueDate < today
  const isToday = !!todo.dueDate && !todo.done && todo.dueDate === today
  const cat = todo.category ? categories.find((c) => c.id === todo.category) : undefined

  function openDetails() {
    swipeableRef.current?.close()
    setPendingSubtaskEditId(null)
    if (!inTrash && detailsAvailable) setDetailsOpen(true)
  }

  function openSubtaskEdit(subId: string) {
    swipeableRef.current?.close()
    if (inTrash || !detailsAvailable) return
    setPendingSubtaskEditId(subId)
    setDetailsOpen(true)
  }

  function handleToggle() {
    if (inTrash) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    onToggle(todo.id)
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
  // rows get a snooze menu (Tomorrow / Next week / Pick a date) — the
  // single-most-frequent affordance for procrastinators who can't face
  // an item today but don't want to abandon it.
  function handleLongPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    const cancel = t.cancel
    if (inTrash) {
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
    if (!onSnooze) return
    const opts = ['Tomorrow', 'Next week', 'Pick a date…', cancel]
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: opts, cancelButtonIndex: 3, title: 'Snooze' },
        (i) => {
          if (i === 0) onSnooze(todo.id, 1)
          else if (i === 1) onSnooze(todo.id, 7)
          else if (i === 2) openDatePicker()
        },
      )
    } else {
      Alert.alert('Snooze', undefined, [
        { text: 'Tomorrow', onPress: () => onSnooze(todo.id, 1) },
        { text: 'Next week', onPress: () => onSnooze(todo.id, 7) },
        { text: 'Pick a date…', onPress: openDatePicker },
        { text: cancel, style: 'cancel' },
      ])
    }
  }

  // iOS conventions: leading swipe (rightward, reveals leftActions) → non-destructive.
  // Trailing swipe (leftward, reveals rightActions) → destructive.
  // Full-swipe auto-commit: dragging more than half the screen triggers the action.
  function renderLeftActions(_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) {
    if (inTrash) {
      return (
        <TouchableOpacity style={[styles.swipeAction, styles.swipeRestore]} onPress={handleRestore}>
          <RotateCcw size={20} color="#fff" strokeWidth={2} />
          <Text style={styles.swipeActionText}>{t.restoreTask}</Text>
        </TouchableOpacity>
      )
    }
    return (
      <>
        <FullSwipeWatcher dragX={dragX} direction="left" onFullSwipe={handleMarkDone} />
        <TouchableOpacity style={[styles.swipeAction, styles.swipeMarkDone]} onPress={handleMarkDone}>
          <Text style={styles.swipeActionText}>{todo.done ? t.markNotDone : t.markDone}</Text>
        </TouchableOpacity>
      </>
    )
  }

  function renderRightActions(_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) {
    if (inTrash) {
      return (
        <TouchableOpacity style={[styles.swipeAction, styles.swipeDelete]} onPress={confirmPermanentDelete}>
          <Trash2 size={20} color="#fff" strokeWidth={2} />
          <Text style={styles.swipeActionText}>{t.deletePermanently}</Text>
        </TouchableOpacity>
      )
    }
    return (
      <>
        <FullSwipeWatcher dragX={dragX} direction="right" onFullSwipe={handleMoveToTrash} />
        <TouchableOpacity style={[styles.swipeAction, styles.swipeTrash]} onPress={handleMoveToTrash}>
          <Trash2 size={20} color="#fff" strokeWidth={2} />
          <Text style={styles.swipeActionText}>{t.moveToTrash}</Text>
        </TouchableOpacity>
      </>
    )
  }

  function openDatePicker() {
    if (inTrash) return
    setPickerDate(todo.dueDate ? new Date(`${todo.dueDate}T00:00:00`) : new Date())
    setDateOpen(true)
  }

  function commitDate() {
    onUpdateDueDate(todo.id, isoDate(pickerDate))
    setDateOpen(false)
  }

  function handleDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === 'set' && selected) {
      setPickerDate(selected)
      if (Platform.OS === 'android') {
        onUpdateDueDate(todo.id, isoDate(selected))
        setDateOpen(false)
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
      friction={2}
      containerStyle={styles.swipeContainer}
      onSwipeableWillOpen={() => setSwipeOpen(true)}
      onSwipeableWillClose={() => setSwipeOpen(false)}
    >
      <Pressable
        onLongPress={swipeOpen ? undefined : handleLongPress}
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
                    : `${todo.text}. Mark as done.`
              }
            >
              {(todo.done || (inTrash && selected)) && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>
          </Animated.View>
        )}

        <View style={styles.body}>
          <View style={styles.mainLine}>
            <Text
              style={[styles.text, todo.done && styles.textDone]}
              numberOfLines={3}
              onPress={openDetails}
              suppressHighlighting
            >
              {todo.text}
            </Text>
            {!inTrash && hasSubs && (
              <View style={styles.progressPill}>
                <Text style={styles.progressPillText}>
                  {t.subtaskProgress(subsDoneCount, subs.length)}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.metaLine}>
            <TouchableOpacity
              style={styles.chip}
              onPress={openDetails}
              hitSlop={10}
              disabled={inTrash}
            >
              {cat && <CategoryIcon icon={cat.icon} size={11} color={cat.color} />}
              <Text style={[
                styles.chipText,
                cat
                  ? { color: cat.color, fontWeight: '600' }
                  : styles.chipTextMuted,
              ]}>
                {cat ? categoryLabel(cat, t) : t.noCategory}
              </Text>
            </TouchableOpacity>

            <Text style={styles.metaSep}>·</Text>

            <TouchableOpacity
              style={styles.chip}
              onPress={openDetails}
              hitSlop={10}
              disabled={inTrash}
            >
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
              {todo.recurrence && (
                <LucideRepeat
                  size={11}
                  color={theme.label3}
                  strokeWidth={2}
                />
              )}
            </TouchableOpacity>

            <View style={{ flex: 1 }} />

            <TouchableOpacity
              onPress={openDetails}
              style={styles.priorityBtn}
              hitSlop={10}
              disabled={inTrash}
              accessibilityRole="button"
              accessibilityLabel={`Priority ${todo.priority}${todo.recurrence ? ', recurring' : ''}. Open task details.`}
            >
              <PriorityDot level={todo.priority} size={11} />
            </TouchableOpacity>
          </View>

          {expanded && detailsAvailable && !inTrash && visibleSubs.length > 0 && (
            <View style={styles.subList}>
              {visibleSubs.map((s) => {
                const sPriority: Priority = s.priority ?? 'medium'
                const sDue = s.dueDate ?? ''
                const sOverdue = !!sDue && !s.done && sDue < today
                const sIsToday = !!sDue && !s.done && sDue === today
                return (
                  <View key={s.id} style={styles.subRow}>
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
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
                    {onUpdateSubtaskDueDate && (
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
                <DateTimePicker
                  value={pickerDate}
                  mode="date"
                  display="inline"
                  themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
                  onChange={handleDateChange}
                />
                <View style={styles.dateBtnRow}>
                  <TouchableOpacity onPress={() => { onUpdateDueDate(todo.id, ''); setDateOpen(false) }}>
                    <Text style={styles.dateClear}>{t.clear}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={commitDate}>
                    <Text style={styles.dateDone}>{t.done}</Text>
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
            onUpdatePriority={onUpdatePriority}
            onUpdateDueDate={onUpdateDueDate}
            onUpdateCategory={onUpdateCategory}
            onUpdateRecurrence={onUpdateRecurrence ?? (() => {})}
            onMoveToTrash={onMoveToTrash}
            onPermanentDelete={onPermanentDelete}
            onMoveSeriesFutureToTrash={onMoveSeriesFutureToTrash}
            onApplySeriesFutureEdits={onApplySeriesFutureEdits}
            onAddSubtask={onAddSubtask!}
            onToggleSubtask={onToggleSubtask!}
            onUpdateSubtaskText={onUpdateSubtaskText!}
            onUpdateSubtaskPriority={onUpdateSubtaskPriority}
            onUpdateSubtaskDueDate={onUpdateSubtaskDueDate}
            onRemoveSubtask={onRemoveSubtask!}
          />
        )}
      </Pressable>
    </Swipeable>
  )
}

function makeStyles(c: ThemeColors, density: Density) {
  const compact = density === 'compact'
  return StyleSheet.create({
    rowFlash: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.primarySoft,
      borderRadius: 0,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: compact ? 7 : 12,
      paddingLeft: 16,
      paddingRight: 16,
      backgroundColor: c.card,
      gap: 10,
      overflow: 'hidden',
    },
    rowDone: {},
    rowTrashed: { opacity: 0.55 },
    rowPressed: { backgroundColor: c.bg },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: c.gray3,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    checkboxDone: {
      backgroundColor: c.blue,
      borderColor: c.blue,
    },
    checkboxSelected: {
      backgroundColor: c.blue,
      borderColor: c.blue,
    },
    checkmark: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '700',
      lineHeight: 15,
    },
    body: {
      flex: 1,
      gap: compact ? 1 : 4,
    },
    mainLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    text: {
      flex: 1,
      // Bumped title weight so it carries the row visually; the meta
      // chips below are intentionally smaller/dimmer so they read as
      // secondary information.
      fontSize: compact ? 15 : 17,
      fontWeight: '500',
      color: c.label,
      lineHeight: compact ? 20 : 22,
      letterSpacing: -0.3,
    },
    textDone: {
      color: c.label3,
      textDecorationLine: 'line-through',
    },
    textEdit: {
      flex: 1,
      fontSize: 16,
      color: c.label,
      lineHeight: 21,
      letterSpacing: -0.3,
      backgroundColor: c.bg,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    priorityBtn: {
      padding: 4,
    },
    metaLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      flexWrap: 'wrap',
      marginLeft: -4,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 5,
    },
    chipText: {
      // One step smaller than the title's secondary line so the meta
      // row reads as supporting context, not headline content.
      fontSize: 11,
      fontWeight: '500',
    },
    chipTextMuted: {
      color: c.label3,
      fontWeight: '500',
    },
    chipTextDate: {
      color: c.label3,
      fontWeight: '500',
    },
    chipTextOverdue: {
      color: c.red,
      fontWeight: '700',
    },
    chipTextToday: {
      color: c.orange,
      fontWeight: '700',
    },
    expandToggle: {
      width: 22,
      height: compact ? 19 : 21,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    metaSep: { color: c.label3, fontSize: 11, marginHorizontal: 2 },
    progressPill: {
      marginLeft: 'auto',
      paddingHorizontal: 8,
      paddingVertical: 1,
      borderRadius: 999,
      backgroundColor: c.primarySoft,
    },
    progressPillText: {
      fontSize: 10,
      fontWeight: '700',
      color: c.primary,
      fontVariant: ['tabular-nums'],
      lineHeight: 13,
    },
    subList: {
      marginTop: 4,
      gap: 2,
    },
    subRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 4,
      // Indented to read as nested under the parent task, not as a peer.
      paddingLeft: 28,
    },
    subPriorityBtn: {
      padding: 3,
    },
    subChip: {
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
    },
    subChipText: {
      fontSize: 11,
      fontWeight: '500',
    },
    subCheckbox: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: c.gray3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subCheckboxDone: {
      backgroundColor: c.blue,
      borderColor: c.blue,
    },
    subCheckmark: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '700',
      lineHeight: 13,
    },
    subText: {
      flex: 1,
      fontSize: 14,
      // Lighter weight than the parent (which is 500/600) so the
      // hierarchy reads correctly when expanded.
      fontWeight: '400',
      color: c.label2,
      lineHeight: 19,
    },
    subTextDone: {
      color: c.label3,
      textDecorationLine: 'line-through',
    },
    swipeContainer: {
      overflow: 'hidden',
    },
    swipeAction: {
      width: 86,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    swipeEdit:    { backgroundColor: c.blue },
    swipeMarkDone: { backgroundColor: c.green },
    // swipeTrash sends a row to the reversible 30-day bin (same destination
    // as the checkbox/Mark-done). Calm muted sage — red is reserved for
    // truly irreversible actions (Empty bin, Delete permanently).
    swipeTrash:   { backgroundColor: c.gray },
    swipeRestore: { backgroundColor: c.green },
    swipeDelete:  { backgroundColor: c.red },
    swipeActionText: {
      color: '#fff',
      fontSize: 13,
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
    dateClear: {
      color: c.label2,
      fontSize: 16,
      fontWeight: '500',
    },
    dateDone: {
      color: c.blue,
      fontSize: 16,
      fontWeight: '600',
    },
  })
}

export default memo(TaskItem)
