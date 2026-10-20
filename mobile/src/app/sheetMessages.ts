/**
 * Calm copy for SheetProvider's own actions (pure, so it's unit-testable).
 * English-only launch (v2 store copy).
 */

/** Export failed — never the raw error text. */
export const EXPORT_FAILED_MESSAGE = "Couldn't prepare your export just now. Please try again."

/** Inline notice after a manual category delete; `uncategorized` = to-dos
 * that had the category (they stay, without it). The Undo sits beside it. */
export function categoryDeletedMessage(name: string, uncategorized: number): string {
  if (uncategorized <= 0) return `Deleted ${name}.`
  return `Deleted ${name}. ${uncategorized === 1 ? 'Its 1 to-do is' : `Its ${uncategorized} to-dos are`} now uncategorized.`
}
