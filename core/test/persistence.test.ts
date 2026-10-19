/**
 * Tests for core/src/ports/persistence.ts — versioned envelope read/write,
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
  wrapEnvelope,
  unwrapEnvelope,
  utf8ByteLength,
  exceedsSyncedValueCap,
  MAX_SYNCED_VALUE_BYTES,
  type StorageAdapter,
} from '../src/ports/persistence'

function makeFakeAdapter(): StorageAdapter & { store: Map<string, string>; failGet?: boolean; failSet?: boolean } {
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

  it('treats an un-enveloped value as empty (migrate(null))', async () => {
    await adapter.setItem('todos', JSON.stringify({ count: 3 }))
    expect(await readVersioned(adapter, 'todos', migrate)).toEqual({ count: 0 })
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

describe('wrapEnvelope / unwrapEnvelope', () => {
  it('wraps as {"version":1,"data":…} and round-trips', () => {
    expect(wrapEnvelope([1])).toBe('{"version":1,"data":[1]}')
    for (const v of [[], { a: 1 }, 'x', 0, false, null]) expect(unwrapEnvelope(wrapEnvelope(v))).toEqual(v)
  })
  it('reads anything that is not an envelope as null (storage is untrusted)', () => {
    expect(unwrapEnvelope(null)).toBeNull()
    expect(unwrapEnvelope(undefined)).toBeNull()
    expect(unwrapEnvelope('{bad')).toBeNull()
    expect(unwrapEnvelope('[{"version":1,"data":2}]')).toBeNull()
    expect(unwrapEnvelope('{"data":2}')).toBeNull()
    // The version must be a number.
    expect(unwrapEnvelope('{"version":"1","data":2}')).toBeNull()
    expect(unwrapEnvelope('{"version":1}')).toBeNull()
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

describe('synced value size cap', () => {
  it('utf8ByteLength counts 1/2/3/4-byte code points', () => {
    expect(utf8ByteLength('abc')).toBe(3)
    expect(utf8ByteLength('é')).toBe(2)
    expect(utf8ByteLength('你')).toBe(3)
    expect(utf8ByteLength('😀')).toBe(4)
  })

  it('flags only values over the cap', () => {
    expect(exceedsSyncedValueCap('x'.repeat(1000))).toBe(false)
    expect(exceedsSyncedValueCap('x'.repeat(MAX_SYNCED_VALUE_BYTES))).toBe(false)
    expect(exceedsSyncedValueCap('x'.repeat(MAX_SYNCED_VALUE_BYTES + 1))).toBe(true)
    // multi-byte text crosses the cap with fewer characters
    expect(exceedsSyncedValueCap('你'.repeat(MAX_SYNCED_VALUE_BYTES / 3 + 1))).toBe(true)
  })
})
