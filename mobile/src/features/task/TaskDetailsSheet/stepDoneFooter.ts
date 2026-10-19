/**
 * Details' sticky footer after a step toggle (pure, table-tested).
 *
 * Finishing the LAST open step completes the to-do. The store's
 * "Completed · Undo" snackbar sits behind the sheet, so the sheet shows
 * that Undo inline ("✓ Done · Undo") and keeps its normal footer (not the
 * Done-bin "Delete forever / Reopen" pair) until it closes.
 */

interface StepTodo {
  done?: boolean
  trashed?: boolean
  subtasks?: ReadonlyArray<{ id: string; done?: boolean }>
}

/** The inline Undo to keep after a step toggle, decided from the STORE's
 * result (core owns the "last open step completes it" rule — not re-derived
 * here): the toggle's Undo only when it turned an open to-do done. */
export function stepDoneUndoAfterToggle(
  before: StepTodo,
  after: StepTodo,
  undo: (() => void) | null,
): (() => void) | null {
  return !before.done && !!after.done && undo ? undo : null
}

/** Which footer to render for the live to-do. */
export function planStepDoneFooter(
  stepDoneUndo: (() => void) | null,
  todoNow: StepTodo,
): { showStepDoneRow: boolean; isBinFooter: boolean } {
  const showStepDoneRow = stepDoneUndo !== null && !!todoNow.done
  return { showStepDoneRow, isBinFooter: !!todoNow.trashed && !showStepDoneRow }
}
