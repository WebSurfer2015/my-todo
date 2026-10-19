/**
 * VoiceOver for a to-do row — pure, so it's unit-testable. The row is ONE
 * accessibility element, which hides its chips (date, priority, category,
 * reminder, steps) from VoiceOver; the label speaks them instead, and the
 * swipe actions (which VoiceOver can't perform) are offered as custom
 * actions.
 */
import type { Priority } from '../../../core-bindings/types'

export interface RowA11yLabelInput {
  text: string
  /** The date the chip shows ("Mon, Oct 5", "Tomorrow", "Done today"), or
   * null when no date chip is shown. */
  dateLabel: string | null
  /** What the date is: `due` — an open to-do's due date ("Complete by …");
   * `carriedOver` — a past due date on an open to-do; `status` — a Done-bin
   * chip that already says what it is ("Done Mon, Oct 5"). */
  dateKind: 'due' | 'carriedOver' | 'status'
  priority: Priority
  recurring: boolean
  /** The category's display label, or null for none. */
  categoryLabel: string | null
  hasReminder: boolean
  /** Step progress, when the to-do has steps. */
  steps: { done: number; total: number } | null
  done: boolean
  skipped: boolean
  trashed: boolean
}

export function rowAccessibilityLabel(r: RowA11yLabelInput): string {
  const state = r.skipped ? 'skipped' : r.done ? 'completed' : r.trashed ? 'removed' : null
  const date = !r.dateLabel
    ? null
    : r.dateKind === 'carriedOver'
      ? `carried over, ${r.dateLabel}`
      : r.dateKind === 'due'
        ? `Complete by ${r.dateLabel}`
        : r.dateLabel
  return [
    r.text,
    state,
    date,
    `${r.priority} priority`,
    r.recurring ? 'repeats' : null,
    r.categoryLabel,
    r.hasReminder ? 'has a reminder' : null,
    r.steps ? `${r.steps.done} of ${r.steps.total} steps done` : null,
  ]
    .filter(Boolean)
    .join(', ')
}

/** The custom actions a row offers — the same ones its swipes reveal. */
export type RowA11yAction =
  | 'toggleDone'
  | 'toggleSteps'
  | 'edit'
  | 'defer'
  | 'skip'
  | 'delete'
  | 'restore'
  | 'deleteForever'

export function rowAccessibilityActions(r: {
  /** The legacy trash view (selection mode): no completion toggle. */
  inTrash: boolean
  /** Done-bin row (Done filter, trashed, or the trash view). */
  isBin: boolean
  hasSubs: boolean
  canDefer: boolean
  canRestore: boolean
  canDeleteForever: boolean
}): RowA11yAction[] {
  const out: RowA11yAction[] = []
  if (r.isBin) {
    // Restore reopens it — don't also offer a second "Reopen" (toggle).
    if (r.canRestore) out.push('restore')
    else if (!r.inTrash) out.push('toggleDone')
    if (r.hasSubs && !r.inTrash) out.push('toggleSteps')
    if (r.canDeleteForever) out.push('deleteForever')
    return out
  }
  out.push('toggleDone')
  // The steps pill sits inside this one VoiceOver element.
  if (r.hasSubs) out.push('toggleSteps')
  // Same set as the swipes: Edit (not on a parent with steps), Defer, Skip
  // (not on a parent with steps), Delete (to the Done bin, with Undo).
  if (!r.hasSubs) out.push('edit')
  if (r.canDefer) out.push('defer')
  if (!r.hasSubs) out.push('skip')
  out.push('delete')
  return out
}
