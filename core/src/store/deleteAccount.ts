import { StorageAdapter, USER_STATE_KEYS } from '../ports/persistence'

/**
 * NOTE (2026-10-17): the AUTHORITATIVE erasure is server-side — the
 * `onUserDeleted` Cloud Function (web/functions/src/deleteUserData.ts)
 * recursively deletes users/{uid} when the auth user is deleted.
 * firestore.rules deny client deletes on state docs (`allow delete: if
 * false`), so the client-side `wipeCloudData` below is denied and swallowed
 * in production; it is kept only as a harmless best-effort.
 *
 * Order kept for the best-effort client wipe: wipe first, THEN delete the auth
 * user (once the auth user is gone the rules reject every client request).
 * Erasure no longer depends on it — onUserDeleted erases users/{uid} either way.
 *
 * Platform-agnostic: inject the two effects. Cloud wipe is best-effort
 * (a missing doc / transient blip must not block the auth delete). If
 * deleteAuthUser fails, `onAuthError` runs first (it may throw a
 * translated error, e.g. a RecentLoginRequiredError the UI catches to
 * prompt re-auth); the raw error rethrows only if onAuthError didn't.
 */
export async function runDeleteAccount(deps: {
  wipeCloudData: () => Promise<void>
  deleteAuthUser: () => Promise<void>
  onAuthError?: (err: unknown) => void
}): Promise<void> {
  await deps.wipeCloudData()
  try {
    await deps.deleteAuthUser()
  } catch (err) {
    deps.onAuthError?.(err)
    throw err
  }
}

/**
 * Best-effort cloud wipe for the keys a user owns — deletes each state doc,
 * swallowing per-key failures (missing doc / transient error) so one bad
 * key can't block the rest or the subsequent auth delete. Pairs with
 * runDeleteAccount's `wipeCloudData`.
 */
export async function wipeUserCloudData(
  cloud: Pick<StorageAdapter, 'removeItem'>,
  keys: readonly string[] = USER_STATE_KEYS,
): Promise<void> {
  await Promise.all(
    keys.map((key) => cloud.removeItem(key).catch(() => {})),
  )
}
