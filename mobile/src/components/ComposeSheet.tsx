import React, { useEffect, useMemo, useRef } from 'react'
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  Pressable, KeyboardAvoidingView, Platform,
} from 'react-native'
import AddTask, { AddTaskHandle } from './AddTask'
import { Category, Priority } from '../types'
import { CategoryDef } from '../categories'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'

interface Props {
  visible: boolean
  categories: CategoryDef[]
  defaultCategory: Category
  onAdd: (text: string, priority: Priority, dueDate: string, category?: Category) => void
  onClose: () => void
}

export default function ComposeSheet({
  visible, categories, defaultCategory, onAdd, onClose,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const addTaskRef = useRef<AddTaskHandle>(null)

  useEffect(() => {
    if (visible) {
      const id = setTimeout(() => addTaskRef.current?.focus(), 120)
      return () => clearTimeout(id)
    }
  }, [visible])

  function handleAdd(text: string, priority: Priority, dueDate: string, category?: Category) {
    onAdd(text, priority, dueDate, category)
    onClose()
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
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={onClose} hitSlop={10}>
                <Text style={styles.cancelText}>{t.cancel}</Text>
              </TouchableOpacity>
              <Text style={styles.title}>{t.addPlaceholder}</Text>
              <View style={{ width: 56 }} />
            </View>
            <View style={styles.body}>
              <AddTask
                ref={addTaskRef}
                onAdd={handleAdd}
                categories={categories}
                defaultCategory={defaultCategory}
              />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
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
      paddingTop: 8,
      paddingBottom: 24,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.gray3,
      marginBottom: 8,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    cancelText: {
      fontSize: 15,
      fontWeight: '500',
      color: c.blue,
      width: 56,
    },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: c.label,
    },
    body: {
      paddingHorizontal: 16,
      paddingTop: 4,
    },
  })
}
