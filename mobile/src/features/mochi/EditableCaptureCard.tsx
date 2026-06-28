/**
 * The proposal card for a to-do Mochi JUST captured (optimistically applied).
 * Its Category / Due-date / Priority chips are tap-to-edit — they update the
 * live task in place, so you can fix what Mochi got slightly wrong without
 * leaving the chat. Recurrence + reminders stay read-only (edit via the task).
 */
import React, { useMemo, useRef, useState } from 'react'
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { ChevronDown, Bell } from 'lucide-react-native'
import PriorityDot from '../../ui/PriorityDot'
import { useTheme, ThemeColors } from '../../app/theme'
import { useLang } from '../../app/LangContext'
import { CategoryDef, categoryLabel } from '../../core-bindings/categories'
import { Priority, PRIORITY_VALUES } from '../../core-bindings/types'
import { formatDisplayDate, isoDate } from '../../core-bindings/utils'

interface CreateTodoArgs {
  text: string
  category?: string
  dueDate?: string
  priority?: Priority
  reminders?: { at: string }[]
  notes?: string
}

interface Props {
  args: CreateTodoArgs
  /** The live to-do id (so edits target the applied task). */
  id: string
  categories: CategoryDef[]
  /** Read-only recurrence summary (computed by the caller). */
  recurrenceText: string | null
  onEdit: (id: string, patch: { category?: string; priority?: Priority; dueDate?: string }) => void
  /** Remove the captured to-do entirely (the bottom of the undo stack). */
  onRemove: () => void
}

export default function EditableCaptureCard({
  args,
  id,
  categories,
  recurrenceText,
  onEdit,
  onRemove,
}: Props) {
  const theme = useTheme()
  const { t } = useLang()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const [category, setCategory] = useState<string | undefined>(args.category)
  const [priority, setPriority] = useState<Priority>(args.priority ?? 'medium')
  const [dueDate, setDueDate] = useState<string>(args.dueDate ?? '')
  const [open, setOpen] = useState<'category' | 'date' | null>(null)
  const [removed, setRemoved] = useState(false)
  // Each change pushes its reverse; "Undo" pops the most recent. When empty,
  // the next Undo removes the to-do (the original add).
  const undoStack = useRef<(() => void)[]>([])
  const [, bumpUndo] = useState(0) // force a re-render when the stack changes
  const sync = () => bumpUndo((n) => n + 1)

  const activeCat = categories.find((c) => c.id === category)
  // Guard against a malformed dueDate → Invalid Date would crash the picker.
  const pickerValue = (() => {
    if (dueDate) {
      const d = new Date(`${dueDate}T00:00:00`)
      if (!isNaN(d.getTime())) return d
    }
    return new Date()
  })()

  const cyclePriority = () => {
    const prev = priority
    const next = PRIORITY_VALUES[(PRIORITY_VALUES.indexOf(priority) + 1) % PRIORITY_VALUES.length]
    setPriority(next)
    onEdit(id, { priority: next })
    undoStack.current.push(() => {
      setPriority(prev)
      onEdit(id, { priority: prev })
    })
    sync()
  }
  const pickCategory = (cid: string) => {
    const prev = category
    setCategory(cid)
    onEdit(id, { category: cid })
    setOpen(null)
    undoStack.current.push(() => {
      setCategory(prev)
      if (prev !== undefined) onEdit(id, { category: prev })
    })
    sync()
  }
  const onDateChange = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') setOpen(null)
    if (e.type === 'set' && d) {
      const prev = dueDate
      const iso = isoDate(d)
      setDueDate(iso)
      onEdit(id, { dueDate: iso })
      undoStack.current.push(() => {
        setDueDate(prev)
        onEdit(id, { dueDate: prev })
      })
      sync()
    }
  }
  const undoLast = () => {
    const fn = undoStack.current.pop()
    if (fn) {
      fn()
      sync()
    } else {
      onRemove()
      setRemoved(true)
    }
  }

  return (
    <View>
      <Text style={styles.kind}>New to-do</Text>
      <Text style={styles.title}>{args.text}</Text>
      <View style={styles.chipRow}>
        <TouchableOpacity
          style={styles.editChip}
          onPress={() => setOpen((p) => (p === 'category' ? null : 'category'))}
          accessibilityRole="button"
          accessibilityLabel={`Category, ${activeCat ? categoryLabel(activeCat, t) : 'none'}. Tap to change.`}
        >
          <Text style={styles.editChipText}>
            {activeCat ? categoryLabel(activeCat, t) : 'Category'}
          </Text>
          <ChevronDown size={12} color={theme.primary} strokeWidth={2.4} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.editChip}
          onPress={() => setOpen((p) => (p === 'date' ? null : 'date'))}
          accessibilityRole="button"
          accessibilityLabel={`Due ${dueDate ? formatDisplayDate(dueDate, t.locale) : 'not set'}. Tap to change.`}
        >
          <Text style={styles.editChipText}>
            {dueDate ? formatDisplayDate(dueDate, t.locale) : 'Add date'}
          </Text>
          <ChevronDown size={12} color={theme.primary} strokeWidth={2.4} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.editChip}
          onPress={cyclePriority}
          accessibilityRole="button"
          accessibilityLabel={`Priority ${t.priority[priority]}. Tap to cycle.`}
        >
          <PriorityDot level={priority} size={10} />
          <Text style={styles.editChipText}>{t.priority[priority]}</Text>
        </TouchableOpacity>

        {recurrenceText && (
          <View style={styles.roChip}>
            <Text style={styles.roChipText}>{recurrenceText}</Text>
          </View>
        )}
        {args.reminders?.map((r, i) => (
          <View key={i} style={styles.roChip}>
            <Bell size={11} color={theme.label3} strokeWidth={2.2} />
            <Text style={styles.roChipText}>{r.at.replace('T', ' ')}</Text>
          </View>
        ))}
      </View>

      {open === 'category' && (
        <View style={styles.catPicker}>
          {categories.map((c) => {
            const sel = c.id === category
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.catOption, sel && styles.catOptionActive]}
                onPress={() => pickCategory(c.id)}
              >
                <Text style={[styles.catOptionText, sel && styles.catOptionTextActive]}>
                  {categoryLabel(c, t)}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      )}
      {open === 'date' && (
        <View style={styles.datePickerWrap}>
          <DateTimePicker
            value={pickerValue}
            mode="date"
            // compact (not inline) — the full inline calendar needs more width
            // than the chat bubble allows and crashes; compact is a small field
            // that opens a popover, fitting tight spaces.
            display={Platform.OS === 'ios' ? 'compact' : 'default'}
            themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
            onChange={onDateChange}
          />
        </View>
      )}

      {args.notes ? <Text style={styles.notes}>{args.notes}</Text> : null}

      {/* Multi-level undo: each Undo reverts the most recent change; the last
          one removes the to-do. */}
      <View style={styles.actionRow}>
        {removed ? (
          <Text style={styles.removedNote}>Removed</Text>
        ) : (
          <>
            <Text style={styles.addedNote}>✓ Added</Text>
            <TouchableOpacity
              onPress={undoLast}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Undo last change"
            >
              <Text style={styles.undoText}>Undo</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    kind: {
      fontSize: 11,
      fontWeight: '700',
      color: c.label3,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    title: { fontSize: 17, fontWeight: '600', color: c.label },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    // Editable chips read as tappable: accent border + chevron.
    editChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: c.primarySoft,
      borderWidth: 1,
      borderColor: c.primary,
    },
    editChipText: { fontSize: 13, fontWeight: '600', color: c.primary },
    roChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: c.surfaceAlt,
    },
    roChipText: { fontSize: 13, fontWeight: '500', color: c.label3 },
    catPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    catOption: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: c.surfaceAlt,
    },
    catOptionActive: { backgroundColor: c.primary },
    catOptionText: { fontSize: 13, fontWeight: '600', color: c.label2 },
    catOptionTextActive: { color: c.primaryOn },
    notes: { fontSize: 13, color: c.label3, fontStyle: 'italic', marginTop: 6 },
    datePickerWrap: { marginTop: 8, alignItems: 'flex-start' },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
    addedNote: { fontSize: 13, fontWeight: '600', color: c.label3 },
    removedNote: { fontSize: 13, fontWeight: '600', color: c.label3, marginTop: 8 },
    undoText: { fontSize: 13, fontWeight: '700', color: c.primary },
  })
}
