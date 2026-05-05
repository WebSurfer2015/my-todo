import React, { memo, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Platform, Modal, Alert, Pressable, ActionSheetIOS } from 'react-native'
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
import { useLang } from '../LangContext'

interface Props {
  todo: Todo
  inTrash?: boolean
  categories: CategoryDef[]
  density?: Density
  onToggle: (id: number) => void
  onMoveToTrash: (id: number) => void
  onRestore?: (id: number) => void
  onPermanentDelete?: (id: number) => void
  onUpdatePriority: (id: number, priority: Priority) => void
  onUpdateDueDate: (id: number, dueDate: string) => void
  onUpdateCategory: (id: number, category: Category) => void
  onUpdateText: (id: number, text: string) => void
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
  todo, inTrash = false, categories, density = 'comfortable',
  onToggle, onMoveToTrash, onRestore, onPermanentDelete,
  onUpdatePriority, onUpdateDueDate, onUpdateCategory, onUpdateText,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme, density), [theme, density])
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(todo.text)
  const [pickerDate, setPickerDate] = useState<Date>(() =>
    todo.dueDate ? new Date(`${todo.dueDate}T00:00:00`) : new Date()
  )
  const inputRef = useRef<TextInput>(null)
  const swipeableRef = useRef<Swipeable>(null)
  const [swipeOpen, setSwipeOpen] = useState(false)

  const overdue = !!todo.dueDate && !todo.done && todo.dueDate < todayLocal()
  const cat = todo.category ? categories.find((c) => c.id === todo.category) : undefined

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function startEdit() {
    swipeableRef.current?.close()
    if (!inTrash) setEditing(true)
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
      <TouchableOpacity style={[styles.swipeAction, styles.swipeEdit]} onPress={startEdit}>
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

  function commitEdit() {
    const trimmed = editText.trim()
    if (trimmed && trimmed !== todo.text) onUpdateText(todo.id, trimmed)
    else setEditText(todo.text)
    setEditing(false)
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
        <TouchableOpacity
          style={[styles.checkbox, todo.done && styles.checkboxDone]}
          onPress={handleToggle}
          disabled={inTrash}
          hitSlop={10}
        >
          {todo.done && <Text style={styles.checkmark}>✓</Text>}
        </TouchableOpacity>

        <View style={styles.body}>
          <View style={styles.mainLine}>
            {editing && !inTrash ? (
              <TextInput
                ref={inputRef}
                style={styles.textEdit}
                value={editText}
                onChangeText={setEditText}
                onBlur={commitEdit}
                onSubmitEditing={commitEdit}
                returnKeyType="done"
                maxLength={200}
              />
            ) : (
              <Text
                style={[styles.text, todo.done && styles.textDone]}
                numberOfLines={3}
                onPress={() => !todo.done && !inTrash && setEditing(true)}
              >
                {todo.text}
              </Text>
            )}
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
                overdue ? styles.chipTextOverdue : !todo.dueDate ? styles.chipTextMuted : styles.chipTextDate,
              ]}>
                {todo.dueDate
                  ? (overdue ? t.overdue : '') + formatDisplayDate(todo.dueDate, t.locale)
                  : t.noDate}
              </Text>
            </TouchableOpacity>

          </View>
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
                    <Text style={styles.dateClear}>Clear</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={commitDate}>
                    <Text style={styles.dateDone}>Done</Text>
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
