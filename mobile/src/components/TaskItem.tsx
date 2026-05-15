import React, { memo, useMemo, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal, Alert, Pressable, ActionSheetIOS } from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import * as Haptics from 'expo-haptics'
import Svg, { Path, Polyline } from 'react-native-svg'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { Category, Priority, Todo, PRIORITY_VALUES, PRIORITY_COLORS } from '../types'
import { CategoryDef, categoryLabel } from '../categories'
import type { Density } from '../profile'
import { formatDisplayDate, todayLocal, isoDate } from '../utils'
import { useTheme, ThemeColors } from '../theme'
import PriorityDot from './PriorityDot'
import CategoryIcon from './CategoryIcon'
import PickerModal from './PickerModal'
import TaskDetailsSheet from './TaskDetailsSheet'
import { useLang } from '../LangContext'

export type SubtaskVisibility = 'all' | 'open' | 'done'

interface Props {
  todo: Todo
  inTrash?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
  categories: CategoryDef[]
  density?: Density
  subtaskVisibility?: SubtaskVisibility
  onToggle: (id: string) => void
  onMoveToTrash: (id: string) => void
  onRestore?: (id: string) => void
  onPermanentDelete?: (id: string) => void
  onUpdatePriority: (id: string, priority: Priority) => void
  onUpdateDueDate: (id: string, dueDate: string) => void
  onUpdateCategory: (id: string, category: Category) => void
  onUpdateText: (id: string, text: string) => void
  onAddSubtask?: (id: string, text: string, priority?: Priority, dueDate?: string) => void
  onToggleSubtask?: (id: string, subId: string) => void
  onUpdateSubtaskText?: (id: string, subId: string, text: string) => void
  onUpdateSubtaskPriority?: (id: string, subId: string, priority: Priority) => void
  onUpdateSubtaskDueDate?: (id: string, subId: string, dueDate: string) => void
  onRemoveSubtask?: (id: string, subId: string) => void
}

function PencilIcon({ size = 20, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 20h9" />
      <Path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
    </Svg>
  )
}

function TrashIcon({ size = 20, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="3,6 5,6 21,6" />
      <Path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <Path d="M10 11v6M14 11v6" />
      <Path d="M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2" />
    </Svg>
  )
}

function RestoreIcon({ size = 20, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 14L4 9l5-5" />
      <Path d="M4 9h11a5 5 0 010 10h-2" />
    </Svg>
  )
}

function TaskItem({
  todo, inTrash = false, selected = false, onToggleSelect,
  categories, density = 'comfortable',
  subtaskVisibility = 'all',
  onToggle, onMoveToTrash, onRestore, onPermanentDelete,
  onUpdatePriority, onUpdateDueDate, onUpdateCategory, onUpdateText,
  onAddSubtask, onToggleSubtask, onUpdateSubtaskText,
  onUpdateSubtaskPriority, onUpdateSubtaskDueDate, onRemoveSubtask,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme, density), [theme, density])
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
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
  const swipeableRef = useRef<Swipeable>(null)
  const [swipeOpen, setSwipeOpen] = useState(false)

  const today = todayLocal()
  const overdue = !!todo.dueDate && !todo.done && todo.dueDate < today
  const isToday = !!todo.dueDate && !todo.done && todo.dueDate === today
  const cat = todo.category ? categories.find((c) => c.id === todo.category) : undefined

  function openDetails() {
    swipeableRef.current?.close()
    if (!inTrash && detailsAvailable) setDetailsOpen(true)
  }

  function handleToggle() {
    if (inTrash) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    onToggle(todo.id)
  }

  function handleMoveToTrash() {
    swipeableRef.current?.close()
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    onMoveToTrash(todo.id)
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
    const opts = [t.moveToTrash, cancel]
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: opts, cancelButtonIndex: 1, destructiveButtonIndex: 0 },
        (i) => { if (i === 0) handleMoveToTrash() },
      )
    } else {
      Alert.alert(todo.text, undefined, [
        { text: t.moveToTrash, style: 'destructive', onPress: handleMoveToTrash },
        { text: cancel, style: 'cancel' },
      ])
    }
  }

  // iOS conventions: leading swipe (rightward, reveals leftActions) → non-destructive.
  // Trailing swipe (leftward, reveals rightActions) → destructive.
  function renderLeftActions() {
    if (inTrash) {
      return (
        <TouchableOpacity style={[styles.swipeAction, styles.swipeRestore]} onPress={handleRestore}>
          <RestoreIcon />
          <Text style={styles.swipeActionText}>{t.restoreTask}</Text>
        </TouchableOpacity>
      )
    }
    return (
      <TouchableOpacity style={[styles.swipeAction, styles.swipeEdit]} onPress={openDetails}>
        <PencilIcon />
        <Text style={styles.swipeActionText}>{t.editTask}</Text>
      </TouchableOpacity>
    )
  }

  function renderRightActions() {
    if (inTrash) {
      return (
        <TouchableOpacity style={[styles.swipeAction, styles.swipeDelete]} onPress={confirmPermanentDelete}>
          <TrashIcon />
          <Text style={styles.swipeActionText}>{t.deletePermanently}</Text>
        </TouchableOpacity>
      )
    }
    return (
      <TouchableOpacity style={[styles.swipeAction, styles.swipeTrash]} onPress={handleMoveToTrash}>
        <TrashIcon />
        <Text style={styles.swipeActionText}>{t.moveToTrash}</Text>
      </TouchableOpacity>
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
      overshootLeft={false}
      overshootRight={false}
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
          inTrash && styles.rowTrashed,
          pressed && styles.rowPressed,
        ]}
      >
        {!inTrash && hasSubs ? (
          <TouchableOpacity
            style={[
              styles.expandToggle,
              expanded && styles.expandToggleExpanded,
              todo.done && styles.expandToggleDone,
            ]}
            onPress={() => setExpanded((v) => !v)}
            hitSlop={10}
            accessibilityLabel={t.subtasks}
          >
            <Text style={[
              styles.expandToggleChev,
              todo.done && styles.expandToggleChevDone,
            ]}>{expanded ? '▼' : '▶'}</Text>
            <Text style={[
              styles.expandToggleCount,
              todo.done && styles.expandToggleCountDone,
            ]}>
              {t.subtaskProgress(subsDoneCount, subs.length)}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.checkbox,
              todo.done && styles.checkboxDone,
              inTrash && selected && styles.checkboxSelected,
            ]}
            onPress={inTrash && onToggleSelect ? () => onToggleSelect(todo.id) : handleToggle}
            disabled={inTrash && !onToggleSelect}
            hitSlop={10}
            accessibilityRole={inTrash && onToggleSelect ? 'checkbox' : 'button'}
            accessibilityState={inTrash && onToggleSelect ? { checked: selected } : undefined}
          >
            {(todo.done || (inTrash && selected)) && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
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
            <TouchableOpacity onPress={() => !inTrash && setPriorityOpen(true)} style={styles.priorityBtn} hitSlop={10} disabled={inTrash}>
              <PriorityDot level={todo.priority} size={11} />
            </TouchableOpacity>
          </View>

          <View style={styles.metaLine}>
            <TouchableOpacity
              style={styles.chip}
              onPress={() => !inTrash && setCategoryOpen(true)}
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

            <TouchableOpacity
              style={styles.chip}
              onPress={openDatePicker}
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
                    >
                      {s.done && <Text style={styles.subCheckmark}>✓</Text>}
                    </TouchableOpacity>
                    <View style={styles.subBody}>
                      <View style={styles.subMain}>
                        <Text
                          style={[styles.subText, s.done && styles.subTextDone]}
                          numberOfLines={2}
                          onPress={openDetails}
                          suppressHighlighting
                        >
                          {s.text}
                        </Text>
                        {onUpdateSubtaskPriority && (
                          <TouchableOpacity
                            onPress={() => setSubPriorityForId(s.id)}
                            hitSlop={8}
                            style={styles.subPriorityBtn}
                          >
                            <PriorityDot level={sPriority} size={9} />
                          </TouchableOpacity>
                        )}
                      </View>
                      {onUpdateSubtaskDueDate && (
                        <View style={styles.subMeta}>
                          <TouchableOpacity
                            onPress={() => {
                              setSubPickerDate(sDue ? new Date(`${sDue}T00:00:00`) : new Date())
                              setSubDateForId(s.id)
                            }}
                            hitSlop={8}
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
                        </View>
                      )}
                    </View>
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
            onClose={() => setDetailsOpen(false)}
            onUpdateText={onUpdateText}
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
    rowTrashed: { opacity: 0.7 },
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
      fontSize: compact ? 14 : 16,
      color: c.label,
      lineHeight: compact ? 19 : 21,
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
      fontSize: 12,
      fontWeight: '500',
    },
    chipTextMuted: {
      color: c.gray3,
      fontStyle: 'italic',
      fontWeight: '500',
    },
    chipTextDate: {
      color: c.label3,
      fontWeight: '500',
    },
    chipTextOverdue: {
      color: c.red,
      fontWeight: '600',
    },
    chipTextToday: {
      color: c.orange,
      fontWeight: '600',
    },
    expandToggle: {
      minWidth: 38,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.separator,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    expandToggleExpanded: {
      borderColor: c.label3,
    },
    expandToggleDone: {
      borderColor: c.blue,
    },
    expandToggleChev: {
      fontSize: 9,
      lineHeight: 12,
      color: c.label2,
    },
    expandToggleChevDone: {
      color: c.blue,
    },
    expandToggleCount: {
      fontSize: 10,
      fontWeight: '700',
      color: c.label2,
      fontVariant: ['tabular-nums'],
      lineHeight: 12,
    },
    expandToggleCountDone: {
      color: c.blue,
    },
    subList: {
      marginTop: 6,
      paddingTop: 6,
      paddingLeft: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.separator,
      gap: 4,
    },
    subRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 4,
      paddingLeft: 8,
      borderLeftWidth: 2,
      borderLeftColor: c.separator,
      borderRadius: 2,
    },
    subBody: {
      flex: 1,
      gap: 2,
    },
    subMain: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    subPriorityBtn: {
      padding: 3,
    },
    subMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
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
      marginTop: 2,
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
      color: c.label,
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
    swipeTrash:   { backgroundColor: c.red },
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
      color: c.red,
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
