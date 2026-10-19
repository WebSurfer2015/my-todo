// @vitest-environment happy-dom
/**
 * useTodoStore across an account change (the composer's own logic, with the
 * Firestore adapter / auth / i18n / notify mocked):
 *   - the adapter follows the uid (memoized on uid, not the User object)
 *   - session filters reset when the signed-in account changes
 *   - a sync problem shows its calm snackbar once per account
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { strings } from '../../../core/src/data/i18n'
import type { StorageAdapter } from '../../../core/src/ports/persistence'

const h = vi.hoisted(() => ({
  user: { uid: 'u1' } as { uid: string } | null,
  failTodos: new Set<string>(),
  adapters: [] as string[],
  snacks: [] as string[],
}))

vi.mock('../adapters/firebase', () => ({ db: {} }))
vi.mock('../adapters/aiInfer', () => ({ classifyGroceryDept: async () => null }))
vi.mock('../adapters/firestoreAdapter', () => ({
  makeFirestoreAdapter: (_db: unknown, uid: string): StorageAdapter => {
    h.adapters.push(uid)
    const data = new Map<string, string>()
    return {
      async getItem(key) {
        return data.get(key) ?? null
      },
      async setItem(key, value) {
        if (key === 'todos' && h.failTodos.has(uid)) throw new Error('permission-denied')
        data.set(key, value)
      },
      async removeItem(key) {
        data.delete(key)
      },
    }
  },
}))
vi.mock('../app/AuthContext', () => ({ useAuth: () => ({ user: h.user }) }))
vi.mock('../app/LangContext', () => ({ useLang: () => ({ t: strings.en }) }))
const notify = vi.hoisted(() => ({
  showSnackbar: (o: { message: string }) => {
    h.snacks.push(o.message)
  },
  dismissSnackbar: () => {},
}))
vi.mock('../app/notify', () => ({ useNotify: () => notify }))
vi.mock('../app/useReducedMotion', () => ({ useReducedMotion: () => false }))

import { useTodoStore } from '../store/useTodoStore'

const WRITE_FAILED = "Couldn't save your latest change. It'll try again with your next edit."

describe('useTodoStore — account change', () => {
  beforeEach(() => {
    h.user = { uid: 'u1' }
    h.failTodos.clear()
    h.adapters = []
    h.snacks = []
  })

  it('builds one adapter per uid — not per User object (token refresh)', async () => {
    const hook = renderHook(() => useTodoStore())
    await waitFor(() => expect(hook.result.current.loaded).toBe(true))
    // A token refresh hands a NEW User object with the same uid.
    h.user = { uid: 'u1' }
    hook.rerender()
    expect(h.adapters).toEqual(['u1'])
    h.user = { uid: 'u2' }
    hook.rerender()
    expect(h.adapters).toEqual(['u1', 'u2'])
    hook.unmount()
  })

  it('resets the session filters when the account changes', async () => {
    const hook = renderHook(() => useTodoStore())
    await waitFor(() => expect(hook.result.current.loaded).toBe(true))
    act(() => hook.result.current.setFilters(['done', 'pri:high']))
    expect(hook.result.current.filters).toEqual(['done', 'pri:high'])
    // Same account (token refresh): kept.
    h.user = { uid: 'u1' }
    hook.rerender()
    expect(hook.result.current.filters).toEqual(['done', 'pri:high'])
    h.user = { uid: 'u2' }
    hook.rerender()
    expect(hook.result.current.filters).toEqual([])
    expect(hook.result.current.filter).toBe('all')
    hook.unmount()
  })

  it('shows the sync-problem snackbar once per account', async () => {
    h.failTodos.add('u1')
    h.failTodos.add('u2')
    const hook = renderHook(() => useTodoStore())
    await waitFor(() => expect(hook.result.current.loaded).toBe(true))
    act(() => {
      hook.result.current.addTask('one', 'medium', '')
    })
    await waitFor(() => expect(h.snacks).toContain(WRITE_FAILED), { timeout: 3000 })
    act(() => {
      hook.result.current.addTask('two', 'medium', '')
    })
    // Give the second write time to fail too: still one notice.
    await new Promise((r) => setTimeout(r, 900))
    expect(h.snacks.filter((m) => m === WRITE_FAILED)).toHaveLength(1)
    // The next account gets its own notice.
    h.user = { uid: 'u2' }
    hook.rerender()
    await waitFor(() => expect(hook.result.current.loaded).toBe(true))
    act(() => {
      hook.result.current.addTask('three', 'medium', '')
    })
    await waitFor(() => expect(h.snacks.filter((m) => m === WRITE_FAILED)).toHaveLength(2), { timeout: 3000 })
    hook.unmount()
  })
})
