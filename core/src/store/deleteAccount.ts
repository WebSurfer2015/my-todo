import { StorageAdapter, USER_STATE_KEYS } from '../ports/persistence'

/**
 * Account deletion in the order Firestore security rules REQUIRE: wipe the
 * user's cloud data FIRST, THEN delete the auth user. The order is
 * load-bearing — once the auth user is gone, the rules reject every write,
 * so a delete-user-first ordering would orphan the user's docs forever.
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
