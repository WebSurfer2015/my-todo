// @vitest-environment happy-dom
/**
 * useSyncedState edge paths that once lost or leaked data:
 *   - a hydrate read that resolves AFTER the 12s timeout merges (not
 *     replaces) — or is dropped when a trusted snapshot already applied
 *   - a rejected write rolls back "last saved" so the server's unchanged
 *     value doesn't silently revert the local change, and the next edit
 *     re-sends it
 *   - a uid swap whose read fails shows defaults: a later trusted snapshot
 *     for account B never merges in account A's to-dos
 *   - the AppState background flush never writes while locked
 *   - a missing doc seeds defaults without writing them
 *   - serverConfirmed follows the snapshots' `fromServer`
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { AppState } from 'react-native'
import { useSyncedState, type SnapshotMeta } from '../store/useSyncedState'
import type { StorageAdapter } from '../../../core/src/ports/persistence'
import type { Todo } from '../../../core/src/domain/types'
import { mergeTodos } from '../../../core/src/store'

type Cb = (value: string | null, meta?: SnapshotMeta) => void
type Emit = { __emit: (s: 'active' | 'background' | 'inactive') => void }

function makeAdapter(opts: {
  initial?: string | null
  get?: () => Promise<string | null>
  setError?: () => unknown
} = {}) {
  const setCalls: string[] = []
  let sub: Cb | null = null
  const adapter: StorageAdapter = {
    getItem: () => (opts.get ? opts.get() : Promise.resolve(opts.initial ?? null)),
    async setItem(_key, value) {
      const err = opts.setError?.()
      if (err) throw err
      setCalls.push(value)
    },
    async removeItem() {},
    async clear() {},
    subscribe(_key, cb) {
      sub = cb
      return () => { sub = null }
    },
  }
  const push = (value: string | null, meta: SnapshotMeta = { trusted: true }) => {
    if (!sub) throw new Error('not subscribed')
    sub(value, meta)
  }
  return { adapter, setCalls, push }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

const td = (id: string, updatedAt = 1): Todo => ({
  id, text: id, done: false, priority: 'medium', dueDate: '', trashed: false, updatedAt,
})
const parseTodos = (raw: string | null): Todo[] => (raw ? JSON.parse(raw) : [])
const serializeTodos = (v: Todo[]) => JSON.stringify(v)
const ids = (ts: Todo[]) => ts.map((t) => t.id).sort()
const useTodos = (adapter: StorageAdapter) =>
  useSyncedState<Todo[]>(adapter, 'todos', [], parseTodos, serializeTodos, { merge: mergeTodos })

const parse = (raw: string | null): number => (raw ? Number(raw) : 0)
const serialize = (n: number): string => String(n)

const flush = async (ms = 1000) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

describe('useSyncedState — lifecycle edges', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('a read that resolves after the hydrate timeout merges instead of wiping edits', async () => {
    const read = deferred<string | null>()
    const { adapter, setCalls } = makeAdapter({ get: () => read.promise })
    const { result } = renderHook(() => useTodos(adapter))
    await flush(13000)
    expect(result.current[2]).toBe(true)
    expect(result.current[3]).toBe(false)
    // The user adds a to-do on top of the defaults (writes still locked).
    act(() => result.current[1]([td('local', 5)]))
    await act(async () => { read.resolve(serializeTodos([td('cloud')])) })
    expect(ids(result.current[0])).toEqual(['cloud', 'local'])
    expect(result.current[3]).toBe(true)
    await flush()
    // The union is written back.
    expect(setCalls).toHaveLength(1)
    expect(ids(parseTodos(setCalls[0]))).toEqual(['cloud', 'local'])
  })

  it('a late read is dropped when a trusted snapshot already applied', async () => {
    const read = deferred<string | null>()
    const { adapter, push } = makeAdapter({ get: () => read.promise })
    const { result } = renderHook(() => useTodos(adapter))
    await flush(13000)
    act(() => push(serializeTodos([td('fresh', 9)])))
    expect(ids(result.current[0])).toEqual(['fresh'])
    await act(async () => { read.resolve(serializeTodos([td('stale')])) })
    expect(ids(result.current[0])).toEqual(['fresh'])
  })

  it('a rejected write is not reverted by the server echo, and the next edit re-sends it', async () => {
    let fail = true
    const { adapter, setCalls, push } = makeAdapter({
      initial: '1',
      setError: () => (fail ? { code: 'firestore/unavailable' } : null),
    })
    const { result } = renderHook(() => useSyncedState(adapter, 'k', 0, parse, serialize))
    await waitFor(() => expect(result.current[3]).toBe(true))
    act(() => result.current[1](2))
    await flush()
    expect(setCalls).toEqual([])
    // The server still holds 1: that snapshot must not wipe the local 2.
    act(() => push('1'))
    expect(result.current[0]).toBe(2)
    fail = false
    act(() => result.current[1](3))
    await flush()
    expect(setCalls).toEqual(['3'])
  })

  it('uid swap with a failing read: a trusted snapshot for B never merges in A\'s to-dos', async () => {
    const a = makeAdapter({ initial: serializeTodos([td('a1'), td('a2')]) })
    const b = makeAdapter({ get: () => Promise.reject(new Error('offline')) })
    const { result, rerender } = renderHook(({ adapter }) => useTodos(adapter), {
      initialProps: { adapter: a.adapter },
    })
    await waitFor(() => expect(ids(result.current[0])).toEqual(['a1', 'a2']))
    rerender({ adapter: b.adapter })
    await waitFor(() => expect(result.current[2]).toBe(true))
    // Defaults are SHOWN for B — not A's list.
    expect(result.current[0]).toEqual([])
    act(() => b.push(serializeTodos([td('b1')])))
    expect(ids(result.current[0])).toEqual(['b1'])
    await flush()
    for (const w of b.setCalls) {
      expect(ids(parseTodos(w))).not.toContain('a1')
    }
  })

  it('background flush writes nothing while writes are locked, and flushes once unlocked', async () => {
    const { adapter, setCalls, push } = makeAdapter({ get: () => Promise.reject(new Error('x')) })
    const { result } = renderHook(() => useSyncedState(adapter, 'k', 0, parse, serialize))
    await waitFor(() => expect(result.current[2]).toBe(true))
    act(() => result.current[1](4))
    act(() => (AppState as unknown as Emit).__emit('background'))
    expect(setCalls).toEqual([])
    // Unlock with real data, edit, and background inside the debounce window.
    act(() => push('4'))
    act(() => result.current[1](6))
    act(() => (AppState as unknown as Emit).__emit('background'))
    expect(setCalls).toEqual(['6'])
    await flush()
    expect(setCalls).toEqual(['6'])
  })

  it('a missing doc seeds the defaults without writing them', async () => {
    const { adapter, setCalls } = makeAdapter({ initial: null })
    const { result } = renderHook(() => useSyncedState(adapter, 'k', 7, (r) => (r ? Number(r) : 7), serialize))
    await waitFor(() => expect(result.current[3]).toBe(true))
    expect(result.current[0]).toBe(7)
    await flush()
    act(() => (AppState as unknown as Emit).__emit('background'))
    expect(setCalls).toEqual([])
  })

  it('serverConfirmed follows the latest snapshot\'s fromServer', async () => {
    const { adapter, push } = makeAdapter({ initial: '1' })
    const { result } = renderHook(() => useSyncedState(adapter, 'k', 0, parse, serialize))
    await waitFor(() => expect(result.current[3]).toBe(true))
    // A cache-first read is NOT server confirmation when there's a listener.
    expect(result.current[4]).toBe(false)
    act(() => push('1', { trusted: true, fromServer: false }))
    expect(result.current[4]).toBe(false)
    act(() => push('1', { trusted: true, fromServer: true }))
    expect(result.current[4]).toBe(true)
    act(() => push('1', { trusted: true, fromServer: false }))
    expect(result.current[4]).toBe(false)
  })

  it('without a realtime channel a resolved read is server-confirmed', async () => {
    const adapter: StorageAdapter = {
      getItem: async () => '2',
      setItem: async () => {},
      removeItem: async () => {},
      clear: async () => {},
    }
    const { result } = renderHook(() => useSyncedState(adapter, 'k', 0, parse, serialize))
    await waitFor(() => expect(result.current[4]).toBe(true))
  })
})
