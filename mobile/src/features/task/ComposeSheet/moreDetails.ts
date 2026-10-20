import type { Priority, Recurrence, Reminder, Subtask } from '../../../core-bindings/types'

/** The Compose fields that live behind the "More details" disclosure. */
export interface ComposeDetailFields {
  priority: Priority
  recurrence?: Recurrence
  reminders: Reminder[]
  notes: string
  subtasks: Subtask[]
}

/** A new to-do's priority when nobody picks one. */
export const COMPOSE_DEFAULT_PRIORITY: Priority = 'medium'

/**
 * Does any field behind "More details" already hold a value? When it does
 * (Mochi's "Review & add" prefill, a reused past to-do, an AI pill), the
 * disclosure opens on its own — a value the user didn't set themselves must
 * never sit hidden behind a collapsed row. Priority counts only when it
 * differs from the default.
 */
export function composeDetailsHaveValue(f: ComposeDetailFields): boolean {
  return (
    f.priority !== COMPOSE_DEFAULT_PRIORITY ||
    f.recurrence !== undefined ||
    f.reminders.length > 0 ||
    f.notes.trim().length > 0 ||
    f.subtasks.length > 0
  )
}
