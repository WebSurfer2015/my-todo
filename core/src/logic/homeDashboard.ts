/**
 * Pure rules behind the Home tab's "Today" dashboard: which to-dos are
 * actionable today, how they sort, the carried-over / due-today split,
 * and the completion counts. Lifted out of HomeScreen so they're unit
 * testable; all dates are local `yyyy-mm-dd` strings (`today` is passed
 * in, never read from the clock).
 */

import type { Priority, Todo } from '../domain/types'
import { PRIORITY_VALUES } from '../domain/types'
import { dueDateOnly, isoDate } from './utils'

/** Number of completions (to-dos + individual steps) per window. */
export interface CompletionCounts {
  today: number
  yesterday: number
  /** Last 7 days, today included. */
  week: number
  /** Last 30 days, today included. */
  month: number
}

function daysBefore(today: string, days: number): string {
  const [y, m, d] = today.split('-').map(Number)
  return isoDate(new Date(y, m - 1, d - days))
}

/**
 * Completion counts relative to `today`. A done to-do counts on its
 * completionDate (trashed or not — done items live in the Done bin), and
 * each done step counts on its own completionDate, independent of its
 * parent, so checking off steps moves the numbers.
 */
export function completionCounts(todos: readonly Todo[], today: string): CompletionCounts {
  const yesterday = daysBefore(today, 1)
  const weekStart = daysBefore(today, 6)
  const monthStart = daysBefore(today, 29)
  const counts: CompletionCounts = { today: 0, yesterday: 0, week: 0, month: 0 }
  const bump = (cd: string) => {
    if (cd === today) counts.today += 1
    if (cd === yesterday) counts.yesterday += 1
    if (cd >= weekStart) counts.week += 1
    if (cd >= monthStart) counts.month += 1
  }
  for (const td of todos) {
    if (td.done && td.completionDate) bump(td.completionDate)
    for (const s of td.subtasks ?? []) {
      if (s.done && s.completionDate) bump(s.completionDate)
    }
  }
  return counts
}

/**
 * Is there still work to do on this to-do TODAY? Open, untrashed rows only.
 *   • With open dated steps: at least one open step is due on/before today
 *     (once those are checked off the parent leaves Today, even if later
 *     or undated steps remain).
 *   • Otherwise (no steps, or no open step carries a date): the to-do's own
 *     dueDate is on/before today — so a to-do due today whose steps are all
 *     undated still shows.
 */
export function isTodayActionable(todo: Todo, today: string): boolean {
  if (todo.trashed || todo.done) return false
  const parentDue = !!todo.dueDate && dueDateOnly(todo.dueDate) <= today
  const openSubs = (todo.subtasks ?? []).filter((s) => !s.done)
  if (openSubs.some((s) => !!s.dueDate)) {
    return openSubs.some((s) => !!s.dueDate && dueDateOnly(s.dueDate) <= today)
  }
  return parentDue
}

/**
 * Today's actionable to-dos, sorted by priority (in `priorityOrder`, the
 * user's ordering; defaults to high → medium → low) then earliest dueDate.
 * Unknown priorities rank as medium.
 */
export function todayActionable(
  todos: readonly Todo[],
  today: string,
  priorityOrder: readonly Priority[] = PRIORITY_VALUES,
): Todo[] {
  const rankOf = new Map<string, number>()
  priorityOrder.forEach((p, i) => { if (!rankOf.has(p)) rankOf.set(p, i) })
  const fallback = rankOf.get('medium') ?? priorityOrder.length
  const rank = (p: string) => rankOf.get(p) ?? fallback
  return todos
    .filter((td) => isTodayActionable(td, today))
    .sort((a, b) => {
      const pa = rank(a.priority)
      const pb = rank(b.priority)
      if (pa !== pb) return pa - pb
      return (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
    })
}

/**
 * Split today's rows for the dashboard headers: `carriedOver` = own dueDate
 * strictly before today; `dueToday` = everything else (due today, or
 * step-driven with no / a future own date). Order is preserved.
 */
export function splitCarriedOver(
  items: readonly Todo[],
  today: string,
): { carriedOver: Todo[]; dueToday: Todo[] } {
  const carriedOver: Todo[] = []
  const dueToday: Todo[] = []
  for (const td of items) {
    if (td.dueDate && dueDateOnly(td.dueDate) < today) carriedOver.push(td)
    else dueToday.push(td)
  }
  return { carriedOver, dueToday }
}
