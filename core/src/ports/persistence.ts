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
 * The versioned `{version, data}` envelope every persisted value is stored
 * in — the same string on the device (AsyncStorage) and in the cloud
 * (Firestore), so the payload is byte-identical across both.
 */
export function wrapEnvelope(data: unknown): string {
  return JSON.stringify({ version: SCHEMA_VERSION, data });
}

/**
 * The `data` of a stored envelope; null for anything that isn't one (null,
 * bad JSON, a bare value, an array, a non-numeric version) — storage is
 * untrusted, so a malformed value reads as empty.
 */
export function unwrapEnvelope(raw: string | null | undefined): unknown {
  if (raw == null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isVersioned(parsed) ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Platform-agnostic storage interface. Implemented by AsyncStorage (device)
 * and Firestore (cloud) adapters in mobile/. All methods are async — a
 * synchronous KV store would just resolve immediately.
 *
 * `subscribe` is optional: realtime backends (Firestore) implement it so
 * multiple devices stay in sync; KV-only backends (AsyncStorage)
 * leave it undefined and the store falls back to one-shot reads on hydration.
 */
export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  /** `meta.trusted` is false for a snapshot that may not reflect the
   * server (e.g. an empty offline cache on a fresh device) — callers must not
   * treat it as "this key is empty" for write purposes. */
  subscribe?(
    key: string,
    callback: (value: string | null, meta?: { trusted: boolean }) => void,
  ): () => void;
}

/**
 * Largest serialized value the shell will try to sync. firestore.rules caps a
 * state doc's `value` at 512 KiB and rejects anything bigger — the write then
 * silently reverts. Stop short of that (with headroom for the envelope) so
 * the shell can tell the user instead of losing the edit.
 */
export const MAX_SYNCED_VALUE_BYTES = 480 * 1024;

/** UTF-8 byte length of `s` (≥ its UTF-16 length, so a safe bound for the
 * rules' `size()` check too). Pure — no TextEncoder dependency. */
export function utf8ByteLength(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      // surrogate pair → one 4-byte code point
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/** True when a serialized value is too big to sync (see MAX_SYNCED_VALUE_BYTES). */
export function exceedsSyncedValueCap(serialized: string): boolean {
  // Fast path: even at 3 bytes/char it fits — skip the scan.
  if (serialized.length * 3 <= MAX_SYNCED_VALUE_BYTES) return false;
  return utf8ByteLength(serialized) > MAX_SYNCED_VALUE_BYTES;
}

/** Per-user state document path used by FirestoreAdapter implementations. */
export function stateDocPath(uid: string, key: string): string {
  return `users/${uid}/state/${key}`;
}

/**
 * Read a `{version, data}` envelope and run `migrate` on its `data`.
 * Anything that isn't a well-formed envelope (missing key, bad JSON, bare
 * value) is treated as empty: `migrate(null)`.
 */
export async function readVersioned<T>(
  storage: StorageAdapter,
  key: string,
  migrate: (raw: unknown) => T,
): Promise<T> {
  let stored: string | null = null;
  try {
    stored = await storage.getItem(key);
  } catch {
    stored = null;
  }
  return migrate(unwrapEnvelope(stored));
}

export async function writeVersioned(
  storage: StorageAdapter,
  key: string,
  data: unknown,
): Promise<void> {
  try {
    await storage.setItem(key, wrapEnvelope(data));
  } catch {
    // storage unavailable — ignore
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
  // P0 measurement signals (core/src/store/usageSignals.ts) — own doc, never the profile.
  'signals',
] as const
