// @vitest-environment happy-dom
/**
 * useTodoStore.deleteCategory's Undo (manual snackbar + Ask Mochi): puts back
 * the category in its slot, the category on each of its to-dos (the delete
 * leaves them in place, uncategorized — never binned), AND the filter
 * selection / pinned filter sets / Home stat tiles it stripped — and reports
 * whether anything came back (the shared store Undo contract).
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { strings } from '../../../core/src/data/i18n'
import type { StorageAdapter } from '../../../core/src/ports/persistence'

vi.mock('../adapters/firebase', () => ({ db: {} }))
vi.mock('../adapters/aiInfer', () => ({ classifyGroceryDept: async () => null }))
vi.mock('../adapters/firestoreAdapter', () => ({
  makeFirestoreAdapter: (): StorageAdapter => {
    const data = new Map<string, string>()
    return {
      async getItem(key) {
        return data.get(key) ?? null
      },
      async setItem(key, value) {
        data.set(key, value)
      },
      async removeItem(key) {
        data.delete(key)
      },
    }
  },
}))
vi.mock('../app/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }))
vi.mock('../app/LangContext', () => ({ useLang: () => ({ t: strings.en }) }))
const notify = vi.hoisted(() => ({ showSnackbar: () => {}, dismissSnackbar: () => {} }))
vi.mock('../app/notify', () => ({ useNotify: () => notify }))
vi.mock('../app/useReducedMotion', () => ({ useReducedMotion: () => false }))

import { useTodoStore } from '../store/useTodoStore'

describe('useTodoStore.deleteCategory Undo', () => {
  it('restores the category, its to-dos, the filters, pinned sets and Home tiles', async () => {
    const hook = renderHook(() => useTodoStore())
    await waitFor(() => expect(hook.result.current.loaded).toBe(true))
    act(() => {
      hook.result.current.addTask('Report', 'medium', '', 'work')
      hook.result.current.setFilters(['cat:work', 'pri:high'])
      hook.result.current.saveProfile({
        pinnedFilters: [['cat:work'], ['pri:high']],
        homeStatTiles: ['open', 'cat:work'],
      })
    })
    const catsBefore = hook.result.current.categories.map((c) => c.id)
    let undo: (() => unknown) | null = null
    act(() => {
      undo = hook.result.current.deleteCategory('work')
    })
    expect(hook.result.current.categories.some((c) => c.id === 'work')).toBe(false)
    // The to-do stays open, just uncategorized.
    const report = hook.result.current.todos.find((t) => t.text === 'Report')!
    expect(report.trashed).toBe(false)
    expect(report.done).toBe(false)
    expect(report.category).toBeUndefined()
    expect(hook.result.current.filters).toEqual(['pri:high'])
    expect(hook.result.current.profile.pinnedFilters).toEqual([['pri:high']])
    expect(hook.result.current.profile.homeStatTiles).toEqual(['open'])
    let out: unknown
    act(() => {
      out = undo!()
    })
    expect(out).toBe(true)
    expect(hook.result.current.categories.map((c) => c.id)).toEqual(catsBefore)
    expect(hook.result.current.todos.find((t) => t.text === 'Report')?.category).toBe('work')
    expect(hook.result.current.filters).toEqual(['cat:work', 'pri:high'])
    expect(hook.result.current.profile.pinnedFilters).toEqual([['cat:work'], ['pri:high']])
    expect(hook.result.current.profile.homeStatTiles).toEqual(['open', 'cat:work'])
    // Nothing left to put back.
    act(() => {
      out = undo!()
    })
    expect(out).toBe(false)
    hook.unmount()
  })

  it('a done to-do keeps its done state; Undo puts the category back on open and done rows', async () => {
    const hook = renderHook(() => useTodoStore())
    await waitFor(() => expect(hook.result.current.loaded).toBe(true))
    let done = ''
    act(() => {
      hook.result.current.addTask('Open one', 'medium', '', 'work')
      done = hook.result.current.addTask('Done one', 'medium', '', 'work')
    })
    act(() => {
      hook.result.current.toggle(done, { silent: true })
    })
    const doneBefore = hook.result.current.todos.find((t) => t.id === done)!
    let undo: (() => unknown) | null = null
    act(() => {
      undo = hook.result.current.deleteCategory('work')
    })
    const after = hook.result.current.todos.find((t) => t.id === done)!
    expect(after.category).toBeUndefined()
    expect(after.done).toBe(doneBefore.done)
    expect(after.trashed).toBe(doneBefore.trashed)
    act(() => {
      undo!()
    })
    for (const text of ['Open one', 'Done one']) {
      expect(hook.result.current.todos.find((t) => t.text === text)?.category).toBe('work')
    }
    hook.unmount()
  })

  it('a filter changed since the delete is left alone', async () => {
    const hook = renderHook(() => useTodoStore())
    await waitFor(() => expect(hook.result.current.loaded).toBe(true))
    act(() => hook.result.current.setFilters(['cat:school']))
    let undo: (() => unknown) | null = null
    act(() => {
      undo = hook.result.current.deleteCategory('school')
    })
    expect(hook.result.current.filters).toEqual([])
    act(() => hook.result.current.setFilters(['done']))
    act(() => {
      undo!()
    })
    expect(hook.result.current.filters).toEqual(['done'])
    expect(hook.result.current.categories.some((c) => c.id === 'school')).toBe(true)
    hook.unmount()
  })

  it('a to-do edited since → "partial"; silent shows no partial snackbar (Mochi says it inline)', async () => {
    const spy = vi.spyOn(notify, 'showSnackbar')
    const hook = renderHook(() => useTodoStore())
    await waitFor(() => expect(hook.result.current.loaded).toBe(true))
    let a = ''
    act(() => {
      a = hook.result.current.addTask('Report', 'medium', '', 'work')
      hook.result.current.addTask('Slides', 'medium', '', 'work')
    })
    let undo: (() => unknown) | null = null
    act(() => {
      undo = hook.result.current.deleteCategory('work', { silent: true })
    })
    act(() => hook.result.current.updateText(a, 'Report v2'))
    spy.mockClear()
    let out: unknown
    act(() => {
      out = undo!()
    })
    expect(out).toBe('partial')
    expect(spy).not.toHaveBeenCalled()
    expect(hook.result.current.todos.find((t) => t.text === 'Slides')?.category).toBe('work')
    expect(hook.result.current.categories.some((c) => c.id === 'work')).toBe(true)
    spy.mockRestore()
    hook.unmount()
  })
})
