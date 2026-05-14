import React, { useMemo, useRef, useState } from 'react'
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
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Subtask, Todo } from '../types'
import { useTheme, ThemeColors } from '../theme'
import { useLang } from '../LangContext'

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

interface Props {
  visible: boolean
  todo: Todo
  onClose: () => void
  onUpdateText: (id: string, text: string) => void
  onAddSubtask: (id: string, text: string) => void
  onToggleSubtask: (id: string, subId: string) => void
  onUpdateSubtaskText: (id: string, subId: string, text: string) => void
  onRemoveSubtask: (id: string, subId: string) => void
}

export default function TaskDetailsSheet({
  visible, todo, onClose, onUpdateText, onAddSubtask, onToggleSubtask, onUpdateSubtaskText, onRemoveSubtask,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const [newText, setNewText] = useState('')
  const [titleEditing, setTitleEditing] = useState(false)
  const [titleText, setTitleText] = useState(todo.text)
  const newInputRef = useRef<TextInput>(null)
  const titleInputRef = useRef<TextInput>(null)
  const subs = todo.subtasks ?? []
  const doneCount = subs.filter((s) => s.done).length

  function commitNew() {
    const trimmed = newText.trim()
    if (!trimmed) return
    onAddSubtask(todo.id, trimmed)
    setNewText('')
    newInputRef.current?.focus()
  }

  function startEditTitle() {
    setTitleText(todo.text)
    setTitleEditing(true)
    setTimeout(() => titleInputRef.current?.focus(), 0)
  }

  function commitTitle() {
    const trimmed = titleText.trim()
    if (trimmed && trimmed !== todo.text) onUpdateText(todo.id, trimmed)
    else setTitleText(todo.text)
    setTitleEditing(false)
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.overlayTouch} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              {titleEditing ? (
                <TextInput
                  ref={titleInputRef}
                  style={styles.titleEdit}
                  value={titleText}
                  onChangeText={setTitleText}
                  onBlur={commitTitle}
                  onSubmitEditing={commitTitle}
                  returnKeyType="done"
                  multiline
                  maxLength={200}
                />
              ) : (
                <Text
                  style={styles.title}
                  numberOfLines={3}
                  onPress={startEditTitle}
                  suppressHighlighting
                >
                  {todo.text}
                </Text>
              )}
              <Text style={styles.subtitle}>
                {t.subtasks}
                {subs.length > 0 ? ` · ${t.subtaskProgress(doneCount, subs.length)}` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <XIcon size={20} color={theme.label2} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={subs.length === 0 ? styles.listEmpty : undefined}
          >
            {subs.length === 0 ? (
              <Text style={styles.emptyText}>{t.addSubtask}</Text>
            ) : (
              subs.map((s) => (
                <SubtaskRow
                  key={s.id}
                  parentId={todo.id}
                  subtask={s}
                  styles={styles}
                  theme={theme}
                  onToggle={onToggleSubtask}
                  onUpdateText={onUpdateSubtaskText}
                  onRemove={onRemoveSubtask}
                />
              ))
            )}
          </ScrollView>

          <View style={styles.addRow}>
            <TextInput
              ref={newInputRef}
              style={styles.addInput}
              value={newText}
              onChangeText={setNewText}
              placeholder={t.addSubtask}
              placeholderTextColor={theme.label3}
              onSubmitEditing={commitNew}
              returnKeyType="done"
              maxLength={500}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[styles.addBtn, !newText.trim() && styles.addBtnDisabled]}
              onPress={commitNew}
              disabled={!newText.trim()}
            >
              <PlusIcon size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function SubtaskRow({
  parentId, subtask, styles, theme, onToggle, onUpdateText, onRemove,
}: {
  parentId: string
  subtask: Subtask
  styles: ReturnType<typeof makeStyles>
  theme: ThemeColors
  onToggle: (id: string, subId: string) => void
  onUpdateText: (id: string, subId: string, text: string) => void
  onRemove: (id: string, subId: string) => void
}) {
  const { t } = useLang()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(subtask.text)
  const inputRef = useRef<TextInput>(null)

  function startEdit() {
    setText(subtask.text)
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function commit() {
    const trimmed = text.trim()
    if (trimmed && trimmed !== subtask.text) onUpdateText(parentId, subtask.id, trimmed)
    else setText(subtask.text)
    setEditing(false)
  }

  return (
    <View style={styles.subRow}>
      <TouchableOpacity
        onPress={() => onToggle(parentId, subtask.id)}
        hitSlop={10}
        style={[styles.subCheckbox, subtask.done && styles.subCheckboxDone]}
      >
        {subtask.done && <Text style={styles.subCheckmark}>✓</Text>}
      </TouchableOpacity>
      {editing ? (
        <TextInput
          ref={inputRef}
          style={styles.subTextEdit}
          value={text}
          onChangeText={setText}
          onBlur={commit}
          onSubmitEditing={commit}
          returnKeyType="done"
          maxLength={500}
        />
      ) : (
        <Text
          style={[styles.subText, subtask.done && styles.subTextDone]}
          onPress={startEdit}
        >
          {subtask.text}
        </Text>
      )}
      <TouchableOpacity
        onPress={() => onRemove(parentId, subtask.id)}
        hitSlop={10}
        style={styles.subRemove}
        accessibilityLabel={t.deleteSubtask}
      >
        <XIcon size={16} color={theme.label3} />
      </TouchableOpacity>
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
      maxHeight: '85%',
      minHeight: '40%',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
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
      fontSize: 11,
      fontWeight: '600',
      color: c.label2,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 4,
    },
    closeBtn: {
      padding: 4,
    },
    list: {
      flexGrow: 0,
      flexShrink: 1,
      paddingVertical: 8,
    },
    listEmpty: {
      paddingVertical: 24,
      alignItems: 'center',
    },
    emptyText: {
      color: c.label3,
      fontSize: 14,
      fontStyle: 'italic',
    },
    subRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 4,
    },
    subCheckbox: {
      width: 22,
      height: 22,
      borderRadius: 11,
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
      fontSize: 13,
      fontWeight: '700',
      lineHeight: 15,
    },
    subText: {
      flex: 1,
      fontSize: 15,
      color: c.label,
      lineHeight: 20,
    },
    subTextDone: {
      color: c.label3,
      textDecorationLine: 'line-through',
    },
    subTextEdit: {
      flex: 1,
      fontSize: 15,
      color: c.label,
      lineHeight: 20,
      backgroundColor: c.bg,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    subRemove: {
      padding: 4,
    },
    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.separator,
    },
    addInput: {
      flex: 1,
      fontSize: 15,
      color: c.label,
      backgroundColor: c.bg,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    addBtn: {
      backgroundColor: c.blue,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnDisabled: {
      backgroundColor: c.gray3,
    },
  })
}
