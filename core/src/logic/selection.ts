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
    // Mirror todoRestoreFromTrash (derive.ts): clear done + completionDate as
    // well as the trash flags. Completed tasks live in the same Done/trash bin,
    // so restoring them must return them to the ACTIVE list — otherwise they
    // come back done:true/trashed:false, counted active but struck-through, and
    // can never leave.
    const { trashedAt: _trashedAt, completionDate: _completionDate, ...rest } = td
    return { ...rest, done: false, trashed: false, updatedAt: now }
  })
}

export function applyBulkDelete(todos: Todo[], ids: Set<string>): Todo[] {
  return todos.filter((td) => !ids.has(td.id))
}
