export type ViewMode = 'category' | 'status'

export type SystemFilter = 'all' | 'overdue' | 'open' | 'done' | 'trash'
export type StatusFilter = Exclude<SystemFilter, 'all'>
export type Filter = SystemFilter | `cat:${string}`

export const STATUS_FILTERS: StatusFilter[] = ['overdue', 'open', 'done', 'trash']

export type Priority = 'high' | 'medium' | 'low'
export type Category = string

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
}

export const PRIORITY_VALUES: Priority[] = ['high', 'medium', 'low']

/** Apple-system priority hex colors. Hex (vs CSS variables) so the same value works in both DOM and React Native. */
export const PRIORITY_COLORS: Record<Priority, string> = {
  high:   '#FF3B30',
  medium: '#FF9500',
  low:    '#007AFF',
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
