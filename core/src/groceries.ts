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
import { genUuid } from './utils'

export interface GroceryItem {
  /** Stable UUID, like Todo.id. */
  id: string
  text: string
  /** FK to GroceryGroup.id. Falls back to OTHERS_GROUP_ID on read if
   * the group has been deleted. */
  groupId: string
  /** Optional store hint ("Costco", "Trader Joe's"). Drives the
   * view's store-filter dropdown. Empty / undefined = no specific store. */
  store?: string
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
  { id: OTHERS_GROUP_ID, label: 'Uncategorized' },
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
  store?: string
}): GroceryItem {
  return {
    id: genUuid(),
    text: args.text.slice(0, MAX_GROCERY_TEXT_LEN),
    groupId: args.groupId?.slice(0, MAX_GROCERY_GROUP_ID_LEN) || OTHERS_GROUP_ID,
    store: args.store ? args.store.slice(0, MAX_GROCERY_STORE_LEN) : undefined,
    checked: false,
    addedAt: Date.now(),
  }
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
    const item: GroceryItem = {
      id: o.id.slice(0, 64),
      text: o.text.slice(0, MAX_GROCERY_TEXT_LEN),
      groupId: o.groupId.slice(0, MAX_GROCERY_GROUP_ID_LEN),
      checked: o.checked === true,
      addedAt:
        typeof o.addedAt === 'number' && o.addedAt > 0
          ? Math.floor(o.addedAt)
          : Date.now(),
    }
    if (typeof o.store === 'string' && o.store.length > 0) {
      item.store = o.store.slice(0, MAX_GROCERY_STORE_LEN)
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
  // Upgrade the legacy default label "Others" → "Uncategorized" so
  // existing users see the new name; user-renamed labels are preserved.
  const withoutOthers = out.filter((g) => g.id !== OTHERS_GROUP_ID)
  const othersFromInput = out.find((g) => g.id === OTHERS_GROUP_ID)
  const others =
    othersFromInput
      ? othersFromInput.label === 'Others'
        ? { ...othersFromInput, label: 'Uncategorized' }
        : othersFromInput
      : { id: OTHERS_GROUP_ID, label: 'Uncategorized' }
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
 * config — store names are emergent). */
export function deriveStores(items: GroceryItem[]): string[] {
  const seen = new Map<string, number>() // store → most-recent ms
  for (const it of items) {
    if (!it.store) continue
    const prev = seen.get(it.store) ?? 0
    const ts = Math.max(it.checkedAt ?? 0, it.addedAt)
    if (ts > prev) seen.set(it.store, ts)
  }
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s)
}

// ── Mutation helpers (pure) ─────────────────────────────────────────

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

/** Apply text/group/store edits to a single item. Caps strings. */
export function groceryEdit(
  items: GroceryItem[],
  id: string,
  patch: { text?: string; groupId?: string; store?: string | null },
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
    if (patch.store !== undefined) {
      next.store = patch.store ? patch.store.slice(0, MAX_GROCERY_STORE_LEN) : undefined
    }
    return next
  })
}

/** Permanent delete — manual-only path. */
export function groceryDelete(items: GroceryItem[], id: string): GroceryItem[] {
  return items.filter((it) => it.id !== id)
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
