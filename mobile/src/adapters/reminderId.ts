/**
 * Pure reminder-notification identifier scheme. Extracted from
 * notifications.ts (which imports expo-notifications, a native module that
 * can't load under the node test runner) so the id round-trip is
 * unit-testable in isolation.
 *
 * Identifier: `todo:<todoId>:<reminderId>:<fireIndex>`.
 *   • todoId    — UUID, no colons
 *   • reminderId — per-entry id; MAY contain colons (legacy `legacy:<at>`)
 *   • fireIndex  — integer, always the last segment
 *
 * Each fire cancels independently, so a reshape/edit only needs to cancel
 * the indices that no longer match and schedule the new ones.
 */
export const REMINDER_ID_PREFIX = 'todo:'

/** Hard cap on scheduled fires per todo (defends the native bridge). */
export const MAX_FIRES_PER_TODO = 30

export function reminderIdFor(
  todoId: string,
  reminderId: string,
  fireIndex: number,
): string {
  return `${REMINDER_ID_PREFIX}${todoId}:${reminderId}:${fireIndex}`
}

/** todoId is the FIRST segment after the prefix (reminderId may contain
 * colons via the legacy `legacy:<at>` form, so we can't split naively). */
export function todoIdFromReminderId(id: string): string | null {
  if (!id.startsWith(REMINDER_ID_PREFIX)) return null
  const rest = id.slice(REMINDER_ID_PREFIX.length)
  const firstColon = rest.indexOf(':')
  if (firstColon === -1) return null
  return rest.slice(0, firstColon)
}

/** fireIndex is the LAST segment. Returns null if absent / non-numeric. */
export function fireIndexFromReminderId(id: string): number | null {
  if (!id.startsWith(REMINDER_ID_PREFIX)) return null
  const rest = id.slice(REMINDER_ID_PREFIX.length)
  const lastColon = rest.lastIndexOf(':')
  if (lastColon === -1) return null
  const n = Number(rest.slice(lastColon + 1))
  return Number.isFinite(n) ? n : null
}
