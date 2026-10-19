/**
 * Details' close "Changes saved · Undo" (pure, unit-tested).
 *
 * Restoring the entry snapshot only puts THIS row back. A repeat added (or
 * changed) while details was open also generated / rebuilt sibling rows,
 * which only that change's tracked Undo can remove. So each repeat change
 * in the session is recorded with its Undo and the row exactly as that
 * change left it, and the close Undo unwinds newest-first:
 *
 *   for each repeat change, newest → oldest:
 *     put the row back as that change left it (so the tracked Undo sees it
 *     untouched — later field edits / the date snap would otherwise make it
 *     skip the row and report a partial undo), then run the tracked Undo
 *     (siblings removed / restored, rule put back);
 *   finally restore the entry snapshot (every other field).
 *
 * Returns whether anything was put back.
 */
import type { Todo } from '../../../core-bindings/types'

export interface RecurrenceStep {
  /** The row right after this repeat change (before any later edit). */
  rowAfter: Todo
  /** That change's tracked Undo (true = something was put back). */
  undo: () => boolean
}

export function buildDetailsUndo(
  snapshot: Todo,
  steps: ReadonlyArray<RecurrenceStep>,
  revertTodo: (row: Todo) => boolean,
): () => boolean {
  const list = [...steps]
  return () => {
    let any = false
    for (let i = list.length - 1; i >= 0; i--) {
      revertTodo(list[i].rowAfter)
      if (list[i].undo()) any = true
    }
    if (revertTodo(snapshot)) any = true
    return any
  }
}
