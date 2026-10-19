// @vitest-environment happy-dom
/**
 * useSyncedState sync-robustness: write unlock after real data arrives,
 * adapter-scoped `loaded`, the `trusted` flag, merge-on-snapshot for todos,
 * and the doc-size / write-failure notices.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSyncedState, onSyncIssue, isSyncedKeyTrusted, type SyncIssue } from '../store/useSyncedState'
import type { StorageAdapter } from '../../../core/src/ports/persistence'
import { MAX_SYNCED_VALUE_BYTES } from '../../../core/src/ports/persistence'
import type { Todo } from '../../../core/src/domain/types'

type Cb = (value: string | null, meta?: { trusted: boolean }) => void

function makeAdapter(opts: { initial?: string | null; failGet?: boolean; hangGet?: boolean; setError?: unknown } = {}) {
  const store: { value: string | null } = { value: opts.initial ?? null }
  const setCalls: string[] = []
  let sub: Cb | null = null
  const adapter: StorageAdapter = {
    getItem: () => {
      if (opts.hangGet) return new Promise(() => {})
      if (opts.failGet) return Promise.reject(new Error('boom'))
      return Promise.resolve(store.value)
    },
    async setItem(_key, value) {
      if (opts.setError) throw opts.setError
      store.value = value
      setCalls.push(value)
    },
    async removeItem() {},
    async clear() {},
    subscribe(_key, cb) {
      sub = cb
      return () => { sub = null }
    },
  }
  const pushRemote = (value: string | null, trusted = true) => {
    if (!sub) throw new Error('not subscribed')
    sub(value, { trusted })
  }
  return { adapter, setCalls, pushRemote }
}

const parse = (raw: string | null): number => (raw ? Number(raw) : 0)
const serialize = (n: number): string => String(n)

const flush = async (ms = 1000) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

describe('useSyncedState — sync robustness', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('writes edits made while locked once a trusted snapshot unlocks writes (even if it equals the defaults)', async () => {
    const { adapter, setCalls, pushRemote } = makeAdapter({ failGet: true })
    const { result } = renderHook(() => useSyncedState(adapter, 'k', 0, parse, serialize))
    await waitFor(() => expect(result.current[2]).toBe(true))
    expect(result.current[3]).toBe(false)
    act(() => result.current[1](5))
    await flush()
    expect(setCalls).toEqual([])
    // Cloud really is empty: the snapshot matches the defaults, so it doesn't
    // replace the edit — the edit must now be written without another change.
    act(() => pushRemote(null))
    expect(result.current[3]).toBe(true)
    await flush()
    expect(setCalls).toEqual(['5'])
  })

  it('ignores an untrusted snapshot while locked', async () => {
    const { adapter, setCalls, pushRemote } = makeAdapter({ failGet: true })
    const { result } = renderHook(() => useSyncedState(adapter, 'k', 0, parse, serialize))
    await waitFor(() => expect(result.current[2]).toBe(true))
    act(() => pushRemote(null, false))
    expect(result.current[3]).toBe(false)
    act(() => result.current[1](3))
    await flush()
    expect(setCalls).toEqual([])
  })

  it('trusted is true after a resolved read, and the registry agrees', async () => {
    const { adapter } = makeAdapter({ initial: '4' })
    const { result } = renderHook(() => useSyncedState(adapter, 'reg', 0, parse, serialize))
    await waitFor(() => expect(result.current[3]).toBe(true))
    expect(isSyncedKeyTrusted(adapter, 'reg')).toBe(true)
    expect(isSyncedKeyTrusted(adapter, 'other')).toBe(false)
  })

  it('a hydrate timeout leaves loaded=true but trusted=false', async () => {
    const { adapter } = makeAdapter({ hangGet: true })
    const { result } = renderHook(() => useSyncedState(adapter, 'k', 7, parse, serialize))
    await flush(13000)
    expect(result.current[2]).toBe(true)
    expect(result.current[3]).toBe(false)
    expect(result.current[0]).toBe(7)
  })

  it('loaded/trusted are adapter-scoped: false in the same render as the swap', async () => {
    const a = makeAdapter({ initial: '1' })
    const b = makeAdapter({ hangGet: true })
    const seen: Array<[StorageAdapter, boolean, boolean]> = []
    const { result, rerender } = renderHook(
      ({ adapter }) => {
        const r = useSyncedState(adapter, 'k', 0, parse, serialize)
        seen.push([adapter, r[2], r[3]])
        return r
      },
      { initialProps: { adapter: a.adapter } },
    )
    await waitFor(() => expect(result.current[2]).toBe(true))
    seen.length = 0
    rerender({ adapter: b.adapter })
    // Every render with the new adapter reports not-loaded — no stale frame.
    expect(seen.length).toBeGreaterThan(0)
    for (const [ad, loaded, trusted] of seen) {
      expect(ad).toBe(b.adapter)
      expect(loaded).toBe(false)
      expect(trusted).toBe(false)
    }
  })

  it('reports tooLarge and skips the write when the value is over the cap', async () => {
    const issues: SyncIssue[] = []
    const off = onSyncIssue((i) => issues.push(i))
    const { adapter, setCalls } = makeAdapter({ initial: '"x"' })
    const { result } = renderHook(() =>
      useSyncedState<string>(adapter, 'big', '', (raw) => raw ?? '', (s) => s),
    )
    await waitFor(() => expect(result.current[3]).toBe(true))
    act(() => result.current[1]('y'.repeat(MAX_SYNCED_VALUE_BYTES + 10)))
    await flush()
    expect(setCalls).toEqual([])
    expect(issues).toEqual([{ kind: 'tooLarge', key: 'big' }])
    off()
  })

  it('reports a failed write, but not permission-denied', async () => {
    const issues: SyncIssue[] = []
    const off = onSyncIssue((i) => issues.push(i))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const denied = makeAdapter({ initial: '1', setError: { code: 'firestore/permission-denied' } })
    const r1 = renderHook(() => useSyncedState(denied.adapter, 'p', 0, parse, serialize))
    await waitFor(() => expect(r1.result.current[3]).toBe(true))
    act(() => r1.result.current[1](2))
    await flush()
    expect(issues).toEqual([])
    const failing = makeAdapter({ initial: '1', setError: { code: 'firestore/unavailable' } })
    const r2 = renderHook(() => useSyncedState(failing.adapter, 'q', 0, parse, serialize))
    await waitFor(() => expect(r2.result.current[3]).toBe(true))
    act(() => r2.result.current[1](2))
    await flush()
    expect(issues.map((i) => [i.kind, i.key])).toEqual([['writeFailed', 'q']])
    off()
    warn.mockRestore()
  })

  describe('todos merge', () => {
    const td = (id: string, updatedAt: number, text = id): Todo => ({
      id, text, done: false, priority: 'medium', dueDate: '', trashed: false, updatedAt,
    })
    const parseTodos = (raw: string | null): Todo[] => (raw ? JSON.parse(raw) : [])
    const serializeTodos = (v: Todo[]) => JSON.stringify(v)

    it('merges a remote snapshot into a pending local change instead of replacing it', async () => {
      const base = [td('a', 1), td('b', 1)]
      const { adapter, setCalls, pushRemote } = makeAdapter({ initial: serializeTodos(base) })
      const { result } = renderHook(() =>
        useSyncedState<Todo[]>(adapter, 'todos', [], parseTodos, serializeTodos),
      )
      await waitFor(() => expect(result.current[3]).toBe(true))
      // Local edit + local add, still inside the 400ms debounce…
      act(() => result.current[1]([td('a', 5, 'a-local'), td('b', 1), td('c', 5)]))
      // …when another device's edit to `b` + new `d` arrives.
      act(() => pushRemote(serializeTodos([td('a', 1), td('b', 6, 'b-remote'), td('d', 6)])))
      expect(result.current[0].map((t) => `${t.id}:${t.text}`)).toEqual([
        'a:a-local', 'b:b-remote', 'c:c', 'd:d',
      ])
      await flush()
      // The union is written back.
      expect(setCalls).toHaveLength(1)
      expect(parseTodos(setCalls[0]).map((t) => t.id)).toEqual(['a', 'b', 'c', 'd'])
    })

    it('with no pending local change a snapshot simply replaces (no echo write)', async () => {
      const { adapter, setCalls, pushRemote } = makeAdapter({ initial: serializeTodos([td('a', 1)]) })
      const { result } = renderHook(() =>
        useSyncedState<Todo[]>(adapter, 'todos', [], parseTodos, serializeTodos),
      )
      await waitFor(() => expect(result.current[3]).toBe(true))
      act(() => pushRemote(serializeTodos([])))
      expect(result.current[0]).toEqual([])
      await flush()
      expect(setCalls).toEqual([])
    })

    it('non-todos keys keep replace-on-snapshot', async () => {
      const { adapter, pushRemote } = makeAdapter({ initial: '1' })
      const { result } = renderHook(() => useSyncedState(adapter, 'k', 0, parse, serialize))
      await waitFor(() => expect(result.current[3]).toBe(true))
      act(() => result.current[1](5))
      act(() => pushRemote('9'))
      expect(result.current[0]).toBe(9)
    })

    it('an explicit merge option is honored for any key', async () => {
      const { adapter, pushRemote } = makeAdapter({ initial: '1' })
      const merge = (_b: number | null, l: number, r: number) => l + r
      const { result } = renderHook(() =>
        useSyncedState(adapter, 'k', 0, parse, serialize, { merge }),
      )
      await waitFor(() => expect(result.current[3]).toBe(true))
      act(() => result.current[1](5))
      act(() => pushRemote('9'))
      expect(result.current[0]).toBe(14)
    })
  })
})
