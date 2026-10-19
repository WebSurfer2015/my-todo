/**
 * "Linked N items to <store>. Undo" — the Undo removes the store tag from
 * exactly the items the link added it to.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { newlyLinkedIds, unlinkPatches } from '../features/groceries/StorePicker/linkUndo'
import { linkStoreToItems, type GroceryItem } from '../../../core/src/data/groceries'

const item = (id: string, stores: string[] = []): GroceryItem =>
  ({ id, text: id, groupId: 'other', checked: false, stores } as unknown as GroceryItem)

describe('store link Undo', () => {
  it('newlyLinkedIds skips items already tagged and unknown ids', () => {
    const items = [item('a'), item('b', ['Costco']), item('c')]
    expect(newlyLinkedIds(items, 'Costco', ['a', 'b', 'zz'])).toEqual(['a'])
  })

  it('link then Undo puts every item back as it was', () => {
    const before = [item('a', ['Safeway']), item('b', ['Costco']), item('c')]
    const ids = ['a', 'b', 'c']
    const linked = newlyLinkedIds(before, 'Costco', ids)
    const after = linkStoreToItems(before, 'Costco', ids)
    const patches = unlinkPatches(after, 'Costco', linked)
    expect(patches).toEqual([
      { id: 'a', stores: ['Safeway'] },
      { id: 'c', stores: [] },
    ])
    const undone = after.map((it) => {
      const p = patches.find((x) => x.id === it.id)
      return p ? { ...it, stores: p.stores } : it
    })
    expect(undone.map((it) => it.stores)).toEqual(before.map((it) => it.stores))
  })

  it('an item deleted or untagged since is left alone', () => {
    const now = [item('c')]
    expect(unlinkPatches(now, 'Costco', ['a', 'c'])).toEqual([])
  })

  it('StorePicker offers the Undo on the linked snackbar', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(join(here, '..', 'features/groceries/StorePicker/index.tsx'), 'utf8')
    expect(src).toMatch(/newlyLinkedIds\(storeRef\.current\.groceries, name, res\.linkedItemIds\)/)
    expect(src).toMatch(/unlinkPatches\(groceries, name, linked\)/)
  })
})
