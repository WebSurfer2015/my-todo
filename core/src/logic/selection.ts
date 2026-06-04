import type { Todo } from '../domain/types'

export interface ToggleArgs {
  prev: Set<string>
  id: string
  shiftKey: boolean
  lastSelected: string | null
  orderedIds: string[]
}

export function toggleSelection({
  prev, id, shiftKey, lastSelected, orderedIds,
}: ToggleArgs): Set<string> {
  const next = new Set(prev)
  if (shiftKey && lastSelected !== null) {
    const lastIdx = orderedIds.indexOf(lastSelected)
    const curIdx = orderedIds.indexOf(id)
    if (lastIdx >= 0 && curIdx >= 0) {
      const [a, b] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx]
      for (let i = a; i <= b; i++) next.add(orderedIds[i])
      return next
    }
  }
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export function applyBulkRestore(todos: Todo[], ids: Set<string>): Todo[] {
  const now = Date.now()
  return todos.map((td) => {
    if (!ids.has(td.id)) return td
    const { trashedAt: _trashedAt, ...rest } = td
    return { ...rest, trashed: false, updatedAt: now }
  })
}

export function applyBulkDelete(todos: Todo[], ids: Set<string>): Todo[] {
  return todos.filter((td) => !ids.has(td.id))
}
