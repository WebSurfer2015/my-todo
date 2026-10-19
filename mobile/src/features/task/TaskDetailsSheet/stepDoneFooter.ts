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

/** The inline Undo to keep after toggling step `subId` on `before`: the
 * toggle's Undo only when it completed the to-do (the last open step). */
export function stepDoneUndoAfterToggle(
  before: StepTodo,
  subId: string,
  undo: (() => void) | null,
): (() => void) | null {
  const willComplete =
    !before.done && (before.subtasks ?? []).every((st) => (st.id === subId ? !st.done : !!st.done))
  return willComplete && undo ? undo : null
}

/** Which footer to render for the live to-do. */
export function planStepDoneFooter(
  stepDoneUndo: (() => void) | null,
  todoNow: StepTodo,
): { showStepDoneRow: boolean; isBinFooter: boolean } {
  const showStepDoneRow = stepDoneUndo !== null && !!todoNow.done
  return { showStepDoneRow, isBinFooter: !!todoNow.trashed && !showStepDoneRow }
}
