import type { UndoOutcome } from '../../store/slices/useTodosSlice'

/** An inline Undo. Returns nothing (undone at once), the store's UndoOutcome
 * (true / false / 'partial' — part of it was put back; later changes were
 * kept), or a Promise of one. false means nothing was undone (everything it
 * touched changed since, or it was retired). */
export type UndoFn = () => void | UndoOutcome | Promise<UndoOutcome>

/** What running an inline Undo did. */
export type UndoResult = 'undone' | 'partial' | 'nothing'

/** Run an Undo and report what it did. */
export async function undoResult(fn: UndoFn | undefined | null): Promise<UndoResult> {
  if (!fn) return 'nothing'
  const r = await fn()
  return r === false ? 'nothing' : r === 'partial' ? 'partial' : 'undone'
}
