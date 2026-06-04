/**
 * "Defer all to" — bottom-sheet date picker for bulk-deferring the
 * open todos in a group.
 *
 * Layout:
 *   ┌───────────────────────────────────────────────┐
 *   │ Cancel              Defer all to         Done │
 *   │              {filter name} ({count})          │
 *   ├───────────────────────────────────────────────┤
 *   │ Tomorrow / Next day      tomorrow, Thu, May 19│
 *   │ A week later              Wed, May 25         │
 *   │ A month later             Fri, Jun 17         │
 *   │ Pick a date                                   │
 *   └───────────────────────────────────────────────┘
 *
 * Each preset row commits on tap and dismisses. "Pick a date" swaps
 * the body to an inline date picker — its own Done commits, Cancel
 * goes BACK to the option list (not to the underlying screen).
 *
 * Date math is anchored on today so the label that's shown matches
 * what actually lands on the todo: every item in the bucket is set
 * to the same target ISO, mirroring the existing bulkDeferTodos
 * contract.
 */

import React, { useMemo, useState } from 'react'
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { ChevronRight, Calendar } from 'lucide-react-native'
import { useTheme, ThemeColors } from '../../app/theme'
import { useLang } from '../../app/LangContext'
import { isoDate } from '../../core-bindings/utils'

interface Props {
  visible: boolean
  /** Human-readable bucket name shown in the subtitle. Bulk callers
   * pass the group label ("Carried over"); single-todo callers pass
   * the todo text. */
  filterLabel?: string
  /** Number of open todos that will be deferred — used for the
   * subtitle's "(N)" suffix. Omit / 0 / 1 to hide the suffix (e.g.
   * single-todo long-press doesn't need a count). */
  count?: number
  /** Tweaks the first option label: today's bucket says "Tomorrow",
   * every other bucket says "Next day". Both target today + 1. */
  isTodayGroup: boolean
  onSelect: (targetISO: string) => void
  onClose: () => void
}

type SubView = 'main' | 'picker'

export default function DeferModal({
  visible,
  filterLabel,
  count,
  isTodayGroup,
  onSelect,
  onClose,
}: Props) {
  const theme = useTheme()
  const { t } = useLang()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const [subView, setSubView] = useState<SubView>('main')
  const [pickerDate, setPickerDate] = useState<Date>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d
  })

  // Reset to the main view every time the sheet (re)opens — so the
  // picker doesn't auto-reappear if the user dismissed without choosing.
  React.useEffect(() => {
    if (visible) {
      setSubView('main')
      const d = new Date()
      d.setDate(d.getDate() + 1)
      setPickerDate(d)
    }
  }, [visible])

  function offsetFromToday(days: number): Date {
    const d = new Date()
    d.setDate(d.getDate() + days)
    return d
  }
  function commit(d: Date) {
    onSelect(isoDate(d))
    onClose()
  }

  const tomorrow = offsetFromToday(1)
  const inAWeek = offsetFromToday(7)
  const inAMonth = offsetFromToday(30)

  const subtitle = filterLabel
    ? count && count > 1
      ? `${filterLabel} (${count})`
      : filterLabel
    : ''

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          {subView === 'main' && (
            <>
              <View style={styles.titleRow}>
                <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.titleSideBtn}>
                  <Text style={styles.cancelText}>{t.cancel}</Text>
                </TouchableOpacity>
                <View style={styles.titleCenter}>
                  {/* "Defer to" for a single todo (swipe action),
                      "Defer all to" for bulk deferrals (group header
                      action). count is the only signal we have for the
                      mode — undefined or 1 means single-todo. */}
                  <Text style={styles.title}>
                    {count && count > 1 ? 'Defer all to' : 'Defer to'}
                  </Text>
                  {subtitle ? (
                    <Text style={styles.subtitle} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.titleSideBtn}>
                  <Text style={styles.doneText}>Done</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.card}>
                <OptionRow
                  label={isTodayGroup ? 'Tomorrow' : 'Next day'}
                  hint={isTodayGroup ? formatTargetDate(tomorrow) : undefined}
                  onPress={() => commit(tomorrow)}
                  styles={styles}
                />
                <Divider styles={styles} />
                <OptionRow
                  label="A week later"
                  hint={isTodayGroup ? formatTargetDate(inAWeek) : undefined}
                  onPress={() => commit(inAWeek)}
                  styles={styles}
                />
                <Divider styles={styles} />
                <OptionRow
                  label="A month later"
                  hint={isTodayGroup ? formatTargetDate(inAMonth) : undefined}
                  onPress={() => commit(inAMonth)}
                  styles={styles}
                />
                <Divider styles={styles} />
                <OptionRow
                  label="Pick a date"
                  icon={<Calendar size={16} color={theme.label3} strokeWidth={2} />}
                  onPress={() => setSubView('picker')}
                  styles={styles}
                />
              </View>
              <View style={{ height: 16 }} />
            </>
          )}

          {subView === 'picker' && (
            <>
              <View style={styles.titleRow}>
                <TouchableOpacity
                  onPress={() => setSubView('main')}
                  hitSlop={10}
                  style={styles.titleSideBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Back to defer options"
                >
                  <Text style={styles.cancelText}>{t.cancel}</Text>
                </TouchableOpacity>
                <View style={styles.titleCenter}>
                  <Text style={styles.title}>Pick a date</Text>
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {formatTargetDate(pickerDate)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => commit(pickerDate)}
                  hitSlop={10}
                  style={styles.titleSideBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Apply selected date"
                >
                  <Text style={styles.doneText}>Done</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.pickerWrap}>
                <DateTimePicker
                  value={pickerDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  minimumDate={new Date()}
                  onChange={(e: DateTimePickerEvent, d?: Date) => {
                    if (Platform.OS === 'android') {
                      // Android picker dismisses itself; treat set as
                      // commit, dismiss as cancel.
                      if (e.type === 'set' && d) commit(d)
                      else setSubView('main')
                    } else if (d) {
                      setPickerDate(d)
                    }
                  }}
                />
              </View>
              <View style={{ height: 16 }} />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function OptionRow({
  label,
  hint,
  icon,
  onPress,
  styles,
}: {
  label: string
  hint?: string
  icon?: React.ReactNode
  onPress: () => void
  styles: ReturnType<typeof makeStyles>
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.65}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
    >
      {/* Icon + label (+ optional date hint) ride together as a single
          centered cluster so the row reads symmetrical against the
          trailing chevron. Date hint joins the cluster for the Today
          group and is dropped for every other bucket. */}
      <View style={styles.rowCenterCluster}>
        {icon}
        <Text style={styles.rowLabel}>{label}</Text>
        {hint && (
          <Text style={styles.rowHintInline} numberOfLines={1}>
            · {hint}
          </Text>
        )}
      </View>
      <ChevronRight size={14} color={styles.rowHint.color as string} strokeWidth={2} />
    </TouchableOpacity>
  )
}

function Divider({ styles }: { styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.divider} />
}

/**
 * Format a target Date as "Thursday, May 19". The option-row label
 * already carries the relative cue ("Tomorrow", "A week later"), so
 * the hint stays purely calendrical to avoid redundancy.
 */
function formatTargetDate(d: Date): string {
  const weekday = d.toLocaleDateString(undefined, { weekday: 'long' })
  const monthDay = d.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  })
  return `${weekday}, ${monthDay}`
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.modal,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingTop: 6,
      paddingBottom: 8,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.gray3,
      marginVertical: 6,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 10,
    },
    titleSideBtn: { width: 72, paddingTop: 2 },
    titleCenter: { flex: 1, alignItems: 'center' },
    title: { fontSize: 17, fontWeight: '700', color: c.label, textAlign: 'center' },
    subtitle: {
      fontSize: 12,
      color: c.label3,
      marginTop: 2,
      textAlign: 'center',
    },
    cancelText: { fontSize: 15, fontWeight: '500', color: c.primary },
    doneText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.primary,
      textAlign: 'right',
    },
    card: {
      marginHorizontal: 16,
      backgroundColor: c.card,
      borderRadius: 12,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 14,
      paddingHorizontal: 14,
      minHeight: 48,
    },
    rowLabel: { fontSize: 15, color: c.label, fontWeight: '500' },
    rowCenterCluster: {
      // Left-align icon + label + hint within the row so the day/date
      // hint hugs the left edge instead of floating in the middle.
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 8,
    },
    rowHintInline: {
      fontSize: 13,
      color: c.label3,
    },
    rowHint: {
      flex: 1,
      fontSize: 13,
      color: c.label3,
      textAlign: 'right',
      marginRight: 4,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginLeft: 14,
    },
    pickerWrap: { paddingHorizontal: 16 },
  })
}
