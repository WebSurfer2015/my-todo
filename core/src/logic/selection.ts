import type { Todo } from '../domain/types'
import { keepSeriesHorizons, todosRestoreFromTrash } from './derive'

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

/** Bulk restore from the Done bin — the same per-row logic as
 * todoRestoreFromTrash (clears done / Not Do / trash fields, reopens done
 * steps), applied only to selected rows that are actually in the bin. */
export function applyBulkRestore(todos: Todo[], ids: Set<string>): Todo[] {
  return todosRestoreFromTrash(todos, ids)
}

/** Hard-delete the selected rows (a series keeps its horizon — see
 * keepSeriesHorizons). */
export function applyBulkDelete(todos: Todo[], ids: Set<string>): Todo[] {
  return keepSeriesHorizons(todos, todos.filter((td) => !ids.has(td.id)))
}
