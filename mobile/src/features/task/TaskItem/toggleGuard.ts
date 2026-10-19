/** How long after a completion a further tap on the circle is ignored — the
 * same span as the held completion, so a double-tap can't complete then
 * reopen. */
export const UNCOMPLETE_GUARD_MS = 650

/**
 * Whether a tap on a row's circle should be ignored: a completion is still
 * animating / held, or one committed a moment ago (the second tap of a
 * double-tap). Pure, so the guard is unit-testable outside RN.
 */
export function shouldIgnoreToggleTap(s: {
  hasPendingCompletion: boolean
  lastCompletedAt: number
  now: number
}): boolean {
  if (s.hasPendingCompletion) return true
  return s.now - s.lastCompletedAt < UNCOMPLETE_GUARD_MS
}
