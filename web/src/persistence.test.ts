/**
 * Tests for core/src/persistence.ts — versioned envelope read/write,
 * the StorageAdapter contract, the doc-path builder.
 *
 * Uses an in-memory Map as a stand-in StorageAdapter so we don't
 * need a real KV store.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  SCHEMA_VERSION,
  stateDocPath,
  readVersioned,
  writeVersioned,
  clearAllPersisted,
  type StorageAdapter,
} from '../../core/src/persistence'

function makeFakeAdapter(): StorageAdapter & { store: Map<string, string>; failGet?: boolean; failSet?: boolean; failClear?: boolean } {
  const m = new Map<string, string>()
  return {
    store: m,
    async getItem(key) {
      if (this.failGet) throw new Error('get failed')
      return m.has(key) ? m.get(key)! : null
    },
    async setItem(key, value) {
      if (this.failSet) throw new Error('set failed')
      m.set(key, value)
    },
    async removeItem(key) {
      m.delete(key)
    },
    async clear() {
      if (this.failClear) throw new Error('clear failed')
      m.clear()
    },
  }
}

describe('SCHEMA_VERSION', () => {
  it('is a positive integer', () => {
    expect(SCHEMA_VERSION).toBe(1)
  })
})

describe('stateDocPath', () => {
  it('builds the per-user Firestore path', () => {
    expect(stateDocPath('uid-abc', 'todos')).toBe('users/uid-abc/state/todos')
    expect(stateDocPath('uid-xyz', 'profile')).toBe('users/uid-xyz/state/profile')
  })
})

describe('readVersioned', () => {
  let adapter: ReturnType<typeof makeFakeAdapter>
  const migrate = (raw: unknown): { count: number } => {
    if (raw && typeof raw === 'object' && 'count' in raw && typeof (raw as { count: unknown }).count === 'number') {
      return { count: (raw as { count: number }).count }
    }
    return { count: 0 }
  }

  beforeEach(() => {
    adapter = makeFakeAdapter()
  })

  it('returns migrate(null) when key is missing', async () => {
    expect(await readVersioned(adapter, 'todos', migrate)).toEqual({ count: 0 })
  })

  it('unwraps a versioned envelope before calling migrate', async () => {
    await adapter.setItem(
      'todos',
      JSON.stringify({ version: 1, data: { count: 7 } }),
    )
    expect(await readVersioned(adapter, 'todos', migrate)).toEqual({ count: 7 })
  })

  it('passes raw value to migrate when stored data is unversioned (legacy)', async () => {
    await adapter.setItem('todos', JSON.stringify({ count: 3 }))
    expect(await readVersioned(adapter, 'todos', migrate)).toEqual({ count: 3 })
  })

  it('returns migrate(null) when JSON parse fails', async () => {
    await adapter.setItem('todos', 'not-valid-json{')
    expect(await readVersioned(adapter, 'todos', migrate)).toEqual({ count: 0 })
  })

  it('returns migrate(null) when adapter throws', async () => {
    adapter.failGet = true
    expect(await readVersioned(adapter, 'todos', migrate)).toEqual({ count: 0 })
  })
})

describe('writeVersioned', () => {
  it('serializes with version + data envelope', async () => {
    const adapter = makeFakeAdapter()
    await writeVersioned(adapter, 'todos', { count: 5 })
    const stored = adapter.store.get('todos')!
    expect(JSON.parse(stored)).toEqual({ version: SCHEMA_VERSION, data: { count: 5 } })
  })
  it('swallows adapter errors silently (storage-unavailable case)', async () => {
    const adapter = makeFakeAdapter()
    adapter.failSet = true
    await expect(writeVersioned(adapter, 'todos', {})).resolves.toBeUndefined()
  })
})

describe('clearAllPersisted', () => {
  it('calls clear on the adapter', async () => {
    const adapter = makeFakeAdapter()
    await adapter.setItem('a', '1')
    await adapter.setItem('b', '2')
    await clearAllPersisted(adapter)
    expect(adapter.store.size).toBe(0)
  })
  it('swallows adapter errors silently', async () => {
    const adapter = makeFakeAdapter()
    adapter.failClear = true
    await expect(clearAllPersisted(adapter)).resolves.toBeUndefined()
  })
})

describe('roundtrip: writeVersioned + readVersioned', () => {
  it('survives the envelope', async () => {
    const adapter = makeFakeAdapter()
    const migrate = (raw: unknown): string[] => (Array.isArray(raw) ? raw as string[] : [])
    await writeVersioned(adapter, 'list', ['a', 'b', 'c'])
    expect(await readVersioned(adapter, 'list', migrate)).toEqual(['a', 'b', 'c'])
  })
})
