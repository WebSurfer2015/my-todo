/**
 * Comp allowlist — these people get the full (Max) AI experience without
 * paying. Matched by profile FIRST + LAST name, case-insensitive.
 *
 * Pure module (no firebase-admin), so it's unit-testable and importable
 * without quota.ts's admin side effects.
 *
 * CAVEAT: the profile name is user-editable, so this is a SOFT comp — someone
 * could rename themselves to a listed name to get free access. Acceptable for a
 * tiny family allowlist; switch to uid/email (stable, not self-editable) if
 * abuse ever becomes a concern.
 */
export const COMP_USERS: ReadonlyArray<{ first: string; last: string }> = [
  { first: 'joanna', last: 'zhou' },
  { first: 'helen', last: 'zhou' },
  { first: 'sydney', last: 'zhou' },
  { first: 'ying', last: 'qin' },
]

/** Case- + whitespace-insensitive match against the comp list. */
export function isCompName(firstName: string, lastName: string): boolean {
  const f = firstName.trim().toLowerCase()
  const l = lastName.trim().toLowerCase()
  if (!f && !l) return false
  return COMP_USERS.some((u) => u.first === f && u.last === l)
}
