import { StorageAdapter } from '../ports/persistence'

/**
 * Keys migrated from local → cloud on first sign-in for a uid. Web ships
 * the shared three; mobile passes its own superset (adds groceries +
 * groceryGroups) explicitly.
 */
export const MIGRATION_KEYS = ['todos', 'categories', 'profile'] as const

/**
 * One-time local→cloud migration. For each key, if the CLOUD value is
 * missing, push the local value up.
 *
 * **Per-key gating is intentional.** A single "is cloud empty?" probe on
 * one key (e.g. only `profile`) would let a stale local `todos` overwrite
 * a populated cloud `todos` on a device whose cloud profile happened to be
 * missing — silent cross-device data loss. Checking each key independently
 * means a populated cloud key is never stomped, regardless of the state of
 * any other key.
 *
 * Pure w.r.t. platform: depends only on the StorageAdapter port, so it's
 * unit-testable with in-memory fakes and shared by web + mobile. Returns
 * the keys that were actually migrated (cloud-missing AND local-present).
 *
 * @param cloud  the destination adapter (Firestore)
 * @param local  source adapter — only getItem is read (localStorage / AsyncStorage)
 * @param keys   which keys to consider (defaults to the shared three)
 */
export async function migrateLocalToCloud(
  cloud: StorageAdapter,
  local: Pick<StorageAdapter, 'getItem'>,
  keys: readonly string[] = MIGRATION_KEYS,
): Promise<string[]> {
  const migrated: string[] = []
  for (const key of keys) {
    const cloudVal = await cloud.getItem(key)
    if (cloudVal != null) continue // never stomp a populated cloud key
    const localVal = await local.getItem(key)
    if (localVal != null) {
      await cloud.setItem(key, localVal)
      migrated.push(key)
    }
  }
  return migrated
}
