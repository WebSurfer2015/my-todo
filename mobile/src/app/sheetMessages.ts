/**
 * Calm copy for SheetProvider's own actions (pure, so it's unit-testable).
 * English-only launch (v2 store copy).
 */

/** Export failed — never the raw error text. */
export const EXPORT_FAILED_MESSAGE = "Couldn't prepare your export just now. Please try again."

/** Snackbar after a manual category delete; `moved` = to-dos that went to
 * Done with it. */
export function categoryDeletedMessage(moved: number): string {
  if (moved <= 0) return 'Category deleted'
  return `Category deleted · ${moved} ${moved === 1 ? 'to-do' : 'to-dos'} tucked into Done`
}
