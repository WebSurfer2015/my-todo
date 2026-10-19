/**
 * How to open a to-do's details sheet given what's on screen — pure, so the
 * Modal-handoff rules are unit-testable (SheetContext does the side effects).
 *
 * - `already-open` — details already shows this to-do: nothing to do.
 * - `swap`         — details shows ANOTHER to-do: close it through its own
 *                    save path first, then open the new one after it closed.
 * - `after-close`  — another sheet is up: close it, open after it dismissed
 *                    (iOS can't present a Modal over / while another closes).
 * - `now`          — nothing is open: open right away.
 */
export type DetailsOpenPlan = 'already-open' | 'swap' | 'after-close' | 'now'

export interface DetailsReq {
  id: string
  subtaskId: string | null
}

export function planDetailsOpen(s: {
  todoId: string
  detailsId: string | null
  anySheetOpen: boolean
}): DetailsOpenPlan {
  if (s.detailsId === s.todoId) return 'already-open'
  if (s.detailsId !== null) return 'swap'
  if (s.anySheetOpen) return 'after-close'
  return 'now'
}
