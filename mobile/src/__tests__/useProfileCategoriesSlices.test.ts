// @vitest-environment happy-dom
/**
 * The two small slices — persisted state + thin wrappers over core
 * transforms:
 *   - useCategoriesSlice: seeds, add returns the new id, edit / reorder
 *   - useProfileSlice: pinned filters (toggle, cap snackbar, keep-and-clear),
 *     Home stat tiles, view change resets the filter, hiding a status /
 *     priority strips it from pinned sets.
 */
import { describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCategoriesSlice } from '../store/slices/useCategoriesSlice'
import { useProfileSlice, type ProfileSliceDeps } from '../store/slices/useProfileSlice'
import { createTodoStore } from '../../../core/src/store'
import { strings } from '../../../core/src/data/i18n'
import { SEED_CATEGORIES } from '../core-bindings/categories'
import { PIN_LIMIT } from '../../../core/src/logic/filters'
import type { StorageAdapter } from '../../../core/src/ports/persistence'
import type { Filter } from '../core-bindings/types'

function memoryAdapter(): StorageAdapter {
  const data = new Map<string, string>()
  return {
    async getItem(key) { return data.get(key) ?? null },
    async setItem(key, value) { data.set(key, value) },
    async removeItem(key) { data.delete(key) },
  }
}

const actions = createTodoStore({ t: strings.en }).actions

describe('useCategoriesSlice', () => {
  it('seeds, adds (returning the id), edits and reorders', async () => {
    const adapter = memoryAdapter()
    const hook = renderHook(() => useCategoriesSlice(adapter, actions))
    await waitFor(() => expect(hook.result.current.categoriesLoaded).toBe(true))
    expect(hook.result.current.categories).toEqual(SEED_CATEGORIES)
    let id = ''
    act(() => {
      id = hook.result.current.addCategory({ label: 'Garden', color: '#00aa00', icon: 'tag' })
    })
    const added = () => hook.result.current.categories.find((c) => c.id === id)
    expect(added()?.label).toBe('Garden')
    act(() => hook.result.current.editCategory(id, { label: 'Yard', color: '#00aa00', icon: 'leaf' }))
    expect(added()?.label).toBe('Yard')
    const n = hook.result.current.categories.length
    act(() => hook.result.current.reorderCategories(n - 1, 0))
    expect(hook.result.current.categories[0].id).toBe(id)
  })
})

async function profileSetup() {
  const setFilter = vi.fn()
  const clearFilters = vi.fn()
  const messages: string[] = []
  const deps: ProfileSliceDeps = {
    setFilter,
    clearFilters,
    t: { pinCapReached: (n) => `cap ${n}` },
    notify: { showSnackbar: ({ message }) => { messages.push(message) } },
    actions,
  }
  const adapter = memoryAdapter()
  const hook = renderHook(() => useProfileSlice(adapter, deps))
  await waitFor(() => expect(hook.result.current.profileLoaded).toBe(true))
  return { hook, setFilter, clearFilters, messages }
}

describe('useProfileSlice', () => {
  it('pins and unpins a filter set', async () => {
    const { hook } = await profileSetup()
    act(() => hook.result.current.pinFilter(['open']))
    expect(hook.result.current.profile.pinnedFilters).toContainEqual(['open'])
    act(() => hook.result.current.pinFilter(['open']))
    expect(hook.result.current.profile.pinnedFilters ?? []).not.toContainEqual(['open'])
  })

  it('stops at the pin cap with a calm snackbar', async () => {
    const { hook, messages } = await profileSetup()
    const sets: Filter[][] = Array.from({ length: PIN_LIMIT + 1 }, (_, i) => [`cat:c${i}` as Filter])
    for (const s of sets) act(() => hook.result.current.pinFilter(s))
    expect(hook.result.current.profile.pinnedFilters?.length).toBe(PIN_LIMIT)
    expect(messages).toContain(`cap ${PIN_LIMIT}`)
    act(() => hook.result.current.keepAndClearFilter(['cat:extra' as Filter]))
    expect(hook.result.current.profile.pinnedFilters?.length).toBe(PIN_LIMIT)
  })

  it('pinFilter reports the cap to its caller; silent shows no snackbar (a sheet says it inline)', async () => {
    const { hook, messages } = await profileSetup()
    for (let i = 0; i < PIN_LIMIT; i++) {
      act(() => {
        expect(hook.result.current.pinFilter([`cat:c${i}` as Filter])).toEqual({ limitReached: false })
      })
    }
    act(() => {
      expect(hook.result.current.pinFilter(['cat:extra' as Filter], { silent: true })).toEqual({ limitReached: true })
    })
    expect(messages).toEqual([])
    act(() => {
      expect(hook.result.current.pinFilter(['cat:extra' as Filter])).toEqual({ limitReached: true })
    })
    expect(messages).toEqual([`cap ${PIN_LIMIT}`])
    // Unpinning at the cap is fine.
    act(() => {
      expect(hook.result.current.pinFilter(['cat:c0' as Filter])).toEqual({ limitReached: false })
    })
    expect(hook.result.current.profile.pinnedFilters?.length).toBe(PIN_LIMIT - 1)
  })

  it('keepAndClearFilter at the pin cap says so calmly and still clears the selection', async () => {
    const { hook, messages, clearFilters } = await profileSetup()
    for (let i = 0; i < PIN_LIMIT; i++) act(() => hook.result.current.pinFilter([`cat:c${i}` as Filter]))
    expect(messages).toEqual([])
    act(() => hook.result.current.keepAndClearFilter(['cat:extra' as Filter]))
    expect(messages).toEqual([`cap ${PIN_LIMIT}`])
    expect(hook.result.current.profile.pinnedFilters ?? []).not.toContainEqual(['cat:extra'])
    expect(clearFilters).toHaveBeenCalledTimes(1)
    // An already-pinned set is not "over the cap".
    act(() => hook.result.current.keepAndClearFilter(['cat:c0' as Filter]))
    expect(messages).toEqual([`cap ${PIN_LIMIT}`])
    expect(hook.result.current.profile.pinnedFilters?.length).toBe(PIN_LIMIT)
  })

  it('keepAndClearFilter pins the set and clears the selection', async () => {
    const { hook, clearFilters } = await profileSetup()
    act(() => hook.result.current.keepAndClearFilter(['done', 'pri:high']))
    expect(hook.result.current.profile.pinnedFilters).toContainEqual(['done', 'pri:high'])
    expect(clearFilters).toHaveBeenCalledTimes(1)
    act(() => hook.result.current.keepAndClearFilter([]))
    expect(clearFilters).toHaveBeenCalledTimes(2)
  })

  it('Home stat tiles toggle and clear', async () => {
    const { hook } = await profileSetup()
    act(() => hook.result.current.clearHomeStatTiles())
    expect(hook.result.current.profile.homeStatTiles).toEqual([])
    act(() => hook.result.current.toggleHomeStatTile('overdue'))
    expect(hook.result.current.profile.homeStatTiles).toContain('overdue')
  })

  it('changing the view resets the filter to that view\'s default', async () => {
    const { hook, setFilter } = await profileSetup()
    act(() => hook.result.current.changeView('category'))
    expect(hook.result.current.profile.view).toBe('category')
    expect(setFilter).toHaveBeenLastCalledWith('all')
  })

  it('hiding a status or priority strips it from pinned sets; rename / reorder persist', async () => {
    const { hook } = await profileSetup()
    act(() => {
      hook.result.current.pinFilter(['overdue'])
      hook.result.current.pinFilter(['pri:low'])
    })
    act(() => hook.result.current.toggleStatusHidden('overdue'))
    expect(hook.result.current.profile.pinnedFilters ?? []).not.toContainEqual(['overdue'])
    act(() => hook.result.current.togglePriorityHidden('low'))
    expect(hook.result.current.profile.pinnedFilters ?? []).not.toContainEqual(['pri:low'])
    // Un-hiding leaves pins alone.
    act(() => hook.result.current.toggleStatusHidden('overdue'))
    act(() => hook.result.current.togglePriorityHidden('low'))
    act(() => hook.result.current.renameStatus('open', 'To do'))
    expect(hook.result.current.profile.statuses?.find((s) => s.id === 'open')?.label).toBe('To do')
    act(() => hook.result.current.reorderStatuses(['done', 'open', 'overdue', 'notDo']))
    act(() => hook.result.current.reorderPriorities(['low', 'medium', 'high']))
    expect(hook.result.current.profile.priorities?.map((p) => p.id)).toEqual(['low', 'medium', 'high'])
  })
})
