/**
 * Golden-fixture tests for the schema migrators. A bad migrator corrupts
 * EVERY user's data on the next version bump / read, so these pin the
 * load-bearing behaviors: legacy-shape promotion, dedup, hardening caps,
 * seed-on-garbage, and garbage-in → safe-default. Pure functions, run
 * under web's vitest.
 */
import { describe, it, expect } from 'vitest'
import {
  migrateGroceries,
  migrateGroceryGroups,
  SEED_GROCERY_GROUPS,
  OTHERS_GROUP_ID,
} from '../../core/src/data/groceries'
import { migrateCategories } from '../../core/src/data/categories'
import { migrateProfile, SEED_PROFILE } from '../../core/src/data/profile'
import { migrateTodoReferences } from '../../core/src/logic/derive'

// migrateProfile returns SEED_PROFILE unless name + avatar are valid, so
// build groceryStores fixtures on a known-valid base.
const validBase = { name: 'Tester', avatar: SEED_PROFILE.avatar }

describe('migrateGroceries', () => {
  it('promotes legacy `store: string` to the new `stores: string[]` shape', () => {
    const [item] = migrateGroceries([
      { id: 'g1', text: 'Milk', groupId: 'dairy', store: 'Costco' },
    ])
    expect(item.stores).toContain('Costco')
    expect(Array.isArray(item.stores)).toBe(true)
  })
  it('drops rows missing id/text/groupId and dedups by id', () => {
    const out = migrateGroceries([
      { id: 'g1', text: 'Milk', groupId: 'dairy' },
      { id: 'g1', text: 'dupe', groupId: 'dairy' }, // dup id → dropped
      { id: 'g2', text: '', groupId: 'dairy' }, // empty text → dropped
      { text: 'no id', groupId: 'dairy' }, // no id → dropped
      'garbage',
      null,
    ])
    expect(out.map((i) => i.id)).toEqual(['g1'])
  })
  it('coerces checked to a strict boolean', () => {
    const [a, b] = migrateGroceries([
      { id: 'a', text: 'x', groupId: 'g', checked: 'yes' },
      { id: 'b', text: 'y', groupId: 'g', checked: true },
    ])
    expect(a.checked).toBe(false) // non-true → false
    expect(b.checked).toBe(true)
  })
  it('returns [] for non-array input', () => {
    expect(migrateGroceries(null)).toEqual([])
    expect(migrateGroceries({})).toEqual([])
  })
})

describe('migrateGroceryGroups', () => {
  it('SEEDS default groups on non-array input (not [])', () => {
    expect(migrateGroceryGroups(undefined)).toEqual(SEED_GROCERY_GROUPS)
  })
  it('drops id-less / label-less / dup entries and always appends the catch-all last', () => {
    const out = migrateGroceryGroups([
      { id: 'produce', label: 'Produce' },
      { id: 'produce', label: 'dup' }, // dup → dropped
      { id: 'x' }, // no label → dropped
      { label: 'no id' }, // no id → dropped
    ])
    expect(out.map((g) => g.id)).toEqual(['produce', OTHERS_GROUP_ID])
  })
  it('upgrades a legacy "Others"/"Uncategorized" catch-all label to "Miscellaneous"', () => {
    const out = migrateGroceryGroups([{ id: OTHERS_GROUP_ID, label: 'Others' }])
    const others = out.find((g) => g.id === OTHERS_GROUP_ID)
    expect(others?.label).toBe('Miscellaneous')
  })
})

describe('migrateCategories', () => {
  it('returns [] for non-array input', () => {
    expect(migrateCategories(null)).toEqual([])
  })
  it('drops non-objects / id-less entries and dedups by id', () => {
    const out = migrateCategories([
      { id: 'home', color: '#34C759', icon: 'home' },
      { id: 'home', color: '#000', icon: 'x' }, // dup → dropped
      { color: '#fff', icon: 'y' }, // no id → dropped
      'garbage',
      null,
    ])
    expect(out.map((c) => c.id)).toEqual(['home'])
  })
})

describe('migrateTodoReferences', () => {
  it('dedups by lowercased text and drops empties', () => {
    const out = migrateTodoReferences([
      { text: 'Buy milk' },
      { text: 'buy milk' }, // case-dup → dropped
      { text: '   ' }, // blank → dropped
      { notText: 1 }, // no text → dropped
    ])
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe('Buy milk')
    expect(out[0].textLower).toBe('buy milk')
  })
  it('nulls out an invalid priority', () => {
    const [r] = migrateTodoReferences([{ text: 'x', priority: 'urgent' }])
    expect(r.priority).toBeUndefined()
  })
})

describe('migrateProfile', () => {
  it('returns SEED_PROFILE (valid) for garbage / shapeless input', () => {
    expect(migrateProfile(null)).toBe(SEED_PROFILE)
    expect(migrateProfile([])).toBe(SEED_PROFILE)
    expect(migrateProfile({ groceryStores: ['x'] })).toBe(SEED_PROFILE) // no name/avatar
  })
  it('caps the name length', () => {
    const p = migrateProfile({ ...validBase, name: 'x'.repeat(500) })
    expect(p.name.length).toBeLessThan(500)
  })
  // groceryStores migration is exercised THROUGH migrateProfile (the
  // migrateGroceryStores helper is module-private in profile.ts).
  it('collapses an empty groceryStores array to undefined (re-seeds on read)', () => {
    const p = migrateProfile({ ...validBase, groceryStores: [] })
    expect(p.groceryStores).toBeUndefined()
  })
  it('trims + dedups a real groceryStores list', () => {
    const p = migrateProfile({
      ...validBase,
      groceryStores: ['  Costco  ', 'Costco', 'CVS'],
    })
    expect(p.groceryStores).toEqual(['Costco', 'CVS'])
  })
})
