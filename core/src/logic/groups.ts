import { Priority, Todo } from '../domain/types'
import { todayLocal, endOfWeekLocal, dueDateOnly } from './utils'

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

export type GroupKey = 'overdue' | 'today' | 'week' | 'upcoming' | 'noDate' | 'done'

export interface TodoGroup {
  key: GroupKey
  overdue?: boolean
  todos: Todo[]
}

function sortTodos(ts: Todo[]): Todo[] {
  return [...ts].sort((a, b) => {
    // Done rows sink to the bottom of their bucket so active work stays
    // in view after a tap-to-complete. Mirrors HomeScreen's TODAY sort.
    if (a.done !== b.done) return a.done ? 1 : -1
    const pd = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    if (pd !== 0) return pd
    if (!a.dueDate && !b.dueDate) return a.id.localeCompare(b.id)
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate.localeCompare(b.dueDate)
  })
}

export function buildGroups(todos: Todo[]): TodoGroup[] {
  const today = todayLocal()
  const endOfWeek = endOfWeekLocal()

  // 'done' is kept in the GroupKey union for type compat with older callers
  // and in case the bucket is reintroduced later. It is never populated by
  // the current implementation — every todo flows to its date bucket
  // regardless of done state. The dedicated "Done" filter view is where
  // users see only completed items; this is the All-view layout.
  const buckets: Record<GroupKey, Todo[]> = { overdue: [], today: [], week: [], upcoming: [], noDate: [], done: [] }

  for (const t of todos) {
    // Bucket on the date portion only — time-bearing todos (e.g.
    // 'by 3pm tomorrow') must sit in the same daily bucket as
    // date-only siblings on the same day. Sort within bucket still
    // uses the raw dueDate so timed items order by clock.
    const d = dueDateOnly(t.dueDate)
    if (!d) buckets.noDate.push(t)
    else if (d < today) buckets.overdue.push(t)
    else if (d > endOfWeek) buckets.upcoming.push(t)
    else if (d === today) buckets.today.push(t)
    else buckets.week.push(t)
  }

  const groups: TodoGroup[] = []
  if (buckets.today.length)    groups.push({ key: 'today',    todos: sortTodos(buckets.today) })
  if (buckets.overdue.length)  groups.push({ key: 'overdue',  overdue: true, todos: sortTodos(buckets.overdue) })
  if (buckets.week.length)     groups.push({ key: 'week',     todos: sortTodos(buckets.week) })
  if (buckets.upcoming.length) groups.push({ key: 'upcoming', todos: sortTodos(buckets.upcoming) })
  if (buckets.noDate.length)   groups.push({ key: 'noDate',   todos: sortTodos(buckets.noDate) })
  if (buckets.done.length)     groups.push({ key: 'done',     todos: sortTodos(buckets.done) })
  return groups
}

/**
 * Group the Done bin by completion date. Items with `completionDate` are
 * bucketed under that ISO yyyy-mm-dd; items without (pre-feature legacy)
 * fall into a single 'earlier' bucket at the bottom. Bucket order:
 * today → yesterday → recent dates desc → earlier.
 */
export interface DoneGroup {
  /** ISO yyyy-mm-dd date for dated buckets, or 'earlier' for legacy items. */
  key: string
  /** True for the today bucket so callers can render "Today" specially. */
  isToday?: boolean
  /** True for the yesterday bucket so callers can render "Yesterday" specially. */
  isYesterday?: boolean
  /** True for the catch-all bucket of legacy items with no completionDate. */
  isEarlier?: boolean
  todos: Todo[]
}

function yesterdayLocalISO(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function buildDoneGroups(todos: Todo[]): DoneGroup[] {
  const today = todayLocal()
  const yesterday = yesterdayLocalISO()
  const byDate = new Map<string, Todo[]>()
  const earlier: Todo[] = []
  for (const t of todos) {
    if (!t.completionDate) { earlier.push(t); continue }
    const list = byDate.get(t.completionDate)
    if (list) list.push(t)
    else byDate.set(t.completionDate, [t])
  }
  // Sort each bucket: most recently trashed first (so the user's latest
  // completion sits at the top of its day).
  function withinDay(a: Todo, b: Todo) {
    return (b.trashedAt ?? 0) - (a.trashedAt ?? 0)
  }
  const datedKeys = [...byDate.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  const groups: DoneGroup[] = []
  for (const k of datedKeys) {
    const todos = [...(byDate.get(k) ?? [])].sort(withinDay)
    groups.push({
      key: k,
      isToday: k === today,
      isYesterday: k === yesterday,
      todos,
    })
  }
  if (earlier.length) {
    groups.push({ key: 'earlier', isEarlier: true, todos: [...earlier].sort(withinDay) })
  }
  return groups
}
