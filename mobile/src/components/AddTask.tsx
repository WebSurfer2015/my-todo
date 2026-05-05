import React, { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react'
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Category, Priority, PRIORITY_VALUES, PRIORITY_COLORS } from '../types'
import { CategoryDef, categoryLabel } from '../categories'
import { useTheme, ThemeColors } from '../theme'
import PriorityDot from './PriorityDot'
import CategoryIcon from './CategoryIcon'
import PickerModal from './PickerModal'
import { useLang } from '../LangContext'

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
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
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
    onAdd(trimmed, priority, '', activeCat.id)
    setText('')
    setPriority('medium')
    setCategory(defaultCategory)
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
  })
}
