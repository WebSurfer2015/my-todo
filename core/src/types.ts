export type ViewMode = 'category' | 'status'

export type SystemFilter = 'all' | 'overdue' | 'open' | 'done' | 'trash'
export type StatusFilter = Exclude<SystemFilter, 'all'>
export type Filter = SystemFilter | `cat:${string}`

// `trash` is kept in the type for backward-compat with stored profiles
// that may still reference it, but the picker UI no longer surfaces it
// as its own filter. Done covers everything in the 30-day bin.
export const STATUS_FILTERS: StatusFilter[] = ['overdue', 'open', 'done']

/**
 * Composite filter: two independent dimensions ANDed together. Mobile
 * uses this to support "[All] + [Open] + [Work]" pill stacks where the
 * user can scope by status and/or category at the same time. Either
 * dimension can be left undefined ("All" on that axis). Web is still
 * on the legacy single-value Filter — the two models coexist via
 * DeriveInput.
 *
 * NB: 'all' isn't representable in `status` because it's the absence-
 * of-filter state. To express "all statuses, in Work category" you set
 * status: undefined, categoryId: 'work'.
 */
export interface CompositeFilter {
  status?: StatusFilter
  categoryId?: string
}

/** Helpers for round-tripping the legacy single Filter ↔ CompositeFilter. */
export function compositeToLegacy(c: CompositeFilter): Filter {
  if (c.categoryId) return `cat:${c.categoryId}` as Filter
  return c.status ?? 'all'
}
export function legacyToComposite(f: Filter): CompositeFilter {
  if (f === 'all') return {}
  if (isCategoryFilter(f)) return { categoryId: categoryIdFromFilter(f) }
  return { status: f as StatusFilter }
}

export type Priority = 'high' | 'medium' | 'low'
export type Category = string

export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly'
export interface Recurrence {
  freq: RecurrenceFreq
  /** Defaults to 1 (every period). Reserved for future "every N weeks" UI. */
  interval?: number
  /**
   * Day-of-week filter (0=Sunday..6=Saturday). Meaningful for weekly and
   * monthly. For weekly: repeats on each listed weekday. For monthly: combined
   * with bySetPos to express "2nd Thursday", etc.
   */
  byWeekday?: number[]
  /**
   * Week-of-month positions (1..5 from the start; -1 means "last"). Only used
   * with monthly + byWeekday — e.g. byWeekday=[4], bySetPos=[2,4] means the
   * 2nd and 4th Thursday of the month.
   */
  bySetPos?: number[]
  /**
   * Inclusive ISO yyyy-mm-dd end date. When set, the recurrence is expanded
   * into discrete Todo instances at creation time — one Todo per occurrence
   * between dueDate and endDate. todoToggle treats each instance as a normal
   * completion (no rolling). Legacy tasks without endDate keep the rolling
   * behavior: dueDate advances forward on completion.
   */
  endDate?: string
}
export const RECURRENCE_FREQS: RecurrenceFreq[] = ['daily', 'weekly', 'monthly', 'yearly']
/** Weekday short labels — Sun=0. */
export const WEEKDAY_SHORT: readonly string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WEEKDAY_LONG: readonly string[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export interface Subtask {
  id: string
  text: string
  done: boolean
  /** Optional, defaults to 'medium' in mutation helpers. */
  priority?: Priority
  /** Optional ISO yyyy-mm-dd date string. Empty string when unset. */
  dueDate?: string
}

export interface Todo {
  /**
   * Stable, globally-unique id. Strings (UUID v4) since v1; older v0 stores
   * used millisecond timestamps which collide on rapid bursts and across
   * devices. `migrateTodos` rewrites legacy numeric ids on read.
   */
  id: string
  text: string
  done: boolean
  priority: Priority
  dueDate: string
  category?: Category
  trashed: boolean
  trashedAt?: number
  /** ms since epoch; set on every mutation. Used by Firestore sync for last-write-wins per todo. */
  updatedAt?: number
  /**
   * Optional checklist. Parent `done` is kept in sync with `subtasks.every(s => s.done)` by
   * the subtask mutation helpers; toggling the parent propagates to all subtasks.
   */
  subtasks?: Subtask[]
  /**
   * Optional recurrence. When set, marking the task done rolls dueDate forward
   * by the recurrence period instead of completing it — same row keeps moving
   * through time.
   */
  recurrence?: Recurrence
  /**
   * Marks this Todo as one instance of a multi-instance recurring series.
   * All instances generated together share the same seriesId, so "delete
   * this and all future" can find siblings without text matching. Legacy
   * recurring tasks (rolling, or pre-feature multi-instance) won't have
   * a seriesId — they fall back to single-task delete.
   */
  seriesId?: string
  /**
   * Free-form notes for the task — what's blocking it, the smallest first
   * step, why it matters, anything that helps the user externalize the
   * thinking around a task instead of carrying it in their head. Capped
   * at MAX_TODO_NOTES_LEN.
   */
  notes?: string
}

export const PRIORITY_VALUES: Priority[] = ['high', 'medium', 'low']

/**
 * Classic red/orange/blue priority cue but pulled a few stops lighter than
 * iOS bright — recognizable hierarchy without the anxiety-triggering
 * full-saturation red. Bar count (1/2/3) still carries the primary signal.
 */
export const PRIORITY_COLORS: Record<Priority, string> = {
  high:   '#E07878',  // soft coral red
  medium: '#E8A964',  // soft amber
  low:    '#7AA4D4',  // soft slate blue
}

export function isStatusFilter(f: Filter): f is StatusFilter {
  return f === 'overdue' || f === 'open' || f === 'done' || f === 'trash'
}

export function isCategoryFilter(f: Filter): f is `cat:${string}` {
  return typeof f === 'string' && f.startsWith('cat:')
}

export function categoryIdFromFilter(f: `cat:${string}`): string {
  return f.slice(4)
}

export function categoryFilter(id: string): Filter {
  return `cat:${id}`
}
