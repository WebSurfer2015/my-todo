// @vitest-environment happy-dom
/**
 * Tests for the signed-out per-item collection adapter
 * (localStorage-backed). Mirrors the Firestore collection adapter's
 * CollectionAdapter contract; pure browser localStorage, so it runs under
 * happy-dom with no emulator. The AsyncStorage sibling
 * (mobile/src/adapters/localCollectionAdapter.ts) shares the same shape.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { makeLocalCollectionAdapter } from './localCollectionAdapter'

describe('makeLocalCollectionAdapter (localStorage, signed-out)', () => {
  beforeEach(() => localStorage.clear())

  it('upsert + getAll round-trips id/value pairs', async () => {
    const a = makeLocalCollectionAdapter('todos')
    await a.upsert('x', 'vx')
    await a.upsert('y', 'vy')
    const all = await a.getAll()
    expect(all.sort((p, q) => p.id.localeCompare(q.id))).toEqual([
      { id: 'x', value: 'vx' },
      { id: 'y', value: 'vy' },
    ])
  })

  it('upsert overwrites an existing id', async () => {
    const a = makeLocalCollectionAdapter('todos')
    await a.upsert('x', 'v1')
    await a.upsert('x', 'v2')
    expect(await a.getAll()).toEqual([{ id: 'x', value: 'v2' }])
  })

  it('remove deletes only the targeted id', async () => {
    const a = makeLocalCollectionAdapter('todos')
    await a.upsert('x', 'vx')
    await a.upsert('y', 'vy')
    await a.remove('x')
    expect(await a.getAll()).toEqual([{ id: 'y', value: 'vy' }])
  })

  it('scopes by collection name — never reads a sibling collection', async () => {
    const todos = makeLocalCollectionAdapter('todos')
    const groceries = makeLocalCollectionAdapter('groceries')
    await todos.upsert('a', 'TA')
    await groceries.upsert('a', 'GA')
    expect(await todos.getAll()).toEqual([{ id: 'a', value: 'TA' }])
    expect(await groceries.getAll()).toEqual([{ id: 'a', value: 'GA' }])
  })

  it('does NOT pick up the bare single-doc key (no trailing slash)', async () => {
    // The single-doc model writes localStorage['todos']; the per-item
    // scan keys off the `todos/` prefix and must skip the bare key.
    localStorage.setItem('todos', '{"version":1,"data":[]}')
    const a = makeLocalCollectionAdapter('todos')
    await a.upsert('real', 'v')
    expect(await a.getAll()).toEqual([{ id: 'real', value: 'v' }])
  })

  it('getAll is empty when nothing is stored', async () => {
    expect(await makeLocalCollectionAdapter('todos').getAll()).toEqual([])
  })
})
