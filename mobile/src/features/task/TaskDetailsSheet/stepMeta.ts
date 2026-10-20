import type { Priority, Subtask } from '../../../core-bindings/types'
import { dueDateOnly } from '../../../../../core/src/logic/utils'

/**
 * Which of a step's own meta (priority dot, date) the details sheet shows.
 * A step's priority / date only earn a spot on the row when the step HAS one
 * and it differs from its to-do's — repeating the parent's values on every
 * step is noise (calm lens: lower cognitive load). Dates compare by day.
 */
export function stepMetaVisibility(
  step: Pick<Subtask, 'priority' | 'dueDate'>,
  parent: { priority: Priority; dueDate?: string },
): { showPriority: boolean; showDate: boolean } {
  const showPriority = !!step.priority && step.priority !== parent.priority
  const stepDay = step.dueDate ? dueDateOnly(step.dueDate) : ''
  const parentDay = parent.dueDate ? dueDateOnly(parent.dueDate) : ''
  const showDate = !!stepDay && stepDay !== parentDay
  return { showPriority, showDate }
}

/**
 * Bottom inset for the details scroll body. At larger Dynamic Type sizes the
 * fixed footer (Delete · Skip · Mark done) grows taller, so the last step /
 * "Add a step" needs more room to scroll clear of it.
 */
export function detailsBodyBottomInset(fontScale: number): number {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1
  // 16 / 32 = SPACING.lg / SPACING.xxl (kept literal so this stays pure).
  if (scale <= 1) return 16
  return 16 + Math.round(32 * scale)
}
