export const SCHEMA_VERSION = 1;

interface Versioned<T> {
  version: number;
  data: T;
}

function isVersioned(raw: unknown): raw is Versioned<unknown> {
  return (
    typeof raw === "object" &&
    raw !== null &&
    !Array.isArray(raw) &&
    "version" in raw &&
    "data" in raw &&
    typeof (raw as { version: unknown }).version === "number"
  );
}

/**
 * Platform-agnostic storage interface. Wraps localStorage on web, AsyncStorage
 * on mobile, Firestore in the cloud. All methods are async — sync stores like
 * localStorage just resolve immediately.
 *
 * `subscribe` is optional: realtime backends (Firestore) implement it so
 * multiple devices stay in sync; KV-only backends (localStorage, AsyncStorage)
 * leave it undefined and the store falls back to one-shot reads on hydration.
 */
export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  subscribe?(key: string, callback: (value: string | null) => void): () => void;
}

/** Per-user state document path used by FirestoreAdapter implementations. */
export function stateDocPath(uid: string, key: string): string {
  return `users/${uid}/state/${key}`;
}

/**
 * One stored entry in a per-item collection. `value` is the SAME versioned
 * `{version,data}` envelope as the single-doc model — just one item per doc
 * instead of the whole array — so the existing migrators + Firestore rules
 * shape ({value:string, updatedAt:int}) are reused unchanged.
 */
export interface CollectionEntry {
  id: string;
  value: string;
}

/**
 * Per-ITEM persistence (one document per todo/grocery), the scale path in
 * docs/SPIKE-persistence-scale.md (option B). Edits write one small doc;
 * conflict resolution is per-item, not whole-list. Parallel to
 * StorageAdapter — the store picks one per entity behind this port, so the
 * single-doc ↔ per-doc migration stays a swap behind the seam.
 *
 * `subscribe` (realtime backends) delivers the whole current set on each
 * change — the store re-derives from it exactly like the single-doc path.
 */
export interface CollectionAdapter {
  getAll(): Promise<CollectionEntry[]>;
  upsert(id: string, value: string): Promise<void>;
  remove(id: string): Promise<void>;
  subscribe?(callback: (entries: CollectionEntry[]) => void): () => void;
}

/** Per-user item-collection path (e.g. users/{uid}/todos, users/{uid}/groceryItems). */
export function itemCollectionPath(uid: string, collection: string): string {
  return `users/${uid}/${collection}`;
}

export async function readVersioned<T>(
  storage: StorageAdapter,
  key: string,
  migrate: (raw: unknown) => T,
): Promise<T> {
  let raw: unknown = null;
  try {
    const stored = await storage.getItem(key);
    raw = stored ? JSON.parse(stored) : null;
  } catch {
    raw = null;
  }
  if (isVersioned(raw)) return migrate(raw.data);
  return migrate(raw);
}

export async function writeVersioned(
  storage: StorageAdapter,
  key: string,
  data: unknown,
): Promise<void> {
  try {
    await storage.setItem(
      key,
      JSON.stringify({ version: SCHEMA_VERSION, data }),
    );
  } catch {
    // storage unavailable — ignore
  }
}

export async function clearAllPersisted(
  storage: StorageAdapter,
): Promise<void> {
  try {
    await storage.clear();
  } catch {
    // ignore
  }
}

/**
 * Canonical list of state keys the app persists per user. Used by
 * the export and "Delete data only" features so both touch the same
 * surface. Keep in sync with each platform's `useTodoStore` and any
 * new `useSyncedState` keys.
 */
export const USER_STATE_KEYS = [
  'todos',
  'todoReferences',
  'categories',
  'profile',
  'groceries',
  'groceryGroups',
] as const

export type UserStateKey = typeof USER_STATE_KEYS[number]

/**
 * Removes every per-user state doc the app knows about. Used by the
 * "Delete data only" action — wipes the cloud + local copies but
 * leaves the Firebase Auth user intact, so the user stays signed in
 * and re-hydrates to a clean seed state.
 *
 * Best-effort: a single key failing (e.g. doc already missing) does
 * not abort the rest. `storage.clear()` is intentionally NOT used —
 * Firestore implementations no-op it because subcollection
 * enumeration is too expensive, so it would silently leave cloud
 * data behind.
 */
export async function clearKnownUserData(
  storage: StorageAdapter,
): Promise<void> {
  for (const key of USER_STATE_KEYS) {
    try {
      await storage.removeItem(key)
    } catch (err) {
      console.warn(`clearKnownUserData: failed to remove ${key}`, err)
    }
  }
}
