import { Priority, Todo } from './types'
import { todayLocal, endOfWeekLocal } from './utils'

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

export type GroupKey = 'overdue' | 'today' | 'week' | 'upcoming'

export interface TodoGroup {
  key: GroupKey
  overdue?: boolean
  todos: Todo[]
}

function sortTodos(ts: Todo[]): Todo[] {
  return [...ts].sort((a, b) => {
    const pd = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    if (pd !== 0) return pd
    if (!a.dueDate && !b.dueDate) return a.id - b.id
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate.localeCompare(b.dueDate)
  })
}

export function buildGroups(todos: Todo[]): TodoGroup[] {
  const today = todayLocal()
  const endOfWeek = endOfWeekLocal()

  const buckets: Record<GroupKey, Todo[]> = { overdue: [], today: [], week: [], upcoming: [] }

  for (const t of todos) {
    const d = t.dueDate
    if (!d || d > endOfWeek)  buckets.upcoming.push(t)
    else if (d < today)       buckets.overdue.push(t)
    else if (d === today)     buckets.today.push(t)
    else                      buckets.week.push(t)
  }

  const groups: TodoGroup[] = []
  if (buckets.overdue.length)  groups.push({ key: 'overdue',  overdue: true, todos: sortTodos(buckets.overdue) })
  if (buckets.today.length)    groups.push({ key: 'today',    todos: sortTodos(buckets.today) })
  if (buckets.week.length)     groups.push({ key: 'week',     todos: sortTodos(buckets.week) })
  if (buckets.upcoming.length) groups.push({ key: 'upcoming', todos: sortTodos(buckets.upcoming) })
  return groups
}
