/**
 * Grocery list — second top-level data type alongside `Todo`, with its
 * own lifecycle:
 *
 * - Items are grouped by department (Produce, Meat & Seafood, etc.).
 * - Checking an item moves it to a derived "Future" bucket (not deleted,
 *   not in any group). The user can re-add it later from Future and it
 *   bounces back to its original group.
 * - Items are NEVER auto-purged. Permanent deletion is manual-only.
 * - Items carry an optional `store` (typed by the user — "Costco",
 *   "Trader Joe's", "Safeway"). The view filters by active store.
 *
 * Groups are user-configurable (rename, reorder, hide) except for a
 * reserved "Others" catch-all group that always exists and can't be
 * deleted — it's where items land when an item's group is removed or
 * unrecognized.
 *
 * The "Future" bucket is derived (checked items), not a stored group.
 */
import { genUuid } from '../logic/utils'

export interface GroceryItem {
  /** Stable UUID, like Todo.id. */
  id: string
  text: string
  /** FK to GroceryGroup.id. Falls back to OTHERS_GROUP_ID on read if
   * the group has been deleted. */
  groupId: string
  /** List of stores the item is available at ("Costco", "Trader Joe's",
   * etc.). Empty array = not linked to any store; the item appears in
   * the All view and is invisible under any specific store filter.
   * When a store filter is active, the item shows in EACH matching
   * store's filtered view, grouped by its department. */
  stores: string[]
  /** True once the user has checked the item off. Checked items live
   * in the derived "Future" bucket. */
  checked: boolean
  /** ms timestamp — sets sort order within a group (newest first). */
  addedAt: number
  /** ms timestamp set when `checked` flips true. Cleared on re-add. */
  checkedAt?: number
  /** Rolling log of check-off timestamps (newest first), capped at
   * MAX_GROCERY_PURCHASES. Survives re-add. Drives the "Often picked
   * up" section, which surfaces items above FREQUENT_GROCERY_MIN_COUNT
   * within FREQUENT_GROCERY_WINDOW_MS. Optional for back-compat. */
  purchases?: number[]
}

export interface GroceryGroup {
  /** Stable id; required for cross-device sync. Built-in groups use
   * fixed string ids (see SEED_GROCERY_GROUPS); custom groups use UUIDs. */
  id: string
  /** Display label. User-editable. */
  label: string
  /** When true, group is hidden from the grocery view (items still
   * exist, just not visible). The OTHERS_GROUP can't be hidden. */
  hidden?: boolean
  /** Optional hex color. When set, overrides the per-id default in the
   * GroceryIcon renderer. Custom user-added departments use this so
   * they don't all share the fallback sage tone. */
  color?: string
  /** Optional icon key (one of GROCERY_DEPT_ICONS in the mobile
   * registry). When set, overrides the per-id default. */
  icon?: string
}

/** The catch-all group id — always exists, always last, never deletable
 * or hideable. Items with an unknown groupId fall back to this. */
export const OTHERS_GROUP_ID = 'others'

export const SEED_GROCERY_GROUPS: GroceryGroup[] = [
  { id: 'produce',   label: 'Produce' },
  { id: 'meat',      label: 'Meat & Seafood' },
  { id: 'dairy',     label: 'Dairy & Eggs' },
  { id: 'bakery',    label: 'Bread & Bakery' },
  { id: 'frozen',    label: 'Frozen' },
  { id: 'pantry',    label: 'Pantry' },
  { id: 'beverages', label: 'Beverages' },
  { id: 'household', label: 'Household' },
  { id: OTHERS_GROUP_ID, label: 'Miscellaneous' },
]

/** Seeded stores shown to new users so the STORES list isn't empty on
 * first open. Users can delete any of them and the explicit empty
 * state will then stick. Used as the fallback when
 * profile.groceryStores is undefined (never touched). */
export const SEED_GROCERY_STORES: string[] = [
  'Stop & Shop',
  'Costco',
  'CVS',
  'Trader Joe\'s',
]

// ── Hard caps (defense against malicious cloud writes) ──────────────
export const MAX_GROCERY_TEXT_LEN = 200
export const MAX_GROCERY_STORE_LEN = 64
export const MAX_GROCERY_GROUP_LABEL_LEN = 40
export const MAX_GROCERY_GROUP_ID_LEN = 64
export const MAX_GROCERY_ITEMS = 2000
export const MAX_GROCERY_GROUPS = 30
/** Cap on the per-item purchase log. ~30 entries handles ~5/mo for 6mo
 * with headroom. 30 × 8 bytes ≈ 240B per item, negligible vs the 200-
 * char text field that dominates row size. */
export const MAX_GROCERY_PURCHASES = 30
/** Threshold for "Often picked up" — items with ≥5 check-offs within
 * the window qualify. Mirrors the user's stated 5+ / 6mo rule. */
export const FREQUENT_GROCERY_MIN_COUNT = 5
/** ~6-month window for frequency counting. Treated as 6×30 days so the
 * value is timezone- and DST-agnostic; users won't notice the small
 * drift from real calendar months. */
export const FREQUENT_GROCERY_WINDOW_MS = 6 * 30 * 24 * 60 * 60 * 1000

// ── Constructors ────────────────────────────────────────────────────

export function newGroceryItem(args: {
  text: string
  groupId?: string
  /** Initial stores list. Pass an empty array (or omit) when the item
   * isn't tied to any specific store yet. */
  stores?: string[]
}): GroceryItem {
  return {
    id: genUuid(),
    text: args.text.slice(0, MAX_GROCERY_TEXT_LEN),
    groupId: args.groupId?.slice(0, MAX_GROCERY_GROUP_ID_LEN) || OTHERS_GROUP_ID,
    stores: normalizeStores(args.stores),
    checked: false,
    addedAt: Date.now(),
  }
}

/** Trim + cap + dedupe a stores list. Used by newGroceryItem and the
 * read-time migrator so the rest of the codebase can assume the array
 * is well-formed. */
function normalizeStores(input: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of input) {
    if (typeof s !== 'string') continue
    const trimmed = s.trim().slice(0, MAX_GROCERY_STORE_LEN)
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

export function newGroceryGroup(label: string): GroceryGroup {
  return {
    id: genUuid(),
    label: label.slice(0, MAX_GROCERY_GROUP_LABEL_LEN),
  }
}

// ── Migrations ──────────────────────────────────────────────────────

/**
 * Read-time migrator for a stored groceries list. Drops anything that
 * doesn't shape-check, caps strings, dedupes by id, caps the total
 * count. On any structural failure returns [] — better empty than
 * malformed.
 */
export function migrateGroceries(raw: unknown): GroceryItem[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: GroceryItem[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    if (typeof o.id !== 'string' || o.id.length === 0) continue
    if (typeof o.text !== 'string' || o.text.length === 0) continue
    if (typeof o.groupId !== 'string' || o.groupId.length === 0) continue
    if (seen.has(o.id)) continue
    seen.add(o.id)
    // Migration: legacy items carried `store: string`. Promote to the
    // new `stores: string[]` shape on read — single value becomes a
    // one-element array; existing arrays come through normalized.
    const legacyStore = typeof o.store === 'string' && o.store.length > 0
      ? [o.store]
      : []
    const rawStores = Array.isArray(o.stores) ? o.stores : legacyStore
    const item: GroceryItem = {
      id: o.id.slice(0, 64),
      text: o.text.slice(0, MAX_GROCERY_TEXT_LEN),
      groupId: o.groupId.slice(0, MAX_GROCERY_GROUP_ID_LEN),
      stores: normalizeStores(rawStores),
      checked: o.checked === true,
      addedAt:
        typeof o.addedAt === 'number' && o.addedAt > 0
          ? Math.floor(o.addedAt)
          : Date.now(),
    }
    if (typeof o.checkedAt === 'number' && o.checkedAt > 0) {
      item.checkedAt = Math.floor(o.checkedAt)
    }
    if (Array.isArray(o.purchases)) {
      const ps: number[] = []
      for (const p of o.purchases) {
        if (typeof p === 'number' && p > 0) ps.push(Math.floor(p))
      }
      ps.sort((a, b) => b - a)
      if (ps.length > 0) item.purchases = ps.slice(0, MAX_GROCERY_PURCHASES)
    } else if (typeof o.checkedAt === 'number' && o.checkedAt > 0) {
      // Legacy item with no purchase log — seed from the one checkedAt
      // we have so the user keeps a single data point of history.
      item.purchases = [Math.floor(o.checkedAt)]
    }
    out.push(item)
    if (out.length >= MAX_GROCERY_ITEMS) break
  }
  return out
}

/**
 * Read-time migrator for the stored grocery groups config. Always
 * guarantees the OTHERS catch-all group exists at the end. Drops
 * duplicates, caps strings, caps count.
 */
export function migrateGroceryGroups(raw: unknown): GroceryGroup[] {
  if (!Array.isArray(raw)) return [...SEED_GROCERY_GROUPS]
  const seen = new Set<string>()
  const out: GroceryGroup[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    if (typeof o.id !== 'string' || o.id.length === 0) continue
    if (typeof o.label !== 'string' || o.label.length === 0) continue
    if (seen.has(o.id)) continue
    seen.add(o.id)
    const group: GroceryGroup = {
      id: o.id.slice(0, MAX_GROCERY_GROUP_ID_LEN),
      label: o.label.slice(0, MAX_GROCERY_GROUP_LABEL_LEN),
    }
    if (o.hidden === true && o.id !== OTHERS_GROUP_ID) {
      group.hidden = true
    }
    if (typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color)) {
      group.color = o.color
    }
    if (typeof o.icon === 'string' && o.icon.length > 0 && o.icon.length <= 32) {
      group.icon = o.icon
    }
    out.push(group)
    if (out.length >= MAX_GROCERY_GROUPS) break
  }
  // Guarantee the reserved catch-all exists, and that it sits last.
  // Upgrade legacy default labels ("Others", then "Uncategorized") to
  // the current "Miscellaneous" so existing users see the new name;
  // user-renamed labels are preserved untouched.
  const LEGACY_OTHERS_LABELS = new Set(['Others', 'Uncategorized'])
  const withoutOthers = out.filter((g) => g.id !== OTHERS_GROUP_ID)
  const othersFromInput = out.find((g) => g.id === OTHERS_GROUP_ID)
  const others =
    othersFromInput
      ? LEGACY_OTHERS_LABELS.has(othersFromInput.label)
        ? { ...othersFromInput, label: 'Miscellaneous' }
        : othersFromInput
      : { id: OTHERS_GROUP_ID, label: 'Miscellaneous' }
  withoutOthers.push(others)
  return withoutOthers
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Resolve an item's group, falling back to Others if the stored id is
 * no longer in the groups list. */
export function resolveGroup(
  groupId: string,
  groups: GroceryGroup[],
): GroceryGroup {
  return (
    groups.find((g) => g.id === groupId) ??
    groups.find((g) => g.id === OTHERS_GROUP_ID) ??
    SEED_GROCERY_GROUPS[SEED_GROCERY_GROUPS.length - 1]
  )
}

/** Stable list of stores the user has typed at least once, sorted by
 * most-recent-use first. Drawn from the items list (no separate stored
 * config — store names are emergent). A multi-store item bumps the
 * recency of EVERY store in its list. */
export function deriveStores(items: GroceryItem[]): string[] {
  const seen = new Map<string, number>() // store → most-recent ms
  for (const it of items) {
    if (!it.stores || it.stores.length === 0) continue
    const ts = Math.max(it.checkedAt ?? 0, it.addedAt)
    for (const s of it.stores) {
      const prev = seen.get(s) ?? 0
      if (ts > prev) seen.set(s, ts)
    }
  }
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s)
}

// ── Mutation helpers (pure) ─────────────────────────────────────────

/** Net pebble delta for a Shopping toggle. Positive when the toggle
 * COMPLETES a (store × department) bucket (every unchecked item in
 * that bucket is now done). Negative when an unchecked re-add
 * un-completes a previously-complete bucket. An item with no stores
 * (orphaned) earns nothing. An item with multiple stores can complete
 * multiple buckets in a single toggle, so the delta is summed.
 *
 * Returns the delta from `before` → `after`. Callers should pass the
 * same two arrays they pass to React state (i.e. the result of
 * groceryToggleChecked is `after`).
 */
export function shoppingBucketPebbleDelta(
  before: GroceryItem[],
  after: GroceryItem[],
  toggledId: string,
): number {
  const item = after.find((x) => x.id === toggledId)
  if (!item || item.stores.length === 0) return 0
  const dept = item.groupId
  let delta = 0
  for (const store of item.stores) {
    const beforeUnchecked = before.filter(
      (x) => x.groupId === dept && x.stores.includes(store) && !x.checked,
    ).length
    const afterUnchecked = after.filter(
      (x) => x.groupId === dept && x.stores.includes(store) && !x.checked,
    ).length
    // Bucket needs at least 1 item to be "completable". Empty buckets
    // can't earn a pebble (avoids the degenerate "no items completed
    // = a pebble" award when a user removes the last item).
    const beforeTotal = before.filter(
      (x) => x.groupId === dept && x.stores.includes(store),
    ).length
    const afterTotal = after.filter(
      (x) => x.groupId === dept && x.stores.includes(store),
    ).length
    if (beforeTotal === 0 || afterTotal === 0) continue
    // Bucket transitioned not-complete → complete: +1 pebble.
    if (beforeUnchecked > 0 && afterUnchecked === 0) delta += 1
    // Bucket transitioned complete → not-complete: refund −1.
    else if (beforeUnchecked === 0 && afterUnchecked > 0) delta -= 1
  }
  return delta
}

/** Toggle an item's checked state. Sets checkedAt on flip-to-checked,
 * clears it on re-add, and bumps addedAt on re-add so the item floats
 * to the top of its group. On check-off, prepends to `purchases` (cap
 * MAX_GROCERY_PURCHASES); re-add preserves the log. */
export function groceryToggleChecked(
  items: GroceryItem[],
  id: string,
): GroceryItem[] {
  return items.map((it) => {
    if (it.id !== id) return it
    if (it.checked) {
      // Re-add: clear checked, bump addedAt so it surfaces in its group.
      // Preserve `purchases` so frequency counting survives re-adds.
      return { ...it, checked: false, checkedAt: undefined, addedAt: Date.now() }
    }
    // Check off: move to Future + append timestamp to the purchase log.
    const now = Date.now()
    const prev = it.purchases ?? []
    const purchases = [now, ...prev].slice(0, MAX_GROCERY_PURCHASES)
    return { ...it, checked: true, checkedAt: now, purchases }
  })
}

/** Apply text/group/stores edits to a single item. Caps + normalizes
 * the stores list. Pass an empty array to clear all stores. */
export function groceryEdit(
  items: GroceryItem[],
  id: string,
  patch: { text?: string; groupId?: string; stores?: string[] },
): GroceryItem[] {
  return items.map((it) => {
    if (it.id !== id) return it
    const next: GroceryItem = { ...it }
    if (patch.text !== undefined) {
      next.text = patch.text.slice(0, MAX_GROCERY_TEXT_LEN)
    }
    if (patch.groupId !== undefined) {
      next.groupId = patch.groupId.slice(0, MAX_GROCERY_GROUP_ID_LEN)
    }
    if (patch.stores !== undefined) {
      next.stores = normalizeStores(patch.stores)
    }
    return next
  })
}

/** Permanent delete — manual-only path. */
export function groceryDelete(items: GroceryItem[], id: string): GroceryItem[] {
  return items.filter((it) => it.id !== id)
}

// ── Group-list mutation (pure) ──────────────────────────────────────

/** Insert a group just before the reserved Others catch-all so Others
 * stays last. Pure list transform. */
export function insertGroupBeforeOthers(
  groups: GroceryGroup[],
  group: GroceryGroup,
): GroceryGroup[] {
  const withoutOthers = groups.filter((g) => g.id !== OTHERS_GROUP_ID)
  const others = groups.find((g) => g.id === OTHERS_GROUP_ID)
  const out = [...withoutOthers, group]
  if (others) out.push(others)
  return out
}

/** Add a custom group from a label, enforcing dedup + the group cap.
 *
 * - Empty/whitespace label → `null` (no-op).
 * - Case-insensitive duplicate of an existing non-Others group →
 *   `{ groups: <unchanged>, id: <existing id> }` (caller skips the write).
 * - At MAX_GROCERY_GROUPS → `null` (limit reached).
 * - Otherwise creates + inserts before Others → `{ groups, id }`.
 *
 * Returning the same `groups` reference on a duplicate lets callers
 * detect "no change" with `res.groups === prev`. */
export function groceryGroupAdd(
  groups: GroceryGroup[],
  label: string,
): { groups: GroceryGroup[]; id: string } | null {
  const trimmed = label.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()
  const dupe = groups.find(
    (g) => g.id !== OTHERS_GROUP_ID && g.label.toLowerCase() === lower,
  )
  if (dupe) return { groups, id: dupe.id }
  if (groups.length >= MAX_GROCERY_GROUPS) return null
  const group = newGroceryGroup(trimmed)
  return { groups: insertGroupBeforeOthers(groups, group), id: group.id }
}

// ── Store ↔ item / store-list helpers (pure) ────────────────────────

/** Append a store name to a list if not already present (exact match),
 * preserving order. */
export function addStoreToList(list: string[], name: string): string[] {
  return list.includes(name) ? list : [...list, name]
}

/** Rename a store within a name list, preserving order and deduping any
 * collision the rename creates. */
export function renameStoreInList(
  list: string[],
  oldName: string,
  newName: string,
): string[] {
  const out: string[] = []
  for (const s of list) {
    const replaced = s === oldName ? newName : s
    if (!out.includes(replaced)) out.push(replaced)
  }
  return out
}

/** Rename a store everywhere it appears in items' `stores` arrays,
 * deduping the result. Items not referencing oldName are untouched. */
export function renameStoreInItems(
  items: GroceryItem[],
  oldName: string,
  newName: string,
): GroceryItem[] {
  return items.map((it) => {
    if (!it.stores.includes(oldName)) return it
    const replaced = it.stores.map((s) => (s === oldName ? newName : s))
    return { ...it, stores: Array.from(new Set(replaced)) }
  })
}

/** Remove a store from every item's `stores` array. */
export function removeStoreFromItems(
  items: GroceryItem[],
  name: string,
): GroceryItem[] {
  return items.map((it) =>
    it.stores.includes(name)
      ? { ...it, stores: it.stores.filter((s) => s !== name) }
      : it,
  )
}

/** Append a store to the given items' `stores` arrays (no-op when an
 * item already lists it or isn't in `itemIds`). */
export function linkStoreToItems(
  items: GroceryItem[],
  storeName: string,
  itemIds: string[],
): GroceryItem[] {
  if (itemIds.length === 0) return items
  const idSet = new Set(itemIds)
  return items.map((it) => {
    if (!idSet.has(it.id)) return it
    if (it.stores.includes(storeName)) return it
    return { ...it, stores: [...it.stores, storeName] }
  })
}

// ── Department inference (local heuristic) ──────────────────────────
//
// Catches the most common grocery names without an AI call. The AI
// fallback (mobile/src/aiInfer.ts → classifyGroceryDept) runs only when
// this misses, saving ~70% of model calls. Map keys must be lowercased.
//
// Coverage philosophy: aim for the top ~200 items a typical household
// buys regularly. Niche items intentionally fall through to AI — better
// than a sprawling map that's hard to audit.

const GROCERY_MULTI_WORD: ReadonlyArray<readonly [string, string]> = [
  // 3+ word phrases first so they match before 2-word substrings
  ['ground beef', 'meat'], ['ground turkey', 'meat'], ['ground chicken', 'meat'],
  ['ground pork', 'meat'], ['pork chop', 'meat'], ['pork chops', 'meat'],
  ['chicken breast', 'meat'], ['chicken thigh', 'meat'], ['chicken thighs', 'meat'],
  ['chicken wing', 'meat'], ['chicken wings', 'meat'], ['beef short rib', 'meat'],
  ['sea bass', 'meat'], ['fish sticks', 'meat'],

  ['cream cheese', 'dairy'], ['sour cream', 'dairy'], ['cottage cheese', 'dairy'],
  ['half and half', 'dairy'], ['greek yogurt', 'dairy'], ['oat milk', 'dairy'],
  ['almond milk', 'dairy'], ['soy milk', 'dairy'], ['heavy cream', 'dairy'],

  ['olive oil', 'pantry'], ['vegetable oil', 'pantry'], ['canola oil', 'pantry'],
  ['coconut oil', 'pantry'], ['sesame oil', 'pantry'],
  ['soy sauce', 'pantry'], ['hot sauce', 'pantry'], ['tomato sauce', 'pantry'],
  ['pasta sauce', 'pantry'], ['marinara sauce', 'pantry'], ['fish sauce', 'pantry'],
  ['oyster sauce', 'pantry'], ['hoisin sauce', 'pantry'], ['bbq sauce', 'pantry'],
  ['barbecue sauce', 'pantry'], ['pizza sauce', 'pantry'],
  ['peanut butter', 'pantry'], ['almond butter', 'pantry'], ['nut butter', 'pantry'],
  ['brown sugar', 'pantry'], ['powdered sugar', 'pantry'], ['maple syrup', 'pantry'],
  ['baking soda', 'pantry'], ['baking powder', 'pantry'], ['black pepper', 'pantry'],
  ['sea salt', 'pantry'], ['kosher salt', 'pantry'],

  ['ice cream', 'frozen'], ['frozen pizza', 'frozen'], ['frozen vegetables', 'frozen'],
  ['frozen veggies', 'frozen'], ['frozen yogurt', 'frozen'], ['frozen fruit', 'frozen'],
  ['frozen berries', 'frozen'], ['frozen dinner', 'frozen'], ['frozen meal', 'frozen'],
  ['frozen burrito', 'frozen'], ['frozen waffle', 'frozen'], ['frozen waffles', 'frozen'],

  ['orange juice', 'beverages'], ['apple juice', 'beverages'],
  ['sparkling water', 'beverages'], ['iced tea', 'beverages'],
  ['energy drink', 'beverages'], ['sports drink', 'beverages'],
  ['cold brew', 'beverages'], ['ground coffee', 'beverages'],
  ['coffee beans', 'beverages'], ['green tea', 'beverages'], ['black tea', 'beverages'],

  ['pita bread', 'bakery'], ['hamburger bun', 'bakery'], ['hamburger buns', 'bakery'],
  ['hot dog bun', 'bakery'], ['hot dog buns', 'bakery'], ['english muffin', 'bakery'],
  ['english muffins', 'bakery'], ['pizza dough', 'bakery'], ['pie crust', 'bakery'],

  ['sweet potato', 'produce'], ['sweet potatoes', 'produce'],
  ['bell pepper', 'produce'], ['bell peppers', 'produce'],
  ['brussels sprouts', 'produce'], ['green onion', 'produce'], ['green onions', 'produce'],
  ['snap pea', 'produce'], ['snap peas', 'produce'], ['snow pea', 'produce'],
  ['snow peas', 'produce'], ['baby spinach', 'produce'], ['baby carrots', 'produce'],
  ['cherry tomato', 'produce'], ['cherry tomatoes', 'produce'],
  ['grape tomato', 'produce'], ['grape tomatoes', 'produce'],

  ['paper towel', 'household'], ['paper towels', 'household'],
  ['toilet paper', 'household'], ['dish soap', 'household'], ['hand soap', 'household'],
  ['body wash', 'household'], ['laundry detergent', 'household'],
  ['fabric softener', 'household'], ['trash bag', 'household'], ['trash bags', 'household'],
  ['garbage bag', 'household'], ['garbage bags', 'household'],
  ['aluminum foil', 'household'], ['plastic wrap', 'household'], ['saran wrap', 'household'],
  ['wax paper', 'household'], ['parchment paper', 'household'],
  ['light bulb', 'household'], ['light bulbs', 'household'], ['batteries', 'household'],
  ['paper plate', 'household'], ['paper plates', 'household'],
] as const

const GROCERY_SINGLE_WORD: Readonly<Record<string, string>> = {
  // PRODUCE
  apple: 'produce', apples: 'produce', banana: 'produce', bananas: 'produce',
  orange: 'produce', oranges: 'produce', lemon: 'produce', lemons: 'produce',
  lime: 'produce', limes: 'produce', grape: 'produce', grapes: 'produce',
  strawberry: 'produce', strawberries: 'produce', blueberry: 'produce', blueberries: 'produce',
  raspberry: 'produce', raspberries: 'produce', blackberry: 'produce', blackberries: 'produce',
  pear: 'produce', pears: 'produce', peach: 'produce', peaches: 'produce',
  plum: 'produce', plums: 'produce', mango: 'produce', mangoes: 'produce',
  kiwi: 'produce', pineapple: 'produce', pineapples: 'produce',
  watermelon: 'produce', cantaloupe: 'produce', melon: 'produce',
  cherry: 'produce', cherries: 'produce', avocado: 'produce', avocados: 'produce',
  lettuce: 'produce', spinach: 'produce', kale: 'produce', arugula: 'produce',
  romaine: 'produce', cabbage: 'produce', carrot: 'produce', carrots: 'produce',
  potato: 'produce', potatoes: 'produce', onion: 'produce', onions: 'produce',
  garlic: 'produce', ginger: 'produce', tomato: 'produce', tomatoes: 'produce',
  cucumber: 'produce', cucumbers: 'produce', pepper: 'produce', peppers: 'produce',
  broccoli: 'produce', cauliflower: 'produce', celery: 'produce',
  asparagus: 'produce', zucchini: 'produce', squash: 'produce',
  mushroom: 'produce', mushrooms: 'produce', corn: 'produce',
  eggplant: 'produce', radish: 'produce', radishes: 'produce',
  beet: 'produce', beets: 'produce', leek: 'produce', leeks: 'produce',
  scallion: 'produce', scallions: 'produce', shallot: 'produce', shallots: 'produce',
  parsley: 'produce', basil: 'produce', cilantro: 'produce', mint: 'produce',
  rosemary: 'produce', thyme: 'produce', dill: 'produce', sage: 'produce',
  chive: 'produce', chives: 'produce', jalapeno: 'produce', jalapenos: 'produce',
  // MEAT & SEAFOOD
  chicken: 'meat', beef: 'meat', pork: 'meat', turkey: 'meat',
  lamb: 'meat', ham: 'meat', bacon: 'meat', sausage: 'meat', sausages: 'meat',
  salami: 'meat', prosciutto: 'meat', pepperoni: 'meat', steak: 'meat',
  brisket: 'meat', ribs: 'meat', drumstick: 'meat', drumsticks: 'meat',
  salmon: 'meat', tuna: 'meat', cod: 'meat', tilapia: 'meat', halibut: 'meat',
  shrimp: 'meat', prawn: 'meat', prawns: 'meat', lobster: 'meat', crab: 'meat',
  scallop: 'meat', scallops: 'meat', mussel: 'meat', mussels: 'meat',
  clam: 'meat', clams: 'meat', oyster: 'meat', oysters: 'meat',
  fish: 'meat', sardine: 'meat', sardines: 'meat', anchovy: 'meat', anchovies: 'meat',
  // DAIRY & EGGS
  milk: 'dairy', butter: 'dairy', cream: 'dairy', yogurt: 'dairy', yoghurt: 'dairy',
  cheese: 'dairy', cheddar: 'dairy', mozzarella: 'dairy', parmesan: 'dairy',
  feta: 'dairy', gouda: 'dairy', brie: 'dairy', swiss: 'dairy', ricotta: 'dairy',
  mascarpone: 'dairy', egg: 'dairy', eggs: 'dairy', kefir: 'dairy',
  // BAKERY
  bread: 'bakery', baguette: 'bakery', bagel: 'bakery', bagels: 'bakery',
  croissant: 'bakery', croissants: 'bakery', muffin: 'bakery', muffins: 'bakery',
  donut: 'bakery', donuts: 'bakery', doughnut: 'bakery', doughnuts: 'bakery',
  pastry: 'bakery', pastries: 'bakery', scone: 'bakery', scones: 'bakery',
  sourdough: 'bakery', biscuit: 'bakery', biscuits: 'bakery',
  tortilla: 'bakery', tortillas: 'bakery', naan: 'bakery', focaccia: 'bakery',
  roll: 'bakery', rolls: 'bakery', bun: 'bakery', buns: 'bakery',
  // PANTRY (canned/dry/snacks/condiments)
  rice: 'pantry', pasta: 'pantry', noodle: 'pantry', noodles: 'pantry',
  ramen: 'pantry', spaghetti: 'pantry', macaroni: 'pantry',
  flour: 'pantry', sugar: 'pantry', salt: 'pantry', vinegar: 'pantry',
  oil: 'pantry', ketchup: 'pantry', mustard: 'pantry', mayo: 'pantry',
  mayonnaise: 'pantry', sriracha: 'pantry', honey: 'pantry', syrup: 'pantry',
  jam: 'pantry', jelly: 'pantry', preserves: 'pantry', nutella: 'pantry',
  beans: 'pantry', lentil: 'pantry', lentils: 'pantry', chickpea: 'pantry',
  chickpeas: 'pantry', quinoa: 'pantry', couscous: 'pantry',
  oat: 'pantry', oats: 'pantry', oatmeal: 'pantry', cereal: 'pantry', granola: 'pantry',
  soup: 'pantry', broth: 'pantry', stock: 'pantry', salsa: 'pantry', hummus: 'pantry',
  chip: 'pantry', chips: 'pantry', cracker: 'pantry', crackers: 'pantry',
  pretzel: 'pantry', pretzels: 'pantry', popcorn: 'pantry',
  cookie: 'pantry', cookies: 'pantry', candy: 'pantry', chocolate: 'pantry',
  brownie: 'pantry', brownies: 'pantry',
  nut: 'pantry', nuts: 'pantry', almond: 'pantry', almonds: 'pantry',
  walnut: 'pantry', walnuts: 'pantry', cashew: 'pantry', cashews: 'pantry',
  peanut: 'pantry', peanuts: 'pantry', pistachio: 'pantry', pistachios: 'pantry',
  paprika: 'pantry', cumin: 'pantry', cinnamon: 'pantry', vanilla: 'pantry',
  oregano: 'pantry', turmeric: 'pantry', saffron: 'pantry', curry: 'pantry',
  raisin: 'pantry', raisins: 'pantry',
  // BEVERAGES
  water: 'beverages', juice: 'beverages', soda: 'beverages', cola: 'beverages',
  coke: 'beverages', sprite: 'beverages', pepsi: 'beverages', lemonade: 'beverages',
  beer: 'beverages', wine: 'beverages', champagne: 'beverages', prosecco: 'beverages',
  vodka: 'beverages', whiskey: 'beverages', whisky: 'beverages', rum: 'beverages',
  gin: 'beverages', tequila: 'beverages', bourbon: 'beverages',
  coffee: 'beverages', tea: 'beverages', espresso: 'beverages',
  kombucha: 'beverages', gatorade: 'beverages', powerade: 'beverages',
  seltzer: 'beverages',
  // HOUSEHOLD
  soap: 'household', shampoo: 'household', conditioner: 'household',
  toothpaste: 'household', toothbrush: 'household', deodorant: 'household',
  razor: 'household', razors: 'household', detergent: 'household',
  bleach: 'household', sponge: 'household', sponges: 'household',
  tissue: 'household', tissues: 'household', napkin: 'household', napkins: 'household',
  foil: 'household', ziplock: 'household', battery: 'household',
  candle: 'household', candles: 'household', lightbulb: 'household',
}

/**
 * Best-guess grocery department from the item text using a static
 * keyword map. Returns the matching group id (e.g. 'produce') or
 * undefined when nothing matches.
 *
 * Behavior:
 *   - Multi-word phrases match first (longer = more specific) so
 *     "ice cream" → frozen wins over "cream" → dairy.
 *   - Single-word matches run against tokenized input next.
 *   - Returns undefined when the matched group isn't in `groups`
 *     (e.g. user deleted the built-in Produce group).
 *
 * Pure function — safe to call on every keystroke; no allocations
 * beyond the tokenized input array.
 */
export function inferGroceryGroupLocal(
  text: string,
  groups: GroceryGroup[],
): string | undefined {
  const lower = text.toLowerCase().trim()
  if (lower.length === 0) return undefined
  const validIds = new Set(groups.map((g) => g.id))
  // Multi-word phrases (already ordered longest-first within the array).
  for (const [keyword, groupId] of GROCERY_MULTI_WORD) {
    if (lower.includes(keyword) && validIds.has(groupId)) return groupId
  }
  // Single-word matches: split on whitespace + common punctuation.
  const tokens = lower.split(/[\s,.;:!?()/\\-]+/).filter(Boolean)
  for (const token of tokens) {
    const groupId = GROCERY_SINGLE_WORD[token]
    if (groupId && validIds.has(groupId)) return groupId
  }
  return undefined
}

/** Return items whose `purchases` log shows ≥`minCount` check-offs within
 * `windowMs` of `now`. Sorted by in-window count desc, ties broken by
 * latest in-window timestamp desc. `now` is injectable for tests. */
export function frequentGroceries(
  items: GroceryItem[],
  opts: { minCount?: number; windowMs?: number; now?: number } = {},
): GroceryItem[] {
  const minCount = opts.minCount ?? FREQUENT_GROCERY_MIN_COUNT
  const windowMs = opts.windowMs ?? FREQUENT_GROCERY_WINDOW_MS
  const now = opts.now ?? Date.now()
  const cutoff = now - windowMs
  const ranked: { item: GroceryItem; count: number; latest: number }[] = []
  for (const it of items) {
    const ps = it.purchases ?? []
    let count = 0
    let latest = 0
    for (const t of ps) {
      if (t >= cutoff) {
        count += 1
        if (t > latest) latest = t
      }
    }
    if (count >= minCount) ranked.push({ item: it, count, latest })
  }
  ranked.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count
    return b.latest - a.latest
  })
  return ranked.map((x) => x.item)
}
