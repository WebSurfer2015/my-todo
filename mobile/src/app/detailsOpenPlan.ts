/**
 * How to open a to-do's details sheet given what's on screen — pure, so the
 * Modal-handoff rules are unit-testable (SheetContext does the side effects).
 *
 * - `already-open` — details already shows this to-do: nothing to do.
 * - `notify`       — another sheet or modal is up (SheetProvider's own, or
 *                    any presented Modal it doesn't own). iOS can't present
 *                    over it, and force-closing it would drop the user's
 *                    work (a Compose draft, a half-picked date) — so offer
 *                    a calm `Reminder: “<title>” · Open` snackbar once
 *                    nothing is presented (see useDetailsRouter). A
 *                    picker presented over details counts too.
 * - `swap`         — only details is up, on ANOTHER to-do: close it through
 *                    its own save path first, then open the new one.
 * - `now`          — nothing is open: open right away.
 */
export type DetailsOpenPlan = 'already-open' | 'notify' | 'swap' | 'now'

export interface DetailsReq {
  id: string
  subtaskId: string | null
}

export function planDetailsOpen(s: {
  todoId: string
  detailsId: string | null
  /** A sheet SheetProvider tracks (Compose, Mochi, Profile, …) is open. */
  anySheetOpen: boolean
  /** Some other presented Modal (pickers, paywall, per-screen sheets). */
  anyModalOpen: boolean
}): DetailsOpenPlan {
  if (s.detailsId === s.todoId) return 'already-open'
  if (s.anySheetOpen || s.anyModalOpen) return 'notify'
  if (s.detailsId !== null) return 'swap'
  return 'now'
}

/** Snackbar label for a to-do that couldn't open right away (a reminder
 * tap while a sheet was up). English-only launch. */
export function detailsNotifyMessage(text: string): string {
  const t = text.trim()
  return `Reminder: “${t.length > 40 ? `${t.slice(0, 39)}…` : t}”`
}
