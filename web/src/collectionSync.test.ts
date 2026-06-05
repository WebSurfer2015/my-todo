import { describe, it, expect } from 'vitest'
import { syncCollection, backfillCollection } from '../../core/src/store/collectionSync'
import type { CollectionAdapter, CollectionEntry } from '../../core/src/ports/persistence'

/** In-memory CollectionAdapter that records every write. */
function fakeColl(initial: CollectionEntry[] = []) {
  const map = new Map(initial.map((e) => [e.id, e.value]))
  const calls: string[] = []
  const adapter: CollectionAdapter = {
    async getAll() {
      return [...map].map(([id, value]) => ({ id, value }))
    },
    async upsert(id, value) {
      calls.push(`upsert:${id}`)
      map.set(id, value)
    },
    async remove(id) {
      calls.push(`remove:${id}`)
      map.delete(id)
    },
  }
  return { adapter, map, calls }
}
const m = (o: Record<string, string>) => new Map(Object.entries(o))

describe('syncCollection (per-item diff)', () => {
  it('only writes the changed/new items — siblings untouched (write-amplification fix)', async () => {
    const { adapter, calls, map } = fakeColl([
      { id: 'a', value: '1' },
      { id: 'b', value: '2' },
    ])
    const res = await syncCollection(adapter, m({ a: '1', b: '2' }), m({ a: '1', b: '2-EDIT', c: '3' }))
    expect(res.upserted.sort()).toEqual(['b', 'c'])
    expect(res.removed).toEqual([])
    expect(calls).not.toContain('upsert:a') // unchanged item never re-written
    expect(map.get('b')).toBe('2-EDIT')
    expect(map.get('c')).toBe('3')
  })

  it('removes ids that disappeared from the desired set', async () => {
    const { adapter, calls } = fakeColl([
      { id: 'a', value: '1' },
      { id: 'b', value: '2' },
    ])
    const res = await syncCollection(adapter, m({ a: '1', b: '2' }), m({ a: '1' }))
    expect(res.removed).toEqual(['b'])
    expect(calls).toContain('remove:b')
  })

  it('no-ops when nothing changed', async () => {
    const { adapter, calls } = fakeColl([{ id: 'a', value: '1' }])
    const res = await syncCollection(adapter, m({ a: '1' }), m({ a: '1' }))
    expect(res).toEqual({ upserted: [], removed: [] })
    expect(calls).toEqual([])
  })
})

describe('backfillCollection (idempotent, forward-only)', () => {
  it('writes only items missing from the collection', async () => {
    const { adapter, calls } = fakeColl([{ id: 'a', value: 'cloud-a' }])
    const wrote = await backfillCollection(adapter, [
      { id: 'a', value: 'local-a' }, // already present → skipped (no clobber)
      { id: 'b', value: 'local-b' }, // missing → written
    ])
    expect(wrote).toEqual(['b'])
    expect(calls).toEqual(['upsert:b'])
  })

  it('is idempotent — a second run writes nothing', async () => {
    const { adapter } = fakeColl()
    await backfillCollection(adapter, [{ id: 'a', value: '1' }])
    const second = await backfillCollection(adapter, [{ id: 'a', value: '1' }])
    expect(second).toEqual([])
  })
})
