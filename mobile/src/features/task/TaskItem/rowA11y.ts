/**
 * VoiceOver for a to-do row — pure, so it's unit-testable. The row is ONE
 * accessibility element, which hides its chips (date, priority, category,
 * reminder, steps) from VoiceOver; the label speaks them instead, and the
 * swipe actions (which VoiceOver can't perform) are offered as custom
 * actions.
 */
import type { Priority } from '../../../core-bindings/types'
import type { Strings } from '../../../core-bindings/i18n'

/** The words a row's VoiceOver label and actions use. v2 launches
 * English-only, so the ones without an i18n key are English; the rest come
 * from `t` (see rowA11yStrings). */
export interface RowA11yStrings {
  completeBy: string
  carriedOver: string
  completed: string
  skipped: string
  removed: string
  /** A priority's display label ("High"), never the raw enum. */
  priorityLabels: Record<Priority, string>
  /** "High priority" from the display label. */
  priority: (label: string) => string
  repeats: string
  hasReminder: string
  steps: (done: number, total: number) => string
  showSteps: string
  hideSteps: string
}

export const ROW_A11Y_STRINGS_EN: RowA11yStrings = {
  completeBy: 'Complete by',
  carriedOver: 'carried over',
  completed: 'completed',
  skipped: 'skipped',
  removed: 'removed',
  priorityLabels: { high: 'High', medium: 'Medium', low: 'Low' },
  priority: (label) => `${label} priority`,
  repeats: 'repeats',
  hasReminder: 'has a reminder',
  steps: (done, total) => `${done} of ${total} steps done`,
  showSteps: 'Show steps',
  hideSteps: 'Hide steps',
}

/** The row strings for the current language: what `t` has a key for, the
 * English fallback for the rest. */
export function rowA11yStrings(t: Partial<Pick<Strings, 'composeDateLabel' | 'priority'>>): RowA11yStrings {
  return {
    ...ROW_A11Y_STRINGS_EN,
    completeBy: t.composeDateLabel || ROW_A11Y_STRINGS_EN.completeBy,
    priorityLabels: { ...ROW_A11Y_STRINGS_EN.priorityLabels, ...t.priority },
  }
}

export interface RowA11yLabelInput {
  text: string
  /** The date the chip shows ("Mon, Oct 5", "Tomorrow", "Done today"), or
   * null when no date chip is shown. */
  dateLabel: string | null
  /** What the date is: `due` — an open to-do's due date ("Complete by …");
   * `carriedOver` — a past due date on an open to-do; `status` — a Done-bin
   * chip that already says what it is ("Done Mon, Oct 5"), or a done /
   * deleted row's plain day (its state is spoken already). A skipped row's
   * status chip ("Skipped") is dropped — the state says it. */
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

export function rowAccessibilityLabel(r: RowA11yLabelInput, s: RowA11yStrings = ROW_A11Y_STRINGS_EN): string {
  const state = r.skipped ? s.skipped : r.done ? s.completed : r.trashed ? s.removed : null
  const date = !r.dateLabel || (r.skipped && r.dateKind === 'status')
    ? null
    : r.dateKind === 'carriedOver'
      ? `${s.carriedOver}, ${r.dateLabel}`
      : r.dateKind === 'due'
        ? `${s.completeBy} ${r.dateLabel}`
        : r.dateLabel
  return [
    r.text,
    state,
    date,
    s.priority(s.priorityLabels[r.priority] ?? r.priority),
    r.recurring ? s.repeats : null,
    r.categoryLabel,
    r.hasReminder ? s.hasReminder : null,
    r.steps ? s.steps(r.steps.done, r.steps.total) : null,
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
