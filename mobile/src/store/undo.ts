/**
 * The ONE definition of what an Undo reports — the store's tracked Undos,
 * Ask Mochi's combined turn Undo, and the details sheet's Undo all share it.
 */

/** What an Undo did: `true` — put back; `false` — nothing to put back
 * (everything it touched was changed since, or it is already undone);
 * `"partial"` — put back, but rows edited since were kept (truthy, so a plain
 * `if (undo())` still reads it as done). */
export type UndoOutcome = boolean | "partial";

/** Calm copy for an Undo that could only put back part of an action. */
export const PARTIAL_UNDO_MESSAGE = "Undone — later changes were kept.";
