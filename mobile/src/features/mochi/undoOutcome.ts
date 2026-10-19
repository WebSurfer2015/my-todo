/** An inline Undo. Returns nothing (undone at once), a boolean, or a Promise
 * of one when it asks first — false means the user cancelled (or the Undo
 * was stale) and nothing was undone. */
export type UndoFn = () => void | boolean | Promise<boolean>

/** Run an Undo and report whether it actually undid anything. */
export async function undoOutcome(fn: UndoFn | undefined): Promise<boolean> {
  if (!fn) return false
  const r = fn()
  return (await r) !== false
}
