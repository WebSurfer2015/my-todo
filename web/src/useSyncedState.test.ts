// @vitest-environment happy-dom
/**
 * Tests for mobile/src/useSyncedState.ts — the per-uid hook that
 * backs every persisted entity (todos, profile, categories). Pure
 * React (no React Native), so we host it under the web Vitest with
 * a happy-dom env per the file-level pragma above.
 *
 * Covers:
 *   - hydration (async getItem → setState + loaded flag flip)
 *   - debounced write (~400ms; one setItem per burst)
 *   - subscribe path (remote update → setState, no echo)
 *   - error swallowing on adapter throws
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSyncedState } from '../../mobile/src/useSyncedState'
import type { StorageAdapter } from '../../core/src/persistence'

function makeAdapter(opts: {
  initial?: string | null
  subscribe?: boolean
  failGet?: boolean
  failSet?: boolean
} = {}) {
  const store: { value: string | null } = { value: opts.initial ?? null }
  const setCalls: Array<{ key: string; value: string }> = []
  let sub: ((value: string | null) => void) | null = null
  const adapter: StorageAdapter = {
    async getItem(_key) {
      if (opts.failGet) throw new Error('boom')
      return store.value
    },
    async setItem(key, value) {
      if (opts.failSet) throw new Error('boom')
      store.value = value
      setCalls.push({ key, value })
    },
    async removeItem() { store.value = null },
    async clear() { store.value = null },
  }
  if (opts.subscribe) {
    adapter.subscribe = (_key, cb) => {
      sub = cb
      return () => { sub = null }
    }
  }
  // Helper for the test to push a "remote update" through subscribe.
  function pushRemote(value: string | null) {
    if (!sub) throw new Error('subscribe was not enabled')
    sub(value)
  }
  return { adapter, store, setCalls, pushRemote }
}

const parse = (raw: string | null): number => (raw ? Number(raw) : 0)
const serialize = (n: number): string => String(n)

describe('useSyncedState', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('starts with initial value and loaded=false; flips loaded true after hydrate', async () => {
    const { adapter } = makeAdapter({ initial: '42' })
    const { result } = renderHook(() =>
      useSyncedState(adapter, 'k', 0, parse, serialize),
    )
    expect(result.current[0]).toBe(0)
    expect(result.current[2]).toBe(false)
    await waitFor(() => expect(result.current[2]).toBe(true))
    expect(result.current[0]).toBe(42)
  })

  it('returns initial when hydrate fails (loaded still flips true)', async () => {
    const { adapter } = makeAdapter({ failGet: true })
    const { result } = renderHook(() =>
      useSyncedState(adapter, 'k', 7, parse, serialize),
    )
    await waitFor(() => expect(result.current[2]).toBe(true))
    expect(result.current[0]).toBe(7)
  })

  it('writes back through adapter.setItem on mutation (debounced ~400ms)', async () => {
    const { adapter, setCalls } = makeAdapter({ initial: '1' })
    const { result } = renderHook(() =>
      useSyncedState(adapter, 'k', 0, parse, serialize),
    )
    await waitFor(() => expect(result.current[2]).toBe(true))
    act(() => result.current[1](5))
    // Not yet — still in debounce window.
    expect(setCalls.length).toBe(0)
    act(() => { vi.advanceTimersByTime(450) })
    await waitFor(() => expect(setCalls.length).toBe(1))
    expect(setCalls[0]).toEqual({ key: 'k', value: '5' })
  })

  it('collapses a burst of mutations into a single trailing write', async () => {
    const { adapter, setCalls } = makeAdapter({ initial: '0' })
    const { result } = renderHook(() =>
      useSyncedState(adapter, 'k', 0, parse, serialize),
    )
    await waitFor(() => expect(result.current[2]).toBe(true))
    act(() => result.current[1](1))
    act(() => result.current[1](2))
    act(() => result.current[1](3))
    act(() => { vi.advanceTimersByTime(450) })
    await waitFor(() => expect(setCalls.length).toBe(1))
    expect(setCalls[0].value).toBe('3')
  })

  it('does not write back when value matches lastSerialized (round-trip guard)', async () => {
    const { adapter, setCalls } = makeAdapter({ initial: '5' })
    const { result } = renderHook(() =>
      useSyncedState(adapter, 'k', 0, parse, serialize),
    )
    await waitFor(() => expect(result.current[0]).toBe(5))
    act(() => result.current[1](5)) // same value
    act(() => { vi.advanceTimersByTime(450) })
    expect(setCalls.length).toBe(0)
  })

  it('applies remote updates via subscribe and does NOT echo them back', async () => {
    const { adapter, setCalls, pushRemote } = makeAdapter({
      initial: '1',
      subscribe: true,
    })
    const { result } = renderHook(() =>
      useSyncedState(adapter, 'k', 0, parse, serialize),
    )
    await waitFor(() => expect(result.current[0]).toBe(1))
    act(() => pushRemote('9'))
    await waitFor(() => expect(result.current[0]).toBe(9))
    act(() => { vi.advanceTimersByTime(450) })
    // No echo — lastSerializedRef was updated by the subscribe callback.
    expect(setCalls.length).toBe(0)
  })

  it('calls onSaved with a ms timestamp after a successful write', async () => {
    const { adapter } = makeAdapter({ initial: '0' })
    const onSaved = vi.fn()
    const { result } = renderHook(() =>
      useSyncedState(adapter, 'k', 0, parse, serialize, onSaved),
    )
    await waitFor(() => expect(result.current[2]).toBe(true))
    act(() => result.current[1](1))
    act(() => { vi.advanceTimersByTime(450) })
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(typeof onSaved.mock.calls[0][0]).toBe('number')
  })
})
