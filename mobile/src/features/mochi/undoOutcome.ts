/** An inline Undo. Returns nothing (undone at once), a boolean, 'partial'
 * (some of it was put back; later changes were kept), or a Promise of one
 * when it asks first — false means the user cancelled (or the Undo was stale)
 * and nothing was undone. */
export type UndoFn = () => void | boolean | 'partial' | Promise<boolean | 'partial'>

export type UndoResult = 'undone' | 'partial' | 'nothing'

/** Run an Undo and report what it did. */
export async function undoResult(fn: UndoFn | undefined | null): Promise<UndoResult> {
  if (!fn) return 'nothing'
  const r = await fn()
  return r === false ? 'nothing' : r === 'partial' ? 'partial' : 'undone'
}

/** Run an Undo and report whether it actually undid anything. */
export async function undoOutcome(fn: UndoFn | undefined | null): Promise<boolean> {
  return (await undoResult(fn)) !== 'nothing'
}

/** The calm note for an Undo that could only put part of a change back. */
export const PARTIAL_UNDO_NOTE = 'Undone — later changes were kept.'
