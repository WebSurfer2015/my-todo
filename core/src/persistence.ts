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
