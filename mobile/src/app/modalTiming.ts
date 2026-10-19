/**
 * Shared iOS Modal timing. iOS can't present a <Modal> while another is still
 * presented or animating out, so every sheet → sheet (or sheet → Alert)
 * handoff waits MODAL_HANDOFF_MS, and a closed Modal keeps counting as
 * presented for MODAL_DISMISS_GRACE_MS (see modalPresence).
 */

/** How long a sheet takes to animate out before the next one may open. */
export const MODAL_HANDOFF_MS = 280

/** A closed Modal still animates out; keep treating it as presented this long. */
export const MODAL_DISMISS_GRACE_MS = 300
