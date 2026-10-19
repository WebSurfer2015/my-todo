/**
 * Calm copy for a failed "Delete account" — never the raw SDK error.
 * (RecentLoginRequiredError has its own re-auth prompt in SheetContext.)
 * English-only launch.
 */
export const DELETE_ACCOUNT_OFFLINE =
  "You seem to be offline. Your account wasn't deleted — try again when you're connected."
export const DELETE_ACCOUNT_FAILED = "Couldn't delete your account just now. Please try again."

export function deleteAccountErrorMessage(err: unknown): string {
  const e = (err ?? {}) as { code?: unknown; message?: unknown }
  const code = typeof e.code === 'string' ? e.code : ''
  const message = typeof e.message === 'string' ? e.message : ''
  const offline =
    code === 'auth/network-request-failed' ||
    code === 'unavailable' ||
    /network|offline|internet|unavailable/i.test(message)
  return offline ? DELETE_ACCOUNT_OFFLINE : DELETE_ACCOUNT_FAILED
}

/** "Delete data only" outcomes — snackbars (they outlive the sign-out that
 * follows a wipe). English-only launch. */
export const DELETE_DATA_DONE = 'Your data has been cleared.'
export const DELETE_DATA_OFFLINE =
  "You seem to be offline. Your data will finish deleting the next time you're online and signed in."
export const DELETE_DATA_FAILED = "Couldn't clear your data just now. Please try again."
