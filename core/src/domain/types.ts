export type ViewMode = 'category' | 'status'

export type SystemFilter = 'groceries' | 'all' | 'overdue' | 'open' | 'done' | 'trash' | 'notDo'
export type StatusFilter = Exclude<SystemFilter, 'all' | 'groceries'>
export type Filter = SystemFilter | `cat:${string}` | `pri:${Priority}`

// `trash` is kept in the type for backward-compat with stored profiles
// that may still reference it, but the picker UI no longer surfaces it
// as its own filter. Done covers everything in the 30-day bin.
//
// `notDo` is part of the type union from R1 (recurring redesign) but is
// intentionally NOT added to STATUS_FILTERS until R5 — until the Skip
// action lands and there's something to filter for, a 4th pill would be
// empty noise.
export const STATUS_FILTERS: StatusFilter[] = ['overdue', 'open', 'done']

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
  /** ISO yyyy-mm-dd, stamped when `done` flips true via subtaskToggle.
   * Powers the Home dToday / dWeek / dMonth stats — sub completions
   * contribute alongside parent completions. Cleared on un-check. */
  completionDate?: string
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
   * Set when the user has applied a per-instance edit to a series row
   * via the "Apply to this todo only" path. Subsequent series-wide
   * edits skip detached instances by default (the frequency-change
   * and subtask-edit confirms surface a "keep modified" option). Pure
   * series instances stay false/undefined.
   */
  detachedFromSeries?: boolean
  /**
   * Optional terminal state distinct from `done` and `trashed`.
   * Currently the only value is `'notDo'` — set when the user Skips a
   * past-due (recurring) instance. Skipped instances are NOT counted
   * as completions (no pebble) and NOT counted as overdue; they sit
   * in a Not-do filter view and can be restored.
   */
  status?: 'notDo'
  /**
   * Free-form notes for the task — what's blocking it, the smallest first
   * step, why it matters, anything that helps the user externalize the
   * thinking around a task instead of carrying it in their head. Capped
   * at MAX_TODO_NOTES_LEN.
   */
  notes?: string
  /**
   * ISO yyyy-mm-dd local date set on the user-visible transition into the
   * Done bin (toggle to done, or Mark done). Cleared on restore. Used to
   * group the Done view by day. Distinct from `trashedAt` (ms timestamp,
   * sync-layer concern); items predating this field stay legacy with no
   * completionDate and surface in the "Earlier" group.
   */
  completionDate?: string
  /**
   * Legacy single-reminder field (pre-multi-reminder schema). Still
   * honored on READ via `getReminders(td)` — old docs / cross-device
   * data may carry this. New writes use `reminders` exclusively.
   * Keep the field in the type for migration symmetry; remove once
   * every persisted doc has been written through a multi-reminder
   * client.
   */
  reminder?: {
    at: string
    intervalMinutes?: number
    until?: string
  }
  /**
   * Multi-reminder list. Each entry fires independently; the
   * scheduler (`syncTodoReminders`) walks all of them and dedupes
   * via the per-entry `id`.
   *
   * Entry shape:
   *  - One-shot: only `at` is set. Fires once at the given local time.
   *  - Recurring: `at` is the first fire, `intervalMinutes` is the
   *    period, `until` is the inclusive cutoff. When `until` is
   *    omitted, the scheduler caps at MAX_FIRES_PER_TODO so an
   *    "until complete" reminder can't run forever.
   *
   * `at`/`until` are ISO 8601 local datetimes (`yyyy-mm-ddTHH:mm`).
   * Cleared when the todo is done, trashed, or skipped. For series
   * instances, R7's transferSeriesReminder rolls every entry to
   * the next-upcoming sibling on completion / skip.
   */
  reminders?: Reminder[]
}

/** Individual reminder entry in `Todo.reminders[]`. */
export interface Reminder {
  /** Stable UUID so the scheduler's per-fire identifier
   * (`todo:<todoId>:<reminderId>:<fireIndex>`) stays distinct
   * across edits and across same-todo entries. */
  id: string
  /** Absolute local ISO datetime of the (first) fire — always set, so the
   * scheduler works off this directly. For "before due" reminders it's
   * computed as the due moment minus `offsetMinutes` and rebased whenever
   * the due date changes / per recurrence occurrence. */
  at: string
  /**
   * "Before due" mode: minutes before the todo's due datetime that this
   * reminder fires. When set, `at` is derived from the due (and kept in
   * sync on edits / per occurrence). Absent = a fixed absolute reminder.
   */
  offsetMinutes?: number
  /** "Repeating" mode: re-fire every N minutes after `at` (the UI offers
   * minutes / hours / days, stored as minutes). */
  intervalMinutes?: number
  until?: string
}

/**
 * Lightweight historical record stored separately from `Todo[]`. Written
 * to `users/{uid}/state/todoReferences` and queried by ComposeSheet to
 * surface "you've added this before" auto-fill suggestions. Trimmed
 * shape — just enough to repopulate a new compose with the same
 * category / priority / recurrence the user originally picked.
 *
 * Dedupe key is `textLower`. Each new completion of the same text
 * updates the existing entry in place (bumping `lastSeenAt`) so the
 * suggestion list ranks by recency without bloating.
 */
export interface TodoReference {
  /** Lowercased, trimmed text — the dedupe key. */
  textLower: string
  /** Original-case text from the most recent completion; what the
   * suggestion row displays. */
  text: string
  category?: Category
  priority?: Priority
  recurrence?: Recurrence
  /** ms since epoch — used for sort + eventual pruning. dueDate is
   * intentionally NOT stored here: it's a per-instance scheduling
   * choice, not a property of the recurring task identity. */
  lastSeenAt: number
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
  return f === 'overdue' || f === 'open' || f === 'done' || f === 'trash' || f === 'notDo'
}

export function isGroceryFilter(f: Filter): f is 'groceries' {
  return f === 'groceries'
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

export function isPriorityFilter(f: Filter): f is `pri:${Priority}` {
  return typeof f === 'string' && f.startsWith('pri:')
}

export function priorityFromFilter(f: `pri:${Priority}`): Priority {
  return f.slice(4) as Priority
}

export function priorityFilter(p: Priority): Filter {
  return `pri:${p}`
}
