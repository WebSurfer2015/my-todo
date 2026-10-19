/**
 * Details' "Edit series" close → the ONE commit sent to the store (pure,
 * table-tested; the .tsx sheet only wires it).
 *
 * Series-wide `fields` (text / notes / priority / category) go to this row
 * and every future sibling; this occurrence's own date and reminders ride
 * along as `thisRow`; `extra` carries a dialog's choice (a new repeat rule,
 * or copying the steps shape). Nothing changed → null (no commit, no Undo).
 */
import type { Category, Priority, Reminder, Todo } from '../../../core-bindings/types'
import { getReminders } from '../../../../../core/src/logic/derive'
import type { SeriesCommit } from '../../../store/slices/useTodosSlice'

/** What the sheet has buffered (its form state). */
export interface SeriesEdits {
  text: string
  notes: string
  priority: Priority
  category: Category | undefined
  /** '' = no date. */
  dueDate: string
  reminders: Reminder[]
}

export function buildSeriesCommit(
  todo: Todo,
  edits: SeriesEdits,
  extra: Omit<SeriesCommit, 'fields' | 'thisRow'> = {},
): SeriesCommit | null {
  const trimmedText = edits.text.trim()
  const fields: SeriesCommit['fields'] = {}
  if (trimmedText && trimmedText !== todo.text) fields.text = trimmedText
  if (edits.notes !== (todo.notes ?? '')) fields.notes = edits.notes
  if (edits.priority !== todo.priority) fields.priority = edits.priority
  if (edits.category !== todo.category) fields.category = edits.category
  const thisRow: NonNullable<SeriesCommit['thisRow']> = {}
  const dueDateChanged = edits.dueDate !== (todo.dueDate ?? '')
  const remindersChanged = JSON.stringify(edits.reminders) !== JSON.stringify(getReminders(todo))
  if (dueDateChanged) thisRow.dueDate = edits.dueDate
  if (remindersChanged) thisRow.reminders = edits.reminders
  const hasThisRow = dueDateChanged || remindersChanged
  if (Object.keys(fields).length === 0 && !hasThisRow && !extra.recurrence && !extra.subtasks) return null
  return { fields, ...(hasThisRow ? { thisRow } : {}), ...extra }
}
