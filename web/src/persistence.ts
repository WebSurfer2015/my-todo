import { StorageAdapter, SCHEMA_VERSION } from '../../core/src/ports/persistence'

export { SCHEMA_VERSION }

/** Async StorageAdapter wrapping browser localStorage. */
export const storage: StorageAdapter = {
  async getItem(key) { return localStorage.getItem(key) },
  async setItem(key, value) { localStorage.setItem(key, value) },
  async removeItem(key) { localStorage.removeItem(key) },
  async clear() { localStorage.clear() },
}

interface Versioned<T> {
  version: number
  data: T
}

function isVersioned(raw: unknown): raw is Versioned<unknown> {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    !Array.isArray(raw) &&
    'version' in raw &&
    'data' in raw &&
    typeof (raw as { version: unknown }).version === 'number'
  )
}

/**
 * Sync read/write helpers backed by localStorage. Kept alongside the async
 * StorageAdapter for code paths that need synchronous initial loads (the
 * web app's `useState(loader)` pattern). These read and write the SAME
 * versioned envelope that core's async helpers use, so a future switch to
 * fully-async hydration is a drop-in replacement.
 */
export function readVersioned<T>(key: string, migrate: (raw: unknown) => T): T {
  let raw: unknown
  try {
    raw = JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    raw = null
  }
  if (isVersioned(raw)) return migrate(raw.data)
  return migrate(raw)
}

export function writeVersioned(key: string, data: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify({ version: SCHEMA_VERSION, data }))
  } catch {
    // quota exceeded or storage disabled — ignore
  }
}
