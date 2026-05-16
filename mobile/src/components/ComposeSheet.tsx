import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  Pressable, KeyboardAvoidingView, Platform,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import Svg, { Rect, Path } from 'react-native-svg'
import { Repeat } from 'lucide-react-native'
import { Category, Priority, PRIORITY_VALUES, PRIORITY_COLORS, Recurrence, RecurrenceFreq, RECURRENCE_FREQS } from '../types'
import { CategoryDef, categoryLabel } from '../categories'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'
import { formatDisplayDate, formatRecurrence, fullDateLabel, isoDate } from '../utils'
import PriorityDot from './PriorityDot'
import CategoryIcon from './CategoryIcon'
import InlinePicker from './InlinePicker'
import CustomRecurrenceForm from './CustomRecurrenceForm'

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
  categories: CategoryDef[]
  defaultCategory: Category
  onAdd: (text: string, priority: Priority, dueDate: string, category?: Category, recurrence?: Recurrence) => void
  onClose: () => void
}

type SubView = 'main' | 'category' | 'priority' | 'date' | 'repeat' | 'repeatEndDate' | 'customRepeat'

function defaultEndDateFor(freq: RecurrenceFreq): Date {
  const d = new Date()
  switch (freq) {
    case 'daily':   d.setDate(d.getDate() + 30); break
    case 'weekly':  d.setDate(d.getDate() + 84); break  // 12 weeks
    case 'monthly': d.setMonth(d.getMonth() + 12); break
    case 'yearly':  d.setFullYear(d.getFullYear() + 5); break
  }
  return d
}

const RECURRENCE_LABELS: Record<'none' | RecurrenceFreq, string> = {
  none: 'Never',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

function recurrenceLabel(rec: Recurrence | undefined): string {
  if (!rec) return 'Never'
  let base: string
  if (rec.byWeekday && rec.byWeekday.length > 0) {
    base = formatRecurrence(rec)
  } else {
    base = RECURRENCE_LABELS[rec.freq] ?? 'Never'
  }
  if (rec.endDate) {
    const d = new Date(`${rec.endDate}T00:00:00`)
    const sameYear = d.getFullYear() === new Date().getFullYear()
    const ends = d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
    })
    return `${base} · ends ${ends}`
  }
  return base
}

function isCustomRecurrence(rec: Recurrence | undefined): boolean {
  return !!rec && Array.isArray(rec.byWeekday) && rec.byWeekday.length > 0
}

export default function ComposeSheet({
  visible, categories, defaultCategory, onAdd, onClose,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const inputRef = useRef<TextInput>(null)

  const [subView, setSubView] = useState<SubView>('main')
  const [text, setText] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [category, setCategory] = useState<Category>(defaultCategory)
  const [dueDate, setDueDate] = useState('')
  const [pickerDate, setPickerDate] = useState<Date>(new Date())
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(undefined)
  // Pending freq while the user is in the 'repeatEndDate' picker — committed
  // to `recurrence` once they pick an end date.
  const [pendingFreq, setPendingFreq] = useState<RecurrenceFreq | null>(null)
  const [endDatePickerDate, setEndDatePickerDate] = useState<Date>(new Date())

  useEffect(() => { setCategory(defaultCategory) }, [defaultCategory])

  useEffect(() => {
    if (visible) {
      setSubView('main')
      setText('')
      setPriority('medium')
      setCategory(defaultCategory)
      setDueDate('')
      setRecurrence(undefined)
      const id = setTimeout(() => inputRef.current?.focus(), 120)
      return () => clearTimeout(id)
    }
  }, [visible, defaultCategory])

  const activeCat = categories.find((c) => c.id === category) ?? categories[0]
  const canSubmit = text.trim().length > 0 && !!activeCat

  function submit() {
    const trimmed = text.trim()
    if (!trimmed || !activeCat) return
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    onAdd(trimmed, priority, dueDate, activeCat.id, recurrence)
    onClose()
  }

  function openDateView() {
    setPickerDate(dueDate ? new Date(`${dueDate}T00:00:00`) : new Date())
    setSubView('date')
  }

  function handleInlineDateChange(_event: DateTimePickerEvent, selected?: Date) {
    if (!selected) return
    setPickerDate(selected)
    setDueDate(isoDate(selected))
  }

  function clearInlineDate() {
    setDueDate('')
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
                  <Text style={styles.title}>{t.addPlaceholder}</Text>
                  <View style={{ width: 56 }} />
                </View>

                <View style={styles.body}>
                  <TextInput
                    ref={inputRef}
                    style={styles.textInput}
                    placeholder={t.addPlaceholder}
                    placeholderTextColor={theme.gray3}
                    value={text}
                    onChangeText={setText}
                    multiline
                    maxLength={4096}
                    textAlignVertical="top"
                  />

                  <View style={styles.fieldGroup}>
                    <TouchableOpacity
                      style={styles.fieldRow}
                      onPress={() => setSubView('category')}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`Category, ${activeCat ? categoryLabel(activeCat, t) : 'none'}. Tap to change.`}
                    >
                      {activeCat && <CategoryIcon icon={activeCat.icon} size={18} color={activeCat.color} />}
                      <Text style={styles.fieldLabel}>{t.composeCategoryLabel}</Text>
                      <Text style={styles.fieldValue} numberOfLines={1}>
                        {activeCat ? categoryLabel(activeCat, t) : ''}
                      </Text>
                      <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>

                    <View style={styles.divider} />

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
                      accessibilityLabel={`Completed by, ${dueDate ? formatDisplayDate(dueDate, t.locale) : t.noDate}. Tap to change.`}
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

                    <View style={styles.divider} />

                    <TouchableOpacity
                      style={styles.fieldRow}
                      onPress={() => setSubView('repeat')}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`Repeat, ${recurrenceLabel(recurrence)}. Tap to change.`}
                    >
                      <Repeat size={18} color={recurrence ? theme.blue : theme.gray3} strokeWidth={2} />
                      <Text style={styles.fieldLabel}>Repeat</Text>
                      <Text
                        style={[
                          styles.fieldValue,
                          !recurrence && styles.fieldValueMuted,
                        ]}
                        numberOfLines={1}
                      >
                        {recurrence
                          ? (isCustomRecurrence(recurrence)
                              ? formatRecurrence(recurrence)
                              : RECURRENCE_LABELS[recurrence.freq])
                          : RECURRENCE_LABELS.none}
                      </Text>
                      <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>

                    {recurrence && (
                      <>
                        <View style={styles.divider} />
                        <TouchableOpacity
                          style={styles.fieldRow}
                          onPress={() => {
                            setEndDatePickerDate(
                              recurrence.endDate
                                ? new Date(`${recurrence.endDate}T00:00:00`)
                                : defaultEndDateFor(recurrence.freq),
                            )
                            setPendingFreq(recurrence.freq)
                            setSubView('repeatEndDate')
                          }}
                          activeOpacity={0.6}
                          accessibilityRole="button"
                          accessibilityLabel={`Repeat ends on, ${recurrence.endDate ?? 'never'}. Tap to change.`}
                        >
                          <CalendarIcon size={18} color={recurrence.endDate ? theme.blue : theme.gray3} />
                          <Text style={styles.fieldLabel}>Repeat ends</Text>
                          <Text
                            style={[
                              styles.fieldValue,
                              !recurrence.endDate && styles.fieldValueMuted,
                            ]}
                            numberOfLines={1}
                          >
                            {recurrence.endDate
                              ? new Date(`${recurrence.endDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                              : 'No end'}
                          </Text>
                          <Text style={styles.chevron}>›</Text>
                        </TouchableOpacity>
                      </>
                    )}
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

            {subView === 'category' && (
              <InlinePicker
                title={t.composeCategoryLabel}
                options={categories.map((c) => ({
                  key: c.id,
                  label: categoryLabel(c, t),
                  color: c.color,
                  icon: <CategoryIcon icon={c.icon} size={18} color={c.color} />,
                }))}
                selectedKey={category}
                onSelect={(k) => {
                  setCategory(k)
                  setSubView('main')
                }}
                onBack={() => setSubView('main')}
              />
            )}

            {subView === 'priority' && (
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
                onBack={() => setSubView('main')}
              />
            )}

            {subView === 'repeat' && (
              <InlinePicker
                title="Repeat"
                options={[
                  { key: 'none', label: RECURRENCE_LABELS.none, color: theme.label },
                  ...RECURRENCE_FREQS.map((f) => ({
                    key: f,
                    label: RECURRENCE_LABELS[f],
                    color: theme.label,
                    icon: <Repeat size={16} color={theme.blue} strokeWidth={2} />,
                  })),
                  { key: 'custom', label: 'Custom…', color: theme.label },
                ]}
                selectedKey={
                  !recurrence
                    ? 'none'
                    : isCustomRecurrence(recurrence)
                      ? 'custom'
                      : recurrence.freq
                }
                onSelect={(k) => {
                  if (k === 'custom') {
                    setSubView('customRepeat')
                  } else if (k === 'none') {
                    setRecurrence(undefined)
                    setSubView('main')
                  } else {
                    const freq = k as RecurrenceFreq
                    setPendingFreq(freq)
                    setEndDatePickerDate(
                      recurrence?.endDate
                        ? new Date(`${recurrence.endDate}T00:00:00`)
                        : defaultEndDateFor(freq),
                    )
                    setSubView('repeatEndDate')
                  }
                }}
                onBack={() => setSubView('main')}
              />
            )}

            {subView === 'repeatEndDate' && pendingFreq && (
              <>
                <View style={styles.headerRow}>
                  <TouchableOpacity onPress={() => setSubView('repeat')} hitSlop={10}>
                    <Text style={styles.cancelText}>‹ Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.title}>Repeat ends on</Text>
                  <View style={{ width: 56 }} />
                </View>
                <View style={styles.dateWrap}>
                  <Text style={styles.datePendingLabel}>{fullDateLabel(isoDate(endDatePickerDate))}</Text>
                  <DateTimePicker
                    value={endDatePickerDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
                    minimumDate={new Date()}
                    onChange={(e, d) => {
                      if (e.type === 'set' && d) setEndDatePickerDate(d)
                    }}
                  />
                </View>
                <View style={styles.dateActions}>
                  <TouchableOpacity
                    onPress={() => setSubView('repeat')}
                    style={styles.clearBtn}
                  >
                    <Text style={styles.clearBtnText}>{t.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setRecurrence({
                        freq: pendingFreq,
                        endDate: isoDate(endDatePickerDate),
                      })
                      setPendingFreq(null)
                      setSubView('main')
                    }}
                    style={[styles.addBtn, styles.applyBtn]}
                  >
                    <Text style={styles.addBtnText}>{t.done}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {subView === 'customRepeat' && (
              <CustomRecurrenceForm
                initial={recurrence}
                onDone={(rec) => {
                  setRecurrence(rec)
                  setSubView('main')
                }}
                onBack={() => setSubView('repeat')}
              />
            )}

            {subView === 'date' && (
              <>
                <View style={styles.headerRow}>
                  <TouchableOpacity onPress={() => setSubView('main')} hitSlop={10}>
                    <Text style={styles.cancelText}>‹ Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.title}>Completed by</Text>
                  <TouchableOpacity onPress={clearInlineDate} hitSlop={10}>
                    <Text style={styles.clearBtnText}>{t.clear}</Text>
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
                <View style={styles.dateActions}>
                  <TouchableOpacity
                    onPress={() => setSubView('main')}
                    style={[styles.addBtn, styles.applyBtn, { flex: 1 }]}
                  >
                    <Text style={styles.addBtnText}>{t.done}</Text>
                  </TouchableOpacity>
                </View>
              </>
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
      paddingTop: 16,
      paddingBottom: 24,
      paddingHorizontal: 16,
      minHeight: 420,
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
    datePendingLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: c.label2,
      marginBottom: 8,
    },
    datePendingLabelEmpty: {
      color: c.label3,
      fontStyle: 'italic',
      fontWeight: '500',
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
      color: c.label2,
      fontSize: 16,
      fontWeight: '500',
    },
    applyBtn: {
      flex: 1.4,
    },
  })
}
