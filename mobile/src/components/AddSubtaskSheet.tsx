import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  Pressable, KeyboardAvoidingView, Platform,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import Svg, { Rect, Path } from 'react-native-svg'
import { Priority, PRIORITY_VALUES, PRIORITY_COLORS } from '../types'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'
import { formatDisplayDate, isoDate } from '../utils'
import PriorityDot from './PriorityDot'
import InlinePicker from './InlinePicker'

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
  onAdd: (text: string, priority: Priority, dueDate: string) => void
  onClose: () => void
  /** Default due date when the sheet opens (typically the parent task's dueDate). */
  defaultDueDate?: string
}

type SubView = 'main' | 'priority' | 'date'

export default function AddSubtaskSheet({ visible, onAdd, onClose, defaultDueDate = '' }: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const inputRef = useRef<TextInput>(null)

  const [subView, setSubView] = useState<SubView>('main')
  const [text, setText] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [dueDate, setDueDate] = useState(defaultDueDate)
  const [pickerDate, setPickerDate] = useState<Date>(new Date())

  useEffect(() => {
    if (visible) {
      setSubView('main')
      setText('')
      setPriority('medium')
      setDueDate(defaultDueDate)
      const id = setTimeout(() => inputRef.current?.focus(), 120)
      return () => clearTimeout(id)
    }
  }, [visible, defaultDueDate])

  const canSubmit = text.trim().length > 0

  function submit() {
    const trimmed = text.trim()
    if (!trimmed) return
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    onAdd(trimmed, priority, dueDate)
    onClose()
  }

  function openDateView() {
    setPickerDate(dueDate ? new Date(`${dueDate}T00:00:00`) : new Date())
    setSubView('date')
  }

  function handleInlineDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === 'set' && selected) {
      setPickerDate(selected)
    }
  }

  function applyInlineDate() {
    setDueDate(isoDate(pickerDate))
    setSubView('main')
  }

  function clearInlineDate() {
    setDueDate('')
    setSubView('main')
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

            {subView === 'main' && (
              <>
                <View style={styles.headerRow}>
                  <TouchableOpacity onPress={onClose} hitSlop={10}>
                    <Text style={styles.cancelText}>{t.cancel}</Text>
                  </TouchableOpacity>
                  <Text style={styles.title}>{t.addSubtaskTitle}</Text>
                  <View style={{ width: 56 }} />
                </View>

                <View style={styles.body}>
                  <TextInput
                    ref={inputRef}
                    style={styles.textInput}
                    placeholder={t.addSubtask}
                    placeholderTextColor={theme.gray3}
                    value={text}
                    onChangeText={setText}
                    multiline
                    maxLength={1024}
                    textAlignVertical="top"
                  />

                  <View style={styles.fieldGroup}>
                    <TouchableOpacity
                      style={styles.fieldRow}
                      onPress={() => setSubView('priority')}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`Priority, ${t.priority[priority]}. Tap to change.`}
                    >
                      <PriorityDot level={priority} size={14} />
                      <Text style={styles.fieldLabel}>{t.composePriorityLabel}</Text>
                      <Text style={styles.fieldValue} numberOfLines={1}>
                        {t.priority[priority]}
                      </Text>
                      <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>

                    <View style={styles.divider} />

                    <TouchableOpacity
                      style={styles.fieldRow}
                      onPress={openDateView}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`Due date, ${dueDate ? formatDisplayDate(dueDate, t.locale) : t.noDate}. Tap to change.`}
                    >
                      <CalendarIcon size={18} color={dueDate ? theme.blue : theme.gray3} />
                      <Text style={styles.fieldLabel}>{t.composeDateLabel}</Text>
                      <Text
                        style={[
                          styles.fieldValue,
                          !dueDate && styles.fieldValueMuted,
                        ]}
                        numberOfLines={1}
                      >
                        {dueDate ? formatDisplayDate(dueDate, t.locale) : t.noDate}
                      </Text>
                      <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[styles.addBtn, !canSubmit && styles.addBtnDisabled]}
                    onPress={submit}
                    disabled={!canSubmit}
                  >
                    <Text style={styles.addBtnText}>{t.add}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {subView === 'priority' && (
              <View style={styles.subViewWrap}>
                <InlinePicker
                  title={t.composePriorityLabel}
                  options={PRIORITY_VALUES.map((v) => ({
                    key: v,
                    label: t.priority[v],
                    color: PRIORITY_COLORS[v],
                    icon: <PriorityDot level={v} size={14} />,
                  }))}
                  selectedKey={priority}
                  onSelect={(k) => {
                    setPriority(k as Priority)
                    setSubView('main')
                  }}
                />
              </View>
            )}

            {subView === 'date' && (
              <View style={styles.subViewWrap}>
                <View style={styles.headerRow}>
                  <View style={{ width: 56 }} />
                  <Text style={styles.title}>Completed by</Text>
                  <View style={{ width: 56 }} />
                </View>
                <View style={styles.dateWrap}>
                  <DateTimePicker
                    value={pickerDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
                    onChange={handleInlineDateChange}
                  />
                </View>
                <View style={styles.dateActions}>
                  <TouchableOpacity onPress={clearInlineDate} style={styles.clearBtn}>
                    <Text style={styles.clearBtnText}>{t.clear}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={applyInlineDate}
                    style={[styles.addBtn, styles.applyBtn]}
                  >
                    <Text style={styles.addBtnText}>{t.done}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
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
      paddingHorizontal: 16,
      minHeight: 380,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.gray3,
      marginBottom: 12,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
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
      paddingTop: 4,
    },
    subViewWrap: {
      flex: 1,
    },
    textInput: {
      minHeight: 96,
      fontSize: 16,
      color: c.label,
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 12,
      letterSpacing: -0.16,
      lineHeight: 22,
    },
    fieldGroup: {
      marginTop: 16,
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      overflow: 'hidden',
    },
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    fieldLabel: {
      flex: 1,
      fontSize: 15,
      color: c.label,
      fontWeight: '500',
    },
    fieldValue: {
      fontSize: 15,
      color: c.label2,
      maxWidth: 160,
    },
    fieldValueMuted: {
      color: c.gray3,
    },
    chevron: {
      fontSize: 18,
      color: c.gray3,
      fontWeight: '300',
      marginLeft: 2,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginLeft: 44,
    },
    addBtn: {
      marginTop: 20,
      height: 50,
      borderRadius: 12,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnDisabled: {
      backgroundColor: c.gray3,
      opacity: 0.5,
    },
    addBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
    dateWrap: {
      paddingTop: 8,
      alignItems: 'center',
    },
    dateActions: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
    },
    clearBtn: {
      flex: 1,
      marginTop: 20,
      height: 50,
      borderRadius: 12,
      backgroundColor: c.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    clearBtnText: {
      color: c.red,
      fontSize: 16,
      fontWeight: '500',
    },
    applyBtn: {
      flex: 1.4,
    },
  })
}
