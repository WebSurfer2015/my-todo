import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated, Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  Pressable, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSheetDismiss, sheetGrabZone } from '../../ui/useSheetDismiss'
import * as Haptics from 'expo-haptics'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import Svg, { Rect, Path } from 'react-native-svg'
import { Priority, PRIORITY_VALUES, PRIORITY_COLORS } from '../../core-bindings/types'
import { useLang } from '../../app/LangContext'
import { useTheme, ThemeColors, SPACING, RADIUS, TYPE } from '../../app/theme'
import { dueDateToDate, formatDisplayDate, fullDateLabel, isoDate } from '../../core-bindings/utils'
import PriorityDot from '../../ui/PriorityDot'
import InlinePicker from '../../ui/InlinePicker'

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
    // dueDateToDate: the default comes from the parent, which may carry a
    // time — appending T00:00:00 to that made an Invalid Date for the picker.
    setPickerDate(dueDate ? dueDateToDate(dueDate) : new Date())
    setSubView('date')
  }

  function handleInlineDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === 'set' && selected) {
      setPickerDate(selected)
      setDueDate(isoDate(selected))
    }
  }

  function applyInlineDate() {
    setSubView('main')
  }

  const { translateY, panHandlers } = useSheetDismiss(visible, onClose)

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Sibling backdrop tap-layer (not a wrapper) — a wrapping Pressable
            collapses the sheet into one iOS a11y leaf (breaks VoiceOver/Maestro). */}
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
          <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
            <View style={sheetGrabZone} {...panHandlers}>
              <View style={styles.handle} />
            </View>

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
                    placeholderTextColor={theme.label2}
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
                      accessibilityLabel={`Complete by, ${dueDate ? formatDisplayDate(dueDate, t.locale) : t.noDate}. Tap to change.`}
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
                  <TouchableOpacity onPress={() => setSubView('main')} hitSlop={10}>
                    <Text style={styles.cancelText}>{t.cancel}</Text>
                  </TouchableOpacity>
                  <Text style={styles.title}>{t.composeDateLabel}</Text>
                  <TouchableOpacity onPress={applyInlineDate} hitSlop={10}>
                    <Text style={styles.doneHeaderText}>{t.done}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.dateWrap}>
                  {dueDate ? (
                    <Text style={styles.datePendingLabel}>{fullDateLabel(dueDate)}</Text>
                  ) : (
                    <Text style={[styles.datePendingLabel, styles.datePendingLabelEmpty]}>{t.noDate}</Text>
                  )}
                  <DateTimePicker
                    value={pickerDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
                    onChange={handleInlineDateChange}
                  />
                </View>
                {dueDate ? (
                  <TouchableOpacity onPress={() => setDueDate('')} style={styles.clearLink} hitSlop={8}>
                    <Text style={styles.clearLinkText}>{t.clear}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </Animated.View>
        </View>
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
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.xl,
      paddingHorizontal: SPACING.lg,
      minHeight: 380,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.gray3,
      marginBottom: SPACING.md,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: SPACING.sm,
    },
    cancelText: {
      fontSize: TYPE.body,
      fontWeight: '500',
      color: c.blue,
      width: 56,
    },
    title: {
      fontSize: TYPE.title,
      fontWeight: '700',
      color: c.label,
    },
    body: {
      paddingTop: SPACING.xs,
    },
    subViewWrap: {
      flex: 1,
    },
    textInput: {
      minHeight: 96,
      fontSize: TYPE.bodyLg,
      color: c.label,
      backgroundColor: c.card,
      borderRadius: RADIUS.control,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
      letterSpacing: -0.16,
      lineHeight: 22,
    },
    fieldGroup: {
      marginTop: SPACING.lg,
      backgroundColor: c.card,
      borderRadius: RADIUS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      overflow: 'hidden',
    },
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
    },
    fieldLabel: {
      flex: 1,
      fontSize: TYPE.body,
      color: c.label,
      fontWeight: '500',
    },
    fieldValue: {
      fontSize: TYPE.body,
      color: c.label2,
      maxWidth: 160,
    },
    fieldValueMuted: {
      color: c.gray3,
    },
    chevron: {
      fontSize: TYPE.title,
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
      borderRadius: RADIUS.control,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnDisabled: {
      backgroundColor: c.gray3,
      opacity: 0.5,
    },
    addBtnText: {
      color: c.primaryOn,
      fontSize: TYPE.bodyLg,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
    dateWrap: {
      paddingTop: SPACING.sm,
      alignItems: 'center',
    },
    datePendingLabel: {
      fontSize: TYPE.body,
      fontWeight: '600',
      color: c.label2,
      marginBottom: SPACING.sm,
    },
    datePendingLabelEmpty: {
      color: c.label3,
      fontStyle: 'italic',
      fontWeight: '500',
    },
    dateActions: {
      flexDirection: 'row',
      gap: SPACING.md,
      alignItems: 'center',
    },
    clearBtn: {
      flex: 1,
      marginTop: 20,
      height: 50,
      borderRadius: RADIUS.control,
      backgroundColor: c.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    clearBtnText: {
      color: c.red,
      fontSize: TYPE.bodyLg,
      fontWeight: '500',
    },
    applyBtn: {
      flex: 1.4,
    },
    doneHeaderText: {
      fontSize: TYPE.body,
      fontWeight: '600',
      color: c.blue,
      width: 56,
      textAlign: 'right',
    },
    clearLink: {
      alignSelf: 'center',
      paddingVertical: SPACING.sm,
      marginTop: SPACING.xs,
    },
    clearLinkText: {
      fontSize: TYPE.footnote,
      fontWeight: '500',
      color: c.red,
    },
  })
}
