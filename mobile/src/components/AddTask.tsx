import React, { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react'
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Modal, Platform } from 'react-native'
import * as Haptics from 'expo-haptics'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import Svg, { Rect, Path } from 'react-native-svg'
import { Category, Priority, PRIORITY_VALUES, PRIORITY_COLORS } from '../types'
import { CategoryDef, categoryLabel } from '../categories'
import { useTheme, ThemeColors } from '../theme'
import PriorityDot from './PriorityDot'
import CategoryIcon from './CategoryIcon'
import PickerModal from './PickerModal'
import { useLang } from '../LangContext'
import { formatDisplayDate, isoDate } from '../utils'

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
  onAdd: (text: string, priority: Priority, dueDate: string, category?: Category) => void
  categories: CategoryDef[]
  defaultCategory: Category
}

export interface AddTaskHandle {
  focus: () => void
}

const AddTask = forwardRef<AddTaskHandle, Props>(function AddTask({ onAdd, categories, defaultCategory }, ref) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const [text, setText] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [category, setCategory] = useState<Category>(defaultCategory)
  const [dueDate, setDueDate] = useState('')
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [pickerDate, setPickerDate] = useState<Date>(new Date())
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<TextInput>(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  useEffect(() => { setCategory(defaultCategory) }, [defaultCategory])

  const activeCat = categories.find((c) => c.id === category) ?? categories[0]

  function submit() {
    const trimmed = text.trim()
    if (!trimmed || !activeCat) return
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    onAdd(trimmed, priority, dueDate, activeCat.id)
    setText('')
    setPriority('medium')
    setDueDate('')
    setCategory(defaultCategory)
  }

  function openDatePicker() {
    setPickerDate(dueDate ? new Date(`${dueDate}T00:00:00`) : new Date())
    setDateOpen(true)
  }

  function commitDate() {
    setDueDate(isoDate(pickerDate))
    setDateOpen(false)
  }

  function handleDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === 'set' && selected) {
      setPickerDate(selected)
      if (Platform.OS === 'android') {
        setDueDate(isoDate(selected))
        setDateOpen(false)
      }
    } else if (Platform.OS === 'android') {
      setDateOpen(false)
    }
  }

  return (
    <View style={styles.row}>
      <View style={[styles.inputWrap, focused && styles.inputWrapFocused]}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => setCategoryOpen(true)}
          hitSlop={6}
        >
          {activeCat && <CategoryIcon icon={activeCat.icon} size={18} color={activeCat.color} />}
        </TouchableOpacity>

        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder={t.addPlaceholder}
          placeholderTextColor={theme.gray3}
          value={text}
          onChangeText={setText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={submit}
          returnKeyType="done"
          maxLength={200}
          keyboardType="default"
          autoCorrect={false}
        />

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => setPriorityOpen(true)}
          hitSlop={6}
        >
          <PriorityDot level={priority} size={13} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dateBtn, dueDate ? styles.dateBtnHasDate : null]}
          onPress={openDatePicker}
          hitSlop={6}
        >
          <CalendarIcon size={16} color={dueDate ? theme.blue : theme.gray3} />
          {dueDate ? (
            <Text style={[styles.dateLabel, { color: theme.blue }]} numberOfLines={1}>
              {formatDisplayDate(dueDate, t.locale)}
            </Text>
          ) : null}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.addBtn} onPress={submit}>
        <Text style={styles.addBtnText}>{t.add}</Text>
      </TouchableOpacity>

      <PickerModal
        visible={categoryOpen}
        selectedKey={category}
        onSelect={(k) => setCategory(k)}
        onClose={() => setCategoryOpen(false)}
        options={categories.map((c) => ({
          key: c.id,
          label: categoryLabel(c, t),
          color: c.color,
          icon: <CategoryIcon icon={c.icon} size={16} color={c.color} />,
        }))}
      />

      <PickerModal
        visible={priorityOpen}
        selectedKey={priority}
        onSelect={(k) => setPriority(k as Priority)}
        onClose={() => setPriorityOpen(false)}
        options={PRIORITY_VALUES.map((v) => ({
          key: v,
          label: t.priority[v],
          color: PRIORITY_COLORS[v],
          icon: <PriorityDot level={v} size={12} />,
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
                <TouchableOpacity onPress={() => { setDueDate(''); setDateOpen(false) }}>
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
    </View>
  )
})

export default AddTask

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    inputWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      height: 44,
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      paddingHorizontal: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 3,
      elevation: 1,
    },
    inputWrapFocused: {
      borderColor: c.blue,
      shadowOpacity: 0.08,
    },
    iconBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    input: {
      flex: 1,
      height: '100%',
      fontSize: 15,
      color: c.label,
      paddingHorizontal: 6,
      letterSpacing: -0.16,
    },
    dateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      height: 32,
      paddingHorizontal: 6,
      borderRadius: 8,
      maxWidth: 140,
    },
    dateBtnHasDate: {
      backgroundColor: 'transparent',
    },
    dateLabel: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: -0.12,
    },
    addBtn: {
      height: 44,
      paddingHorizontal: 18,
      borderRadius: 12,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnText: {
      color: '#fff',
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
