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
import { dueDateToDate, dueDateWithDay } from '../../core-bindings/utils'
import { formatCalendarDate } from '../../../../core/src/logic/labels'
import { captureCardRemovalNote, isCaptureCardEditable } from './captureCardEditable'
import type { UndoResult } from './undoOutcome'

interface CreateTodoArgs {
  text: string
  category?: string
  dueDate?: string
  priority?: Priority
  reminders?: { at: string }[]
  notes?: string
}

/** A chip edit on the captured to-do. `category: null` clears it. */
export interface CapturedTodoPatch {
  category?: string | null
  priority?: Priority
  dueDate?: string
}

interface Props {
  args: CreateTodoArgs
  /** The live to-do id (so edits target the applied task). */
  id: string
  categories: CategoryDef[]
  /** Read-only recurrence summary (computed by the caller). */
  recurrenceText: string | null
  /** May return the to-do's ACTUAL due date after the edit (a weekday rule
   * snaps a picked day onto the rule) — the chip then shows that. */
  onEdit: (id: string, patch: CapturedTodoPatch) => void | { dueDate?: string }
  /** Remove the captured to-do entirely (the bottom of the undo stack).
   * Resolves what the removal did ('nothing' when the to-do was already
   * gone or the Undo was retired — the card then says "Nothing to undo"
   * instead of keeping a dead Undo), or null when it was ignored (already
   * running / already ran). */
  onRemove: () => Promise<UndoResult | null>
  /** False once a newer Mochi turn applied changes: the card turns
   * read-only — no chip edits and no Undo (its absolute "put back" values
   * could overwrite what the newer turn did). */
  undoLive?: boolean
}

export default function EditableCaptureCard({
  args,
  id,
  categories,
  recurrenceText,
  onEdit,
  onRemove,
  undoLive = true,
}: Props) {
  const theme = useTheme()
  const { t } = useLang()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const [category, setCategory] = useState<string | undefined>(args.category)
  const [priority, setPriority] = useState<Priority>(args.priority ?? 'medium')
  const [dueDate, setDueDate] = useState<string>(args.dueDate ?? '')
  const [open, setOpen] = useState<'category' | 'date' | null>(null)
  // What the final Undo (the removal) did; null until it ran.
  const [removal, setRemoval] = useState<UndoResult | null>(null)
  const removingRef = useRef(false)
  // Each change pushes its reverse; "Undo" pops the most recent. When empty,
  // the next Undo removes the to-do (the original add).
  const undoStack = useRef<(() => void)[]>([])
  const [, bumpUndo] = useState(0) // force a re-render when the stack changes
  const sync = () => bumpUndo((n) => n + 1)

  const editable = isCaptureCardEditable(undoLive, removal !== null)
  const tray = editable ? open : null
  const activeCat = categories.find((c) => c.id === category)
  // Guard against a malformed dueDate → Invalid Date would crash the picker.
  const pickerValue = (() => {
    if (dueDate) {
      const d = dueDateToDate(dueDate)
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
      // No category before → clear it again (null), so card and store agree.
      onEdit(id, { category: prev ?? null })
    })
    sync()
  }
  const onDateChange = (e: DateTimePickerEvent, d?: Date) => {
    if (e.type === 'set' && d) {
      const prev = dueDate
      // The picked DAY, keeping the to-do's time of day (9:00 stays 9:00).
      const iso = dueDateWithDay(prev, d)
      const res = onEdit(id, { dueDate: iso })
      // Show where it actually landed (a weekday series snaps the day).
      setDueDate((res && res.dueDate) || iso)
      undoStack.current.push(() => {
        const back = onEdit(id, { dueDate: prev })
        setDueDate((back && back.dueDate) || prev)
      })
      sync()
    }
    // Close the tray once the user commits (or dismisses) — on every platform.
    setOpen(null)
  }
  const undoLast = () => {
    const fn = undoStack.current.pop()
    if (fn) {
      fn()
      sync()
    } else {
      // One removal at a time — a fast double tap can't run it twice.
      if (removingRef.current) return
      removingRef.current = true
      void onRemove()
        .then((r) => {
          if (r) setRemoval(r)
        })
        .finally(() => {
          removingRef.current = false
        })
    }
  }

  return (
    <View>
      <Text style={styles.kind}>Added to your to-dos</Text>
      <Text style={styles.title}>{args.text}</Text>
      <View style={styles.chipRow}>
        <TouchableOpacity
          style={editable ? styles.editChip : styles.roChip}
          disabled={!editable}
          onPress={() => setOpen((p) => (p === 'category' ? null : 'category'))}
          accessibilityRole="button"
          accessibilityLabel={activeCat ? `${categoryLabel(activeCat, t)}, category` : 'Category, none'}
          accessibilityHint={editable ? 'Changes the category' : undefined}
        >
          <Text style={editable ? styles.editChipText : styles.roChipText}>
            {activeCat ? categoryLabel(activeCat, t) : 'Category'}
          </Text>
          {editable && <ChevronDown size={12} color={theme.primary} strokeWidth={2.4} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={editable ? styles.editChip : styles.roChip}
          disabled={!editable}
          onPress={() => setOpen((p) => (p === 'date' ? null : 'date'))}
          accessibilityRole="button"
          accessibilityLabel={dueDate ? `${formatCalendarDate(dueDate, { locale: t.locale })}, complete by` : 'Add date'}
          accessibilityHint={editable ? 'Changes the complete-by date' : undefined}
        >
          <Text style={editable ? styles.editChipText : styles.roChipText}>
            {dueDate ? formatCalendarDate(dueDate, { locale: t.locale }) : 'Add date'}
          </Text>
          {editable && <ChevronDown size={12} color={theme.primary} strokeWidth={2.4} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={editable ? styles.editChip : styles.roChip}
          disabled={!editable}
          onPress={cyclePriority}
          accessibilityRole="button"
          accessibilityLabel={`${t.priority[priority]} priority`}
          accessibilityHint={editable ? 'Switches to the next priority' : undefined}
        >
          <PriorityDot level={priority} size={10} />
          <Text style={editable ? styles.editChipText : styles.roChipText}>{t.priority[priority]}</Text>
        </TouchableOpacity>

        {recurrenceText && (
          <View style={styles.roChip}>
            <Text style={styles.roChipText}>{recurrenceText}</Text>
          </View>
        )}
        {args.reminders?.map((r, i) => (
          <View key={i} style={styles.roChip}>
            <Bell size={11} color={theme.label3} strokeWidth={2.2} />
            <Text style={styles.roChipText}>{`Remind ${formatCalendarDate(r.at, { locale: t.locale })}`}</Text>
          </View>
        ))}
      </View>

      {/* Editing controls live in a recessed tray with a header — visually a
          transient menu, distinct from the chip row that shows the to-do's
          actual values. */}
      {tray === 'category' && (
        <View style={styles.pickerPanel}>
          <Text style={styles.pickerPanelLabel}>Choose a category</Text>
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
        </View>
      )}
      {tray === 'date' && (
        <View style={styles.pickerPanel}>
          <Text style={styles.pickerPanelLabel}>Pick a date</Text>
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
        {removal ? (
          <Text style={styles.removedNote}>{captureCardRemovalNote(removal)}</Text>
        ) : (
          <>
            {/* Already added — the header says so; the footer is only Undo. */}
            {editable && (
            <TouchableOpacity
              onPress={undoLast}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Undo last change"
            >
              <Text style={styles.undoText}>Undo</Text>
            </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    // 12pt label2 (AA) — matches ChatSheet's proposalKind.
    kind: {
      fontSize: 12,
      fontWeight: '700',
      color: c.label2,
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
    // A recessed "menu tray" that frames the editing controls so they read as
    // a transient picker, not as more of the to-do's own fields.
    pickerPanel: {
      marginTop: 8,
      padding: 10,
      borderRadius: 12,
      backgroundColor: c.surfaceAlt,
      alignItems: 'flex-start',
    },
    pickerPanelLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: c.label3,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    catPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    // White pills pop out of the recessed tray — clearly selectable options.
    catOption: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    catOptionActive: { backgroundColor: c.primary, borderColor: c.primary },
    catOptionText: { fontSize: 13, fontWeight: '600', color: c.label2 },
    catOptionTextActive: { color: c.primaryOn },
    notes: { fontSize: 13, color: c.label3, fontStyle: 'italic', marginTop: 6 },
    actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
    removedNote: { fontSize: 13, fontWeight: '600', color: c.label3, marginTop: 8 },
    undoText: { fontSize: 13, fontWeight: '700', color: c.primary },
  })
}
