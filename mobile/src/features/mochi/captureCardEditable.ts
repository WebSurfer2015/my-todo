import { PARTIAL_UNDO_MESSAGE } from '../../store/slices/useTodosSlice'
import type { UndoResult } from './undoOutcome'

/** Whether a Mochi capture card's chips (and its Undo) are live. One rule:
 * once a newer Mochi turn applied changes (`undoLive` false) or the to-do
 * was removed from the card, it's read-only — its absolute "put back"
 * values could overwrite what came after. */
export function isCaptureCardEditable(undoLive: boolean, removed: boolean): boolean {
  return undoLive && !removed
}

/** The capture card's footer once its final Undo (removing the to-do) ran:
 * only "Removed" when something was actually removed. */
export function captureCardRemovalNote(r: UndoResult): string {
  if (r === 'partial') return PARTIAL_UNDO_MESSAGE
  if (r === 'nothing') return 'Nothing to undo'
  return 'Removed'
}

/** Mochi often phrases a capture as a promise ("I'll add milk."), but a single
 * to-do / shopping item is added the moment the reply lands — show it in the
 * past tense. Display-only: the signed wire text is never changed. */
export function addedReplyText(content: string): string {
  return content.replace(/^\s*I(?:'ll| will) (?:add|put|pop|jot(?: down)?)\b\s*/i, 'Added ')
}
