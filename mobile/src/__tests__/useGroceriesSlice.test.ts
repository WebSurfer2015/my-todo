// @vitest-environment happy-dom
/**
 * useGroceriesSlice Undo surfaces used by Ask Mochi's inline "✓ Done · Undo":
 *   - re-adding an item the user already had reports its previous state, and
 *     restoreGrocery puts it back (Undo used to do nothing for it)
 *   - store rename / delete return an Undo that restores the store list and
 *     every item's store tags
 * The AI classifier is mocked out (agentEnabled is off anyway) — no network.
 */
import { describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../adapters/aiInfer', () => ({
  classifyGroceryDept: vi.fn(async () => ({ groupId: null, newGroupLabel: null, storeHint: null, recommendedStores: [] })),
}))

import { useGroceriesSlice, type GroceriesSliceDeps } from '../store/slices/useGroceriesSlice'
import { createTodoStore } from '../../../core/src/store'
import { strings } from '../../../core/src/data/i18n'
import type { StorageAdapter } from '../../../core/src/ports/persistence'
import type { Profile } from '../core-bindings/profile'

function memoryAdapter(): StorageAdapter {
  const data = new Map<string, string>()
  return {
    async getItem(key) { return data.get(key) ?? null },
    async setItem(key, value) { data.set(key, value) },
    async removeItem(key) { data.delete(key) },
    async clear() { data.clear() },
  }
}

async function setup() {
  const profileRef = { current: { agentEnabled: false, groceryStores: ['Costco', 'Target'] } as unknown as Profile }
  const deps: GroceriesSliceDeps = {
    setProfile: (next) => {
      profileRef.current = typeof next === 'function' ? next(profileRef.current) : next
    },
    profileRef,
    notify: { showSnackbar: () => {} },
    t: {
      groceryNewStorePrompt: (n) => n,
      grocerySortedInto: (d) => d,
      groceryNewDeptSuggest: (l) => l,
      create: 'Create',
    },
    actions: createTodoStore({ t: strings.en }).actions,
  }
  const adapter = memoryAdapter()
  const hook = renderHook(() => useGroceriesSlice(adapter, deps))
  await waitFor(() => expect(hook.result.current.groceriesLoaded).toBe(true))
  return { hook, profileRef }
}

describe('useGroceriesSlice — Mochi Undo surfaces', () => {
  it('a brand-new item reports no previous state', async () => {
    const { hook } = await setup()
    let res: ReturnType<typeof hook.result.current.addGrocery>
    act(() => {
      res = hook.result.current.addGrocery({ text: 'Milk' })
    })
    expect(res!.id).toBeTruthy()
    expect(res!.previous).toBeUndefined()
  })

  it('re-adding a bought item returns its previous state, and restoreGrocery puts it back', async () => {
    const { hook } = await setup()
    let id = ''
    act(() => {
      id = hook.result.current.addGrocery({ text: 'Eggs', stores: ['Costco'] })!.id
    })
    act(() => {
      hook.result.current.toggleGroceryChecked(id)
    })
    const bought = hook.result.current.groceries.find((g) => g.id === id)!
    expect(bought.checked).toBe(true)

    let res: ReturnType<typeof hook.result.current.addGrocery>
    act(() => {
      res = hook.result.current.addGrocery({ text: 'eggs', stores: ['Target'] })
    })
    expect(res).toEqual({
      id,
      previous: { checked: true, checkedAt: bought.checkedAt, addedAt: bought.addedAt, stores: ['Costco'] },
    })
    const readded = hook.result.current.groceries.find((g) => g.id === id)!
    expect(readded.checked).toBe(false)
    expect(readded.stores).toEqual(['Costco', 'Target'])

    act(() => hook.result.current.restoreGrocery(id, res!.previous!))
    const restored = hook.result.current.groceries.find((g) => g.id === id)!
    expect(restored.checked).toBe(true)
    expect(restored.checkedAt).toBe(bought.checkedAt)
    expect(restored.stores).toEqual(['Costco'])
  })

  it('deleteGroceryStore returns an Undo that restores the store and item tags', async () => {
    const { hook, profileRef } = await setup()
    let id = ''
    act(() => {
      id = hook.result.current.addGrocery({ text: 'Bread', stores: ['Costco'] })!.id
    })
    let undo: (() => void) | null = null
    act(() => {
      undo = hook.result.current.deleteGroceryStore('Costco')
    })
    expect(profileRef.current.groceryStores).toEqual(['Target'])
    expect(hook.result.current.groceries.find((g) => g.id === id)!.stores).toEqual([])
    act(() => undo!())
    expect(profileRef.current.groceryStores).toEqual(['Costco', 'Target'])
    expect(hook.result.current.groceries.find((g) => g.id === id)!.stores).toEqual(['Costco'])
  })

  it('renameGroceryStore returns an Undo (and null for a no-op rename)', async () => {
    const { hook, profileRef } = await setup()
    let id = ''
    act(() => {
      id = hook.result.current.addGrocery({ text: 'Soap', stores: ['Target'] })!.id
    })
    let undo: (() => void) | null = null
    act(() => {
      undo = hook.result.current.renameGroceryStore('Target', 'Tgt')
    })
    expect(profileRef.current.groceryStores).toEqual(['Costco', 'Tgt'])
    expect(hook.result.current.groceries.find((g) => g.id === id)!.stores).toEqual(['Tgt'])
    act(() => undo!())
    expect(profileRef.current.groceryStores).toEqual(['Costco', 'Target'])
    expect(hook.result.current.groceries.find((g) => g.id === id)!.stores).toEqual(['Target'])
    expect(hook.result.current.renameGroceryStore('Costco', 'Costco')).toBeNull()
  })
})
