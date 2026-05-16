import { Priority, Todo } from './types'
import { todayLocal, endOfWeekLocal } from './utils'

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

export type GroupKey = 'overdue' | 'today' | 'week' | 'upcoming' | 'done'

export interface TodoGroup {
  key: GroupKey
  overdue?: boolean
  todos: Todo[]
}

function sortTodos(ts: Todo[]): Todo[] {
  return [...ts].sort((a, b) => {
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
  const buckets: Record<GroupKey, Todo[]> = { overdue: [], today: [], week: [], upcoming: [], done: [] }

  for (const t of todos) {
    const d = t.dueDate
    if (d && d < today) buckets.overdue.push(t)
    else if (!d || d > endOfWeek) buckets.upcoming.push(t)
    else if (d === today) buckets.today.push(t)
    else buckets.week.push(t)
  }

  const groups: TodoGroup[] = []
  if (buckets.today.length)    groups.push({ key: 'today',    todos: sortTodos(buckets.today) })
  if (buckets.overdue.length)  groups.push({ key: 'overdue',  overdue: true, todos: sortTodos(buckets.overdue) })
  if (buckets.week.length)     groups.push({ key: 'week',     todos: sortTodos(buckets.week) })
  if (buckets.upcoming.length) groups.push({ key: 'upcoming', todos: sortTodos(buckets.upcoming) })
  if (buckets.done.length)     groups.push({ key: 'done',     todos: sortTodos(buckets.done) })
  return groups
}
