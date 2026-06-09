import { describe, it, expect } from 'vitest'
import {
  groceryMatches,
  GROCERY_MATCH_MIN_CHARS,
  OTHERS_GROUP_ID,
  type GroceryItem,
} from '../../core/src/data/groceries'

/**
 * Add-Item autocomplete matcher. Powers the Shopping compose sheet's
 * tappable suggestion list: as the user types, known items (current +
 * past) whose LABEL contains the query surface so a repeat add is one
 * tap (re-applying the saved dept + stores, no AI). Matching is
 * label-only; the store rides along for display/apply context.
 */

let idc = 0
function mk(over: Partial<GroceryItem> & { text: string }): GroceryItem {
  return {
    id: `g${idc++}`,
    text: over.text,
    groupId: over.groupId ?? OTHERS_GROUP_ID,
    stores: over.stores ?? [],
    checked: over.checked ?? false,
    addedAt: over.addedAt ?? 0,
    ...over,
  }
}

describe('groceryMatches', () => {
  it('returns nothing below the min-char threshold', () => {
    const items = [mk({ text: 'Milk' })]
    expect(GROCERY_MATCH_MIN_CHARS).toBe(2)
    expect(groceryMatches('m', items)).toEqual([])
    expect(groceryMatches('', items)).toEqual([])
    expect(groceryMatches('   ', items)).toEqual([]) // whitespace trims to empty
  })

  it('matches on a substring of the label, not just a prefix', () => {
    const items = [mk({ text: 'Oat milk' })]
    const r = groceryMatches('milk', items)
    expect(r.map((m) => m.label)).toEqual(['Oat milk'])
  })

  it('is case-insensitive on both query and label', () => {
    const items = [mk({ text: 'BANANAS' })]
    expect(groceryMatches('ban', items)[0].label).toBe('BANANAS')
  })

  it('matches the label only — never the store name', () => {
    // "Costco" is a store, not a label; querying it must not surface Eggs.
    const items = [mk({ text: 'Eggs', stores: ['Costco'] })]
    expect(groceryMatches('costco', items)).toEqual([])
  })

  it('shows the store(s) for context even though they are not matched on', () => {
    const items = [mk({ text: 'Eggs', stores: ['Costco', "Trader Joe's"] })]
    const r = groceryMatches('egg', items)
    expect(r[0].stores.sort()).toEqual(['Costco', "Trader Joe's"])
  })

  it('dedupes by label and unions the stores across duplicate entries', () => {
    const items = [
      mk({ text: 'Apples', stores: ['Costco'], checked: true }),
      mk({ text: 'apples', stores: ["Trader Joe's"], checked: false }),
    ]
    const r = groceryMatches('app', items)
    expect(r).toHaveLength(1)
    expect(r[0].stores.sort()).toEqual(['Costco', "Trader Joe's"])
  })

  it('flags onList=true when an unchecked (active) item with that label exists', () => {
    const items = [mk({ text: 'Spinach', checked: false })]
    expect(groceryMatches('spin', items)[0].onList).toBe(true)
  })

  it('flags onList=false when only checked/past entries exist (re-addable)', () => {
    const items = [mk({ text: 'Spinach', checked: true })]
    expect(groceryMatches('spin', items)[0].onList).toBe(false)
  })

  it('onList=true if ANY duplicate is unchecked, even when others are checked', () => {
    const items = [
      mk({ text: 'Carrots', checked: true }),
      mk({ text: 'Carrots', checked: false }),
    ]
    expect(groceryMatches('carr', items)[0].onList).toBe(true)
  })

  it('prefers a real department over Uncategorized when entries disagree', () => {
    const items = [
      mk({ text: 'Yogurt', groupId: OTHERS_GROUP_ID }),
      mk({ text: 'Yogurt', groupId: 'dairy' }),
    ]
    expect(groceryMatches('yog', items)[0].groupId).toBe('dairy')
  })

  it('sorts prefix matches ahead of mid-string matches, then alphabetically', () => {
    const items = [
      mk({ text: 'Frozen berries' }), // contains "ro" mid-string
      mk({ text: 'Carrots' }), // contains "ro" mid-string
      mk({ text: 'Rolls' }), // prefix "ro"
    ]
    const labels = groceryMatches('ro', items).map((m) => m.label)
    expect(labels[0]).toBe('Rolls') // prefix wins
    expect(labels.slice(1)).toEqual(['Carrots', 'Frozen berries']) // alpha
  })

  it('caps the result count at the limit', () => {
    const items = Array.from({ length: 10 }, (_, i) => mk({ text: `Apple ${i}` }))
    expect(groceryMatches('apple', items)).toHaveLength(6) // default limit
    expect(groceryMatches('apple', items, 3)).toHaveLength(3)
  })

  it('skips items with an empty/whitespace-only label', () => {
    const items = [mk({ text: '   ' }), mk({ text: 'Milk' })]
    expect(groceryMatches('mi', items).map((m) => m.label)).toEqual(['Milk'])
  })
})
