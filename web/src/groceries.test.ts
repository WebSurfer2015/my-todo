/**
 * Tests for core/src/groceries.ts — item factory, store normalization,
 * read-time migration, mutation helpers, dept inference, frequent
 * picks. Covers the multi-store data model migration since that's
 * the highest-risk recent change.
 */
import { describe, expect, it } from 'vitest'
import {
  newGroceryItem,
  newGroceryGroup,
  migrateGroceries,
  migrateGroceryGroups,
  resolveGroup,
  deriveStores,
  groceryToggleChecked,
  shoppingBucketPebbleDelta,
  groceryEdit,
  groceryDelete,
  inferGroceryGroupLocal,
  frequentGroceries,
  normalizeGroceryText,
  groceryGroupAdd,
  insertGroupBeforeOthers,
  addStoreToList,
  renameStoreInList,
  renameStoreInItems,
  removeStoreFromItems,
  linkStoreToItems,
  SEED_GROCERY_GROUPS,
  OTHERS_GROUP_ID,
  MAX_GROCERY_TEXT_LEN,
  MAX_GROCERY_STORE_LEN,
  MAX_GROCERY_GROUPS,
  type GroceryItem,
  type GroceryGroup,
} from '../../core/src/data/groceries'

describe('newGroceryItem', () => {
  it('creates an item with text + default OTHERS group + no stores', () => {
    const item = newGroceryItem({ text: 'Milk' })
    expect(item.text).toBe('Milk')
    expect(item.groupId).toBe(OTHERS_GROUP_ID)
    expect(item.stores).toEqual([])
    expect(item.checked).toBe(false)
    expect(typeof item.id).toBe('string')
    expect(item.id.length).toBeGreaterThan(0)
    expect(typeof item.addedAt).toBe('number')
  })
  it('caps text at MAX_GROCERY_TEXT_LEN', () => {
    const item = newGroceryItem({ text: 'x'.repeat(500) })
    expect(item.text.length).toBe(MAX_GROCERY_TEXT_LEN)
  })
  it('normalizes the stores array (trim + dedupe case-insensitive)', () => {
    const item = newGroceryItem({
      text: 'Milk',
      stores: ['Costco', '  Costco ', 'costco', 'CVS'],
    })
    expect(item.stores).toEqual(['Costco', 'CVS'])
  })
  it('rejects non-string store entries', () => {
    const item = newGroceryItem({
      text: 'Milk',
      stores: ['CVS', 42 as unknown as string, '', null as unknown as string],
    })
    expect(item.stores).toEqual(['CVS'])
  })
})

describe('newGroceryGroup', () => {
  it('caps label length and assigns a uuid', () => {
    const g = newGroceryGroup('Spices and Herbs')
    expect(g.label).toBe('Spices and Herbs')
    expect(g.id.length).toBeGreaterThan(0)
  })
})

describe('migrateGroceries', () => {
  it('returns [] for non-array input', () => {
    expect(migrateGroceries(null)).toEqual([])
    expect(migrateGroceries('hello')).toEqual([])
    expect(migrateGroceries({})).toEqual([])
  })
  it('drops items without id / text / groupId', () => {
    const out = migrateGroceries([
      { id: 'a', text: 'Milk', groupId: 'dairy' },
      { id: '', text: 'Bad', groupId: 'x' },
      { text: 'No id', groupId: 'x' },
      { id: 'b', text: '', groupId: 'x' },
      { id: 'c', text: 'No group' },
    ])
    expect(out.length).toBe(1)
    expect(out[0].id).toBe('a')
  })
  it('dedupes by id', () => {
    const out = migrateGroceries([
      { id: 'a', text: 'Milk', groupId: 'x' },
      { id: 'a', text: 'Milk2', groupId: 'x' },
    ])
    expect(out.length).toBe(1)
    expect(out[0].text).toBe('Milk')
  })
  it('promotes legacy single store field to stores[]', () => {
    const out = migrateGroceries([
      { id: 'a', text: 'Milk', groupId: 'x', store: 'Costco' },
    ])
    expect(out[0].stores).toEqual(['Costco'])
  })
  it('preserves new stores[] over legacy store field', () => {
    const out = migrateGroceries([
      { id: 'a', text: 'Milk', groupId: 'x', stores: ['CVS', 'Target'], store: 'Old' },
    ])
    expect(out[0].stores).toEqual(['CVS', 'Target'])
  })
  it('caps purchase log size and sorts descending', () => {
    const ps = Array.from({ length: 50 }, (_, i) => 1000 + i)
    const out = migrateGroceries([
      { id: 'a', text: 'Milk', groupId: 'x', purchases: ps },
    ])
    expect(out[0].purchases?.length).toBe(30)
    expect(out[0].purchases?.[0]).toBeGreaterThan(out[0].purchases![1])
  })
  it('seeds purchases from checkedAt when log is missing', () => {
    const out = migrateGroceries([
      { id: 'a', text: 'Milk', groupId: 'x', checkedAt: 12345 },
    ])
    expect(out[0].purchases).toEqual([12345])
  })
})

describe('migrateGroceryGroups', () => {
  it('returns SEED_GROCERY_GROUPS for non-array input', () => {
    expect(migrateGroceryGroups(null)).toEqual(SEED_GROCERY_GROUPS)
  })
  it('guarantees OTHERS group exists at the end', () => {
    const out = migrateGroceryGroups([{ id: 'produce', label: 'Produce' }])
    expect(out[out.length - 1].id).toBe(OTHERS_GROUP_ID)
  })
  it('does not duplicate OTHERS when input already has it', () => {
    const out = migrateGroceryGroups([
      { id: OTHERS_GROUP_ID, label: 'Other' },
      { id: 'produce', label: 'Produce' },
    ])
    const othersCount = out.filter((g) => g.id === OTHERS_GROUP_ID).length
    expect(othersCount).toBe(1)
  })
})

describe('resolveGroup', () => {
  it('returns the matching group when found', () => {
    const g = resolveGroup('dairy', [{ id: 'dairy', label: 'Dairy' }])
    expect(g.id).toBe('dairy')
  })
  it('falls back to OTHERS when id missing but OTHERS present', () => {
    const g = resolveGroup('missing', [{ id: OTHERS_GROUP_ID, label: 'Other' }])
    expect(g.id).toBe(OTHERS_GROUP_ID)
  })
  it('falls back to the last seed group when nothing matches', () => {
    const g = resolveGroup('missing', [])
    expect(g.id).toBe(
      SEED_GROCERY_GROUPS[SEED_GROCERY_GROUPS.length - 1].id,
    )
  })
})

describe('deriveStores', () => {
  it('returns sorted-by-recency unique stores from item lists', () => {
    const items: GroceryItem[] = [
      { id: '1', text: 'A', groupId: 'x', stores: ['Costco'], checked: false, addedAt: 1000 },
      { id: '2', text: 'B', groupId: 'x', stores: ['CVS', 'Costco'], checked: false, addedAt: 2000 },
      { id: '3', text: 'C', groupId: 'x', stores: ['Target'], checked: false, addedAt: 500 },
    ]
    // Costco was inserted first (item 1) and ties with CVS at 2000ms;
    // stable sort preserves insertion order on ties.
    expect(deriveStores(items)).toEqual(['Costco', 'CVS', 'Target'])
  })
  it('uses checkedAt as recency when available', () => {
    const items: GroceryItem[] = [
      {
        id: '1', text: 'A', groupId: 'x', stores: ['Old'],
        checked: true, addedAt: 1, checkedAt: 5000,
      },
      {
        id: '2', text: 'B', groupId: 'x', stores: ['Newer'],
        checked: false, addedAt: 2000,
      },
    ]
    expect(deriveStores(items)).toEqual(['Old', 'Newer'])
  })
  it('ignores items with no stores', () => {
    const items: GroceryItem[] = [
      { id: '1', text: 'A', groupId: 'x', stores: [], checked: false, addedAt: 1 },
    ]
    expect(deriveStores(items)).toEqual([])
  })
})

describe('groceryToggleChecked', () => {
  it('flips an unchecked item to checked, sets checkedAt, prepends to purchases', () => {
    const items: GroceryItem[] = [
      { id: 'a', text: 'Milk', groupId: 'x', stores: [], checked: false, addedAt: 100 },
    ]
    const out = groceryToggleChecked(items, 'a')
    expect(out[0].checked).toBe(true)
    expect(out[0].checkedAt).toBeGreaterThan(0)
    expect(out[0].purchases?.length).toBe(1)
  })
  it('re-adds (uncheck) clears checkedAt, bumps addedAt, preserves purchases', () => {
    const past = 1000
    const items: GroceryItem[] = [
      {
        id: 'a', text: 'Milk', groupId: 'x', stores: [], checked: true,
        addedAt: 1, checkedAt: past, purchases: [past, past - 10],
      },
    ]
    const out = groceryToggleChecked(items, 'a')
    expect(out[0].checked).toBe(false)
    expect(out[0].checkedAt).toBeUndefined()
    expect(out[0].addedAt).toBeGreaterThan(past)
    expect(out[0].purchases).toEqual([past, past - 10])
  })
  it('is immutable (returns a new array, preserves original)', () => {
    const items: GroceryItem[] = [
      { id: 'a', text: 'Milk', groupId: 'x', stores: [], checked: false, addedAt: 1 },
    ]
    const out = groceryToggleChecked(items, 'a')
    expect(out).not.toBe(items)
    expect(items[0].checked).toBe(false)
  })
})

describe('shoppingBucketPebbleDelta', () => {
  // Test fixtures: 3 items at Stop & Shop in Dairy, 2 items at Stop & Shop
  // in Produce, 1 item at Costco in Dairy. All start unchecked.
  function fixture(): GroceryItem[] {
    return [
      { id: '1', text: 'Milk',  groupId: 'dairy',   stores: ['Stop'], checked: false, addedAt: 1 },
      { id: '2', text: 'Cheese',groupId: 'dairy',   stores: ['Stop'], checked: false, addedAt: 1 },
      { id: '3', text: 'Yogurt',groupId: 'dairy',   stores: ['Stop'], checked: false, addedAt: 1 },
      { id: '4', text: 'Apples',groupId: 'produce', stores: ['Stop'], checked: false, addedAt: 1 },
      { id: '5', text: 'Kale',  groupId: 'produce', stores: ['Stop'], checked: false, addedAt: 1 },
      { id: '6', text: 'Cream', groupId: 'dairy',   stores: ['Costco'], checked: false, addedAt: 1 },
    ]
  }
  it('returns 0 when checking off a non-last item in a bucket', () => {
    const before = fixture()
    const after = groceryToggleChecked(before, '1') // Milk done; 2 Stop+Dairy still open
    expect(shoppingBucketPebbleDelta(before, after, '1')).toBe(0)
  })
  it('returns +1 when the toggle completes a (store × dept) bucket', () => {
    // Check off Milk + Cheese first, then check off Yogurt — that
    // final toggle should fire the pebble.
    let items = groceryToggleChecked(fixture(), '1')
    items = groceryToggleChecked(items, '2')
    const before = items
    const after = groceryToggleChecked(items, '3')
    expect(shoppingBucketPebbleDelta(before, after, '3')).toBe(1)
  })
  it('returns +1 when an item belongs to one bucket that just completed (multi-store unrelated)', () => {
    // Cream is the only Costco+Dairy item. Checking it off completes
    // that bucket independently of Stop & Shop progress.
    const before = fixture()
    const after = groceryToggleChecked(before, '6')
    expect(shoppingBucketPebbleDelta(before, after, '6')).toBe(1)
  })
  it('returns -1 when un-checking the only remaining done item in a complete bucket', () => {
    // Complete Costco+Dairy by checking item 6, then re-add it.
    const completed = groceryToggleChecked(fixture(), '6')
    const reopened = groceryToggleChecked(completed, '6')
    expect(shoppingBucketPebbleDelta(completed, reopened, '6')).toBe(-1)
  })
  it('returns +2 when one toggle completes two buckets via multi-store', () => {
    // Item assigned to both Stop and Costco in a brand-new "snacks"
    // dept. If both stores have only this one snacks item, completing
    // it should fire two bucket pebbles (one per store).
    const before: GroceryItem[] = [
      { id: 'x', text: 'Chips', groupId: 'snacks', stores: ['Stop', 'Costco'], checked: false, addedAt: 1 },
    ]
    const after = groceryToggleChecked(before, 'x')
    expect(shoppingBucketPebbleDelta(before, after, 'x')).toBe(2)
  })
  it('returns 0 for an orphaned item (no stores)', () => {
    const before: GroceryItem[] = [
      { id: 'o', text: 'Mystery', groupId: 'other', stores: [], checked: false, addedAt: 1 },
    ]
    const after = groceryToggleChecked(before, 'o')
    expect(shoppingBucketPebbleDelta(before, after, 'o')).toBe(0)
  })
})

describe('groceryEdit', () => {
  const base: GroceryItem = {
    id: 'a', text: 'Milk', groupId: 'x', stores: ['CVS'], checked: false, addedAt: 1,
  }
  it('applies text patch with cap', () => {
    const out = groceryEdit([base], 'a', { text: 'y'.repeat(500) })
    expect(out[0].text.length).toBe(MAX_GROCERY_TEXT_LEN)
  })
  it('applies groupId patch', () => {
    const out = groceryEdit([base], 'a', { groupId: 'dairy' })
    expect(out[0].groupId).toBe('dairy')
  })
  it('normalizes stores patch (dedupe + trim)', () => {
    const out = groceryEdit([base], 'a', {
      stores: ['Costco', ' costco ', 'TJ Maxx'],
    })
    expect(out[0].stores).toEqual(['Costco', 'TJ Maxx'])
  })
  it('empty stores patch clears all stores', () => {
    const out = groceryEdit([base], 'a', { stores: [] })
    expect(out[0].stores).toEqual([])
  })
  it('ignores other items', () => {
    const other: GroceryItem = { ...base, id: 'b', text: 'Bread' }
    const out = groceryEdit([base, other], 'a', { text: 'Almond Milk' })
    expect(out[1].text).toBe('Bread')
  })
})

describe('groceryDelete', () => {
  it('removes the matching item', () => {
    const items: GroceryItem[] = [
      { id: 'a', text: 'A', groupId: 'x', stores: [], checked: false, addedAt: 1 },
      { id: 'b', text: 'B', groupId: 'x', stores: [], checked: false, addedAt: 2 },
    ]
    expect(groceryDelete(items, 'a').map((i) => i.id)).toEqual(['b'])
  })
  it('returns the same items when id not found', () => {
    const items: GroceryItem[] = [
      { id: 'a', text: 'A', groupId: 'x', stores: [], checked: false, addedAt: 1 },
    ]
    expect(groceryDelete(items, 'missing').length).toBe(1)
  })
})

describe('inferGroceryGroupLocal', () => {
  const groups = [
    { id: 'produce', label: 'Produce' },
    { id: 'dairy', label: 'Dairy' },
    { id: 'meat', label: 'Meat' },
    { id: 'pantry', label: 'Pantry' },
    { id: 'household', label: 'Household' },
    { id: OTHERS_GROUP_ID, label: 'Misc' },
  ]
  it('returns undefined for empty text', () => {
    expect(inferGroceryGroupLocal('', groups)).toBeUndefined()
    expect(inferGroceryGroupLocal('   ', groups)).toBeUndefined()
  })
  it('returns undefined when nothing matches', () => {
    expect(inferGroceryGroupLocal('xyzzy', groups)).toBeUndefined()
  })
  it('matches a known produce keyword', () => {
    // The lookup table covers common items — apple should map to produce.
    expect(inferGroceryGroupLocal('apple', groups)).toBe('produce')
  })
  it('matches case-insensitively', () => {
    expect(inferGroceryGroupLocal('APPLE', groups)).toBe('produce')
  })
  it('respects groups list: returns undefined when the matched id is not configured', () => {
    expect(
      inferGroceryGroupLocal('apple', [{ id: OTHERS_GROUP_ID, label: 'Misc' }]),
    ).toBeUndefined()
  })
})

describe('frequentGroceries', () => {
  const NOW = 10_000_000
  it('returns items meeting minCount inside the window, sorted by count desc', () => {
    const items: GroceryItem[] = [
      {
        id: 'a', text: 'Eggs', groupId: 'x', stores: [], checked: false, addedAt: 1,
        purchases: [NOW - 1000, NOW - 2000, NOW - 3000, NOW - 4000, NOW - 5000, NOW - 6000],
      },
      {
        id: 'b', text: 'Milk', groupId: 'x', stores: [], checked: false, addedAt: 1,
        purchases: [NOW - 1000, NOW - 2000, NOW - 3000, NOW - 4000, NOW - 5000],
      },
      {
        id: 'c', text: 'Rarely', groupId: 'x', stores: [], checked: false, addedAt: 1,
        purchases: [NOW - 1000],
      },
    ]
    const out = frequentGroceries(items, { now: NOW })
    expect(out.map((x) => x.id)).toEqual(['a', 'b'])
  })
  it('excludes purchases outside the time window', () => {
    const items: GroceryItem[] = [
      {
        id: 'a', text: 'Stale', groupId: 'x', stores: [], checked: false, addedAt: 1,
        purchases: Array.from({ length: 10 }, (_, i) => NOW - 1e12 - i),
      },
    ]
    expect(frequentGroceries(items, { now: NOW })).toEqual([])
  })
  it('ties break by latest in-window timestamp desc', () => {
    const items: GroceryItem[] = [
      {
        id: 'older', text: 'A', groupId: 'x', stores: [], checked: false, addedAt: 1,
        purchases: [NOW - 1000, NOW - 2000, NOW - 3000, NOW - 4000, NOW - 5000],
      },
      {
        id: 'newer', text: 'B', groupId: 'x', stores: [], checked: false, addedAt: 1,
        purchases: [NOW - 100, NOW - 200, NOW - 300, NOW - 400, NOW - 500],
      },
    ]
    const out = frequentGroceries(items, { now: NOW })
    // Both have same count (5); newer's latest timestamp is more recent.
    expect(out[0].id).toBe('newer')
  })
})

// ── Group-list + store helpers (lifted from useGroceriesSlice, task #1) ──

const others: GroceryGroup = { id: OTHERS_GROUP_ID, label: 'Miscellaneous' }
const groups = (...labels: string[]): GroceryGroup[] => [
  ...labels.map((label, i) => ({ id: `g${i}`, label })),
  others,
]
const storeItem = (
  id: string,
  stores: string[],
  groupId = 'produce',
): GroceryItem => ({
  id,
  text: id,
  groupId,
  stores,
  checked: false,
  addedAt: 1,
})

describe('insertGroupBeforeOthers', () => {
  it('keeps the Others catch-all last', () => {
    const out = insertGroupBeforeOthers(groups('Produce'), { id: 'new', label: 'Snacks' })
    expect(out.map((g) => g.id)).toEqual(['g0', 'new', OTHERS_GROUP_ID])
  })
  it('appends even when no Others group is present', () => {
    const out = insertGroupBeforeOthers([{ id: 'g0', label: 'Produce' }], { id: 'new', label: 'Snacks' })
    expect(out.map((g) => g.id)).toEqual(['g0', 'new'])
  })
})

describe('groceryGroupAdd', () => {
  it('returns null for an empty/whitespace label', () => {
    expect(groceryGroupAdd(groups('Produce'), '   ')).toBeNull()
  })
  it('inserts a new group before Others and returns its id', () => {
    const before = groups('Produce')
    const res = groceryGroupAdd(before, 'Snacks')
    expect(res).not.toBeNull()
    expect(res!.groups).not.toBe(before) // changed → caller persists
    expect(res!.groups.map((g) => g.label)).toEqual(['Produce', 'Snacks', 'Miscellaneous'])
    const inserted = res!.groups.find((g) => g.label === 'Snacks')!
    expect(res!.id).toBe(inserted.id)
  })
  it('dedupes case-insensitively and leaves the list unchanged (same ref)', () => {
    const before = groups('Produce', 'Snacks')
    const res = groceryGroupAdd(before, 'snacks')
    expect(res).not.toBeNull()
    expect(res!.groups).toBe(before) // same ref → caller skips the write
    expect(res!.id).toBe('g1')
  })
  it('never dedupes against the reserved Others group', () => {
    const before = groups('Produce')
    const res = groceryGroupAdd(before, 'Miscellaneous')
    expect(res!.id).not.toBe(OTHERS_GROUP_ID)
    expect(res!.groups).not.toBe(before)
  })
  it('returns null once the group cap is reached', () => {
    const labels = Array.from({ length: MAX_GROCERY_GROUPS }, (_, i) => `G${i}`)
    const full = groups(...labels) // length is MAX + 1 (incl. Others)
    expect(full.length).toBeGreaterThanOrEqual(MAX_GROCERY_GROUPS)
    expect(groceryGroupAdd(full, 'OneMore')).toBeNull()
  })
})

describe('addStoreToList', () => {
  it('appends a new store', () => {
    expect(addStoreToList(['Costco'], 'CVS')).toEqual(['Costco', 'CVS'])
  })
  it('is a no-op (same ref) for an exact duplicate', () => {
    const list = ['Costco']
    expect(addStoreToList(list, 'Costco')).toBe(list)
  })
})

describe('renameStoreInList', () => {
  it('renames while preserving order', () => {
    expect(renameStoreInList(['A', 'B', 'C'], 'B', 'Z')).toEqual(['A', 'Z', 'C'])
  })
  it('dedupes when the rename collides with an existing entry', () => {
    expect(renameStoreInList(['A', 'B', 'C'], 'C', 'A')).toEqual(['A', 'B'])
  })
})

describe('renameStoreInItems', () => {
  it('renames the store in every referencing item and dedupes', () => {
    const items = [
      storeItem('1', ['Costco', 'CVS']),
      storeItem('2', ['CVS']),
      storeItem('3', ['Costco', 'Stop & Shop']),
    ]
    const out = renameStoreInItems(items, 'Costco', 'CVS')
    expect(out[0].stores).toEqual(['CVS']) // collapsed dupe
    expect(out[1]).toBe(items[1]) // untouched → same ref
    expect(out[2].stores).toEqual(['CVS', 'Stop & Shop'])
  })
})

describe('removeStoreFromItems', () => {
  it('strips the store and leaves non-referencing items untouched', () => {
    const items = [storeItem('1', ['Costco', 'CVS']), storeItem('2', ['Stop & Shop'])]
    const out = removeStoreFromItems(items, 'Costco')
    expect(out[0].stores).toEqual(['CVS'])
    expect(out[1]).toBe(items[1])
  })
})

describe('linkStoreToItems', () => {
  it('is a no-op (same ref) for an empty id list', () => {
    const items = [storeItem('1', [])]
    expect(linkStoreToItems(items, 'Costco', [])).toBe(items)
  })
  it('adds the store only to targeted items lacking it', () => {
    const items = [storeItem('1', []), storeItem('2', ['Costco']), storeItem('3', [])]
    const out = linkStoreToItems(items, 'Costco', ['1', '2'])
    expect(out[0].stores).toEqual(['Costco'])
    expect(out[1]).toBe(items[1]) // already had it → same ref
    expect(out[2]).toBe(items[2]) // not targeted → same ref
  })
})

describe('normalizeGroceryText', () => {
  it('strips a leading shopping verb, case-insensitively, preserving the rest', () => {
    expect(normalizeGroceryText('Buy Milk')).toBe('Milk')
    expect(normalizeGroceryText('buy milk')).toBe('milk')
    expect(normalizeGroceryText('  GET eggs ')).toBe('eggs')
    expect(normalizeGroceryText('pick up some bread')).toBe('bread')
    expect(normalizeGroceryText('pickup paper towels')).toBe('paper towels')
    expect(normalizeGroceryText('get more bananas')).toBe('bananas')
    expect(normalizeGroceryText('need a lemon')).toBe('lemon')
  })
  it('leaves a plain item untouched', () => {
    expect(normalizeGroceryText('milk')).toBe('milk')
    expect(normalizeGroceryText('almond butter')).toBe('almond butter')
  })
  it('never returns empty (verb-only falls back to the input)', () => {
    expect(normalizeGroceryText('buy')).toBe('buy')
    expect(normalizeGroceryText('  ')).toBe('')
  })
  it('only strips a verb at the START, not mid-text', () => {
    expect(normalizeGroceryText('things to buy milk')).toBe('things to buy milk')
  })
})
