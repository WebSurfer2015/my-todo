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
import Svg, { Path, Line, Polyline } from 'react-native-svg'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Priority, Subtask, Todo, PRIORITY_VALUES, PRIORITY_COLORS } from '../types'
import { CategoryDef, categoryLabel } from '../categories'
import { formatDisplayDate, isoDate, todayLocal } from '../utils'
import { tonalPalette, TonalPalette } from '../../../core/src/m3palette'
import { useTheme, ThemeColors } from '../theme'
import { useLang } from '../LangContext'
import PriorityDot from './PriorityDot'
import CategoryIcon from './CategoryIcon'
import PickerModal from './PickerModal'

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

interface Props {
  visible: boolean
  todo: Todo
  categories: CategoryDef[]
  onClose: () => void
  onUpdateText: (id: string, text: string) => void
  onAddSubtask: (id: string, text: string, priority?: Priority, dueDate?: string) => void
  onToggleSubtask: (id: string, subId: string) => void
  onUpdateSubtaskText: (id: string, subId: string, text: string) => void
  onUpdateSubtaskPriority?: (id: string, subId: string, priority: Priority) => void
  onUpdateSubtaskDueDate?: (id: string, subId: string, dueDate: string) => void
  onRemoveSubtask: (id: string, subId: string) => void
}

export default function TaskDetailsSheet({
  visible, todo, categories, onClose, onUpdateText,
  onAddSubtask, onToggleSubtask, onUpdateSubtaskText,
  onUpdateSubtaskPriority, onUpdateSubtaskDueDate, onRemoveSubtask,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const subs = todo.subtasks ?? []
  const doneCount = subs.filter((s) => s.done).length

  const cat = todo.category ? categories.find((c) => c.id === todo.category) : undefined
  const isDark = theme.statusBar === 'light-content'
  const m3 = useMemo<TonalPalette>(
    () => tonalPalette(cat?.color ?? '#007AFF', isDark),
    [cat?.color, isDark],
  )
  const styles = useMemo(() => makeStyles(theme, m3), [theme, m3])

  const [newText, setNewText] = useState('')
  const [newPriority, setNewPriority] = useState<Priority>(todo.priority)
  const [newDueDate, setNewDueDate] = useState<string>(todo.dueDate || '')
  const [newPriorityOpen, setNewPriorityOpen] = useState(false)
  const [newDateOpen, setNewDateOpen] = useState(false)
  const [newPickerDate, setNewPickerDate] = useState<Date>(
    todo.dueDate ? new Date(`${todo.dueDate}T00:00:00`) : new Date(),
  )

  const [titleEditing, setTitleEditing] = useState(false)
  const [titleText, setTitleText] = useState(todo.text)
  const [subPriorityForId, setSubPriorityForId] = useState<string | null>(null)
  const [subDateForId, setSubDateForId] = useState<string | null>(null)
  const [subPickerDate, setSubPickerDate] = useState<Date>(new Date())
  const newInputRef = useRef<TextInput>(null)
  const titleInputRef = useRef<TextInput>(null)

  function commitNew() {
    const trimmed = newText.trim()
    if (!trimmed) return
    onAddSubtask(todo.id, trimmed, newPriority, newDueDate)
    setNewText('')
    setNewPriority(todo.priority)
    setNewDueDate(todo.dueDate || '')
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

  function openSubDate(s: Subtask) {
    setSubPickerDate(s.dueDate ? new Date(`${s.dueDate}T00:00:00`) : new Date())
    setSubDateForId(s.id)
  }

  function openNewDate() {
    setNewPickerDate(newDueDate ? new Date(`${newDueDate}T00:00:00`) : new Date())
    setNewDateOpen(true)
  }

  // Status derived from subs (or todo.done if no subs)
  let statusLabel: string
  let statusKey: 'notstarted' | 'progress' | 'done'
  if (subs.length === 0) {
    if (todo.done) { statusLabel = t.statusDone; statusKey = 'done' }
    else { statusLabel = t.statusNotStarted; statusKey = 'notstarted' }
  } else if (doneCount === subs.length) {
    statusLabel = t.statusDone; statusKey = 'done'
  } else if (doneCount === 0) {
    statusLabel = t.statusNotStarted; statusKey = 'notstarted'
  } else {
    statusLabel = t.statusInProgress; statusKey = 'progress'
  }

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
              <View style={styles.subtitle}>
                <View style={[styles.statusPill, styles[`statusPill_${statusKey}`]]}>
                  <Text style={[styles.statusPillText, styles[`statusPillText_${statusKey}`]]}>
                    {statusLabel.toUpperCase()}
                  </Text>
                </View>
                {cat && (
                  <>
                    <Text style={styles.metaSep}>·</Text>
                    <View style={styles.metaCat}>
                      <CategoryIcon icon={cat.icon} size={11} color={cat.color} />
                      <Text style={[styles.metaCatText, { color: cat.color }]}>{categoryLabel(cat, t)}</Text>
                    </View>
                  </>
                )}
                <Text style={styles.metaSep}>·</Text>
                <Text style={[
                  styles.metaDate,
                  parentOverdue && styles.metaDateOverdue,
                  parentToday && styles.metaDateToday,
                  !todo.dueDate && styles.metaDateMuted,
                ]}>
                  {todo.dueDate ? formatDisplayDate(todo.dueDate, t.locale) : t.noDate}
                </Text>
                {subs.length > 0 && (
                  <>
                    <Text style={styles.metaSep}>·</Text>
                    <Text style={styles.metaProgress}>{t.subtaskProgress(doneCount, subs.length)}</Text>
                  </>
                )}
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <XIcon size={20} color={theme.label2} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={subs.length === 0 ? styles.listEmpty : styles.listFilled}
          >
            {subs.length === 0 ? (
              <Text style={styles.emptyText}>{t.addSubtask}</Text>
            ) : (
              subs.map((s) => (
                <SubtaskCard
                  key={s.id}
                  parentId={todo.id}
                  parentColor={cat?.color}
                  subtask={s}
                  styles={styles}
                  theme={theme}
                  onToggle={onToggleSubtask}
                  onUpdateText={onUpdateSubtaskText}
                  onRemove={onRemoveSubtask}
                  onOpenPriority={onUpdateSubtaskPriority ? () => setSubPriorityForId(s.id) : undefined}
                  onOpenDate={onUpdateSubtaskDueDate ? () => openSubDate(s) : undefined}
                />
              ))
            )}
          </ScrollView>

          {/* Always-visible add-subtask row with priority + date defaults from parent */}
          <View style={styles.addCard}>
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
              style={styles.addPriorityBtn}
              onPress={() => setNewPriorityOpen(true)}
              hitSlop={8}
            >
              <PriorityDot level={newPriority} size={11} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addDateChip}
              onPress={openNewDate}
              hitSlop={8}
            >
              <Text style={[
                styles.addDateText,
                !newDueDate && styles.metaDateMuted,
              ]}>
                {newDueDate ? formatDisplayDate(newDueDate, t.locale) : t.noDate}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addBtn, !newText.trim() && styles.addBtnDisabled]}
              onPress={commitNew}
              disabled={!newText.trim()}
            >
              <PlusIcon size={18} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* New-subtask priority picker */}
          <PickerModal
            visible={newPriorityOpen}
            selectedKey={newPriority}
            onSelect={(k) => setNewPriority(k as Priority)}
            onClose={() => setNewPriorityOpen(false)}
            options={PRIORITY_VALUES.map((v) => ({
              key: v,
              label: t.priority[v],
              color: PRIORITY_COLORS[v],
              icon: <PriorityDot level={v} size={12} />,
            }))}
          />

          {/* New-subtask date picker */}
          {newDateOpen && Platform.OS === 'ios' && (
            <Modal
              visible
              transparent
              animationType="fade"
              onRequestClose={() => setNewDateOpen(false)}
            >
              <TouchableOpacity
                style={styles.dateOverlay}
                onPress={() => setNewDateOpen(false)}
                activeOpacity={1}
              >
                <View style={styles.dateSheet} onStartShouldSetResponder={() => true}>
                  <DateTimePicker
                    value={newPickerDate}
                    mode="date"
                    display="inline"
                    themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
                    onChange={(e, d) => { if (e.type === 'set' && d) setNewPickerDate(d) }}
                  />
                  <View style={styles.dateBtnRow}>
                    <TouchableOpacity
                      onPress={() => { setNewDueDate(''); setNewDateOpen(false) }}
                    >
                      <Text style={styles.dateClear}>{t.clear}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { setNewDueDate(isoDate(newPickerDate)); setNewDateOpen(false) }}
                    >
                      <Text style={styles.dateDone}>{t.done}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            </Modal>
          )}
          {newDateOpen && Platform.OS === 'android' && (
            <DateTimePicker
              value={newPickerDate}
              mode="date"
              display="default"
              onChange={(e, d) => {
                if (e.type === 'set' && d) setNewDueDate(isoDate(d))
                setNewDateOpen(false)
              }}
            />
          )}

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
  parentId, parentColor, subtask, styles, theme,
  onToggle, onUpdateText, onRemove, onOpenPriority, onOpenDate,
}: {
  parentId: string
  parentColor?: string
  subtask: Subtask
  styles: ReturnType<typeof makeStyles>
  theme: ThemeColors
  onToggle: (id: string, subId: string) => void
  onUpdateText: (id: string, subId: string, text: string) => void
  onRemove: (id: string, subId: string) => void
  onOpenPriority?: () => void
  onOpenDate?: () => void
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
    if (trimmed && trimmed !== subtask.text) onUpdateText(parentId, subtask.id, trimmed)
    else setText(subtask.text)
    setEditing(false)
  }

  return (
    <View style={[styles.subCard, { borderLeftColor: parentColor ?? theme.separator }]}>
      <TouchableOpacity
        onPress={() => onToggle(parentId, subtask.id)}
        hitSlop={10}
        style={[styles.subCardCheckbox, subtask.done && styles.subCardCheckboxDone]}
      >
        {subtask.done && <Text style={styles.subCardCheckmark}>✓</Text>}
      </TouchableOpacity>
      <View style={styles.subCardBody}>
        <View style={styles.subCardMain}>
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
            <Text
              style={[styles.subCardText, subtask.done && styles.subCardTextDone]}
              onPress={startEdit}
              suppressHighlighting
            >
              {subtask.text}
            </Text>
          )}
          {onOpenPriority && (
            <TouchableOpacity onPress={onOpenPriority} hitSlop={8} style={styles.subPriorityBtn}>
              <PriorityDot level={priority} size={11} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.subCardMeta}>
          {onOpenDate && (
            <TouchableOpacity onPress={onOpenDate} hitSlop={8} style={styles.subDateChip}>
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
          <TouchableOpacity
            onPress={() => onRemove(parentId, subtask.id)}
            hitSlop={10}
            style={styles.subRemoveBtn}
            accessibilityLabel={t.deleteSubtask}
          >
            <TrashIcon size={14} color={theme.label3} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

function makeStyles(c: ThemeColors, m3: TonalPalette) {
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
      backgroundColor: m3.surfaceContainer,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: 16,
      paddingBottom: Platform.OS === 'ios' ? 32 : 16,
      paddingHorizontal: 20,
      maxHeight: '90%',
      minHeight: '55%',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.18,
      shadowRadius: 12,
      elevation: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingBottom: 14,
    },
    title: {
      fontSize: 24,
      fontWeight: '500',
      color: m3.onSurface,
      lineHeight: 32,
      letterSpacing: -0.2,
    },
    titleEdit: {
      fontSize: 24,
      fontWeight: '500',
      color: m3.onSurface,
      lineHeight: 32,
      letterSpacing: -0.2,
      backgroundColor: m3.surfaceContainerHigh,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: m3.primary,
    },
    subtitle: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    statusPill: {
      height: 28,
      paddingHorizontal: 12,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusPill_notstarted: { backgroundColor: m3.surfaceContainerHigh },
    statusPill_progress: { backgroundColor: m3.primaryContainer },
    statusPill_done: { backgroundColor: m3.primary },
    statusPillText: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.4,
    },
    statusPillText_notstarted: { color: m3.onSurfaceVariant },
    statusPillText_progress: { color: m3.onPrimaryContainer },
    statusPillText_done: { color: m3.onPrimary },
    metaSep: { display: 'none' },
    metaCat: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      height: 28,
      borderRadius: 999,
      backgroundColor: m3.primaryContainer,
    },
    metaCatText: { fontSize: 12, fontWeight: '600', color: m3.onPrimaryContainer },
    metaDate: {
      fontSize: 12,
      fontWeight: '500',
      color: m3.onSurfaceVariant,
      paddingHorizontal: 12,
      height: 28,
      lineHeight: 28,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: m3.outline,
      overflow: 'hidden',
    },
    metaDateOverdue: { color: '#B3261E', borderColor: '#F4685C', backgroundColor: '#FCE8E6' },
    metaDateToday: { color: '#944A00', borderColor: '#F1B36A', backgroundColor: '#FFF1E0' },
    metaDateMuted: { color: m3.onSurfaceVariant, fontStyle: 'italic' },
    metaProgress: {
      fontSize: 12,
      color: m3.onSurfaceVariant,
      fontVariant: ['tabular-nums'],
      fontWeight: '600',
      paddingHorizontal: 12,
      height: 28,
      lineHeight: 28,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: m3.outline,
      overflow: 'hidden',
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    list: { flexGrow: 0, flexShrink: 1 },
    listFilled: { paddingVertical: 8, gap: 6 },
    listEmpty: { paddingVertical: 24, alignItems: 'center' },
    emptyText: { color: m3.onSurfaceVariant, fontSize: 14, fontStyle: 'italic' },

    /* M3 expressive subtask card */
    subCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      backgroundColor: m3.surfaceContainerHigh,
      borderRadius: 18,
      padding: 14,
    },
    subCardDone: { backgroundColor: m3.surfaceContainer },
    subCardCheckbox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: m3.outline,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    subCardCheckboxDone: {
      backgroundColor: m3.primary,
      borderColor: m3.primary,
    },
    subCardCheckmark: {
      color: m3.onPrimary,
      fontSize: 14,
      fontWeight: '700',
      lineHeight: 16,
    },
    subCardBody: { flex: 1, gap: 6 },
    subCardMain: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    subCardText: {
      flex: 1,
      fontSize: 16,
      fontWeight: '500',
      color: m3.onSurface,
      lineHeight: 22,
      letterSpacing: 0.1,
    },
    subCardTextDone: { color: m3.onSurfaceVariant, textDecorationLine: 'line-through' },
    subCardTextEdit: {
      flex: 1,
      fontSize: 16,
      fontWeight: '500',
      color: m3.onSurface,
      lineHeight: 22,
      backgroundColor: m3.surface,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: m3.primary,
    },
    subPriorityBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subCardMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    subDateChip: {
      height: 28,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: m3.outline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subDateChipText: { fontSize: 12, fontWeight: '500' },
    subDateChipMuted: { color: m3.onSurfaceVariant, fontStyle: 'italic', fontWeight: '500' },
    subDateChipPlain: { color: m3.onSurfaceVariant, fontWeight: '500' },
    subDateChipOverdue: { color: '#B3261E', fontWeight: '600' },
    subDateChipToday: { color: '#944A00', fontWeight: '600' },
    subRemoveBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 'auto',
    },

    /* M3 add-subtask card — tonal primaryContainer pill, FAB button */
    addCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: m3.primaryContainer,
      borderRadius: 28,
      marginTop: 8,
    },
    addInput: {
      flex: 1,
      minWidth: 80,
      fontSize: 15,
      fontWeight: '500',
      color: m3.onPrimaryContainer,
      backgroundColor: 'transparent',
      paddingHorizontal: 6,
      paddingVertical: 8,
    },
    addPriorityBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addDateChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: m3.outline,
    },
    addDateText: { fontSize: 12, fontWeight: '500', color: m3.onPrimaryContainer },
    addBtn: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: m3.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.18,
      shadowRadius: 4,
      elevation: 4,
    },
    addBtnDisabled: {
      backgroundColor: m3.surfaceContainerHigh,
      shadowOpacity: 0,
      elevation: 0,
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
