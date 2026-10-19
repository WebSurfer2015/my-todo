/** Whether a Mochi capture card's chips (and its Undo) are live. One rule:
 * once a newer Mochi turn applied changes (`undoLive` false) or the to-do
 * was removed from the card, it's read-only — its absolute "put back"
 * values could overwrite what came after. */
export function isCaptureCardEditable(undoLive: boolean, removed: boolean): boolean {
  return undoLive && !removed
}
