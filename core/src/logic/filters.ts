/**
 * Pure filter/profile-shortcut logic, lifted out of mobile's
 * useProfileSlice so it's unit-testable and platform-agnostic.
 *
 * Two kinds of stored shortcut live on the Profile as raw strings:
 *
 * - `pinnedFilters: string[][]` — quick-access pills in the FilterBar.
 *   Each entry is a SET of raw Filter strings; single-filter pills are
 *   one-element arrays (`['done']`), composite pills are multi-element
 *   (`['done','cat:work']`). Sets compare order-insensitively.
 * - `homeStatTiles: string[]` — Dashboard stat tiles, also raw Filter
 *   strings. `undefined` means "use the default trio".
 *
 * These helpers operate on the raw `string[]` shapes the Profile stores
 * (Filter is a string subtype, so callers can pass `Filter[]` directly).
 */
import type { Filter, ViewMode, Todo } from '../domain/types'
import type { DashboardTile } from '../data/profile'
import {
  isCategoryFilter,
  isPriorityFilter,
  categoryIdFromFilter,
  priorityFromFilter,
} from '../domain/types'
import { todayLocal, dueDateOnly } from './utils'

/** Soft cap on pinned filter pills in the FilterBar quick-access row. */
export const PIN_LIMIT = 12

/** Default Home stat tiles when the user hasn't picked any. Materialized
 * on first toggle so tapping a default actually removes it (vs no-op
 * against `undefined`). */
export const DEFAULT_HOME_STAT_TILES: string[] = ['cat:home', 'cat:work', 'done']

/** Order-insensitive key for a filter set, so `['done','cat:work']` and
 * `['cat:work','done']` are treated as the same pinned entry. */
export function filterSetKey(set: string[]): string {
  return [...set].sort().join(' ')
}

/** Outcome of a pinned-set mutation. `pinned` is the next list (or the
 * same reference when nothing changed, so callers can skip a write).
 * `limitReached` is true when an add was blocked by the cap, so the
 * caller can surface a snackbar. */
export interface PinResult {
  pinned: string[][] | undefined
  limitReached: boolean
}

/** Toggle a filter set in the pinned list: remove it if already pinned
 * (order-insensitive), otherwise add it — unless at `limit`, in which
 * case the list is returned unchanged with `limitReached: true`. An
 * empty set is a no-op. */
export function togglePinnedFilter(
  pinned: string[][] | undefined,
  set: string[],
  limit: number = PIN_LIMIT,
): PinResult {
  if (set.length === 0) return { pinned, limitReached: false }
  const key = filterSetKey(set)
  const current = pinned ?? []
  const idx = current.findIndex((existing) => filterSetKey(existing) === key)
  if (idx >= 0) {
    const next = current.filter((_, i) => i !== idx)
    return { pinned: next.length > 0 ? next : undefined, limitReached: false }
  }
  if (current.length >= limit) return { pinned, limitReached: true }
  return { pinned: [...current, set], limitReached: false }
}

/** Add a filter set to the pinned list if not already present (no-op when
 * present), blocked by the cap. Used by the "keep & clear" flow, which
 * only ever adds. */
export function addPinnedFilter(
  pinned: string[][] | undefined,
  set: string[],
  limit: number = PIN_LIMIT,
): PinResult {
  if (set.length === 0) return { pinned, limitReached: false }
  const key = filterSetKey(set)
  const current = pinned ?? []
  if (current.some((existing) => filterSetKey(existing) === key)) {
    return { pinned, limitReached: false }
  }
  if (current.length >= limit) return { pinned, limitReached: true }
  return { pinned: [...current, set], limitReached: false }
}

/** Remove a single filter id from every pinned set, dropping any set that
 * becomes empty. Returns the same reference when nothing changed. Used
 * when a status/priority is hidden so it no longer surfaces inside a
 * composite pinned pill. */
export function stripFilterFromPinned(
  pinned: string[][] | undefined,
  filterId: string,
): string[][] | undefined {
  if (!pinned) return pinned
  let touched = false
  const cleaned: string[][] = []
  for (const set of pinned) {
    if (set.includes(filterId)) {
      touched = true
      const survivors = set.filter((f) => f !== filterId)
      if (survivors.length > 0) cleaned.push(survivors)
    } else {
      cleaned.push(set)
    }
  }
  if (!touched) return pinned
  return cleaned.length > 0 ? cleaned : undefined
}

/** Toggle a Home stat tile, materializing `defaults` first when the user
 * has none set so toggling a default removes it (rather than being a
 * no-op against `undefined`). */
export function toggleStatTile(
  current: string[] | undefined,
  tile: string,
  defaults: string[] = DEFAULT_HOME_STAT_TILES,
): string[] {
  const base = current === undefined ? defaults : current
  return base.includes(tile) ? base.filter((x) => x !== tile) : [...base, tile]
}

/** The sensible default filter for a view mode: category view opens on
 * "all", status view on "open". */
export function defaultFilterForView(v: ViewMode): Filter {
  return v === 'category' ? 'all' : 'open'
}

/** Stable key for a dashboard tile (order-insensitive for filter sets). */
export function dashboardTileKey(t: DashboardTile): string {
  if (t.kind === 'todoFilter') return `f:${filterSetKey(t.set)}`
  if (t.kind === 'groceryStore') return `s:${t.store}`
  return `d:${t.dept}`
}

/**
 * The Dashboard pinned-card row, unifying Todos pinned filter sets +
 * Shopping pinned stores/depts. `profile.dashboardTiles` stores the user's
 * drag ORDER; this reconciles it against the CURRENT pins each read — keeps
 * the stored order, drops tiles whose pin was removed, and appends pins not
 * yet ordered. When no order is stored yet, returns the pins in their
 * natural order (Todos, then stores, then depts).
 */
export function effectiveDashboardTiles(p: {
  dashboardTiles?: DashboardTile[]
  pinnedFilters?: string[][]
  pinnedGroceryStores?: string[]
  pinnedGroceryDepts?: string[]
}): DashboardTile[] {
  const current: DashboardTile[] = [
    ...(p.pinnedFilters ?? []).map((set) => ({ kind: 'todoFilter', set }) as DashboardTile),
    ...(p.pinnedGroceryStores ?? []).map((store) => ({ kind: 'groceryStore', store }) as DashboardTile),
    ...(p.pinnedGroceryDepts ?? []).map((dept) => ({ kind: 'groceryDept', dept }) as DashboardTile),
  ]
  if (!p.dashboardTiles || p.dashboardTiles.length === 0) return current
  const byKey = new Map(current.map((t) => [dashboardTileKey(t), t]))
  const ordered: DashboardTile[] = []
  const seen = new Set<string>()
  for (const t of p.dashboardTiles) {
    const k = dashboardTileKey(t)
    const live = byKey.get(k)
    if (live && !seen.has(k)) {
      ordered.push(live)
      seen.add(k)
    }
  }
  for (const t of current) {
    const k = dashboardTileKey(t)
    if (!seen.has(k)) {
      ordered.push(t)
      seen.add(k)
    }
  }
  return ordered
}

const STATUS_FILTER_KEYS = new Set(['overdue', 'open', 'done', 'trash', 'groceries'])

/**
 * Count todos matching a pinned filter SET, using the SAME predicate as
 * deriveState — OR within each type group (status / category / priority),
 * AND across groups, with the trashed/completed-today grace rule. Powers
 * the Dashboard pinned-filter cards' stat counts (each pinned set has no
 * precomputed count, unlike single-filter tiles). Pure + testable.
 */
export function countTodosForFilterSet(
  todos: readonly Todo[],
  set: readonly string[],
  today: string = todayLocal(),
): number {
  const statuses = set.filter((f) => STATUS_FILTER_KEYS.has(f))
  const catIds = set
    .filter((f) => isCategoryFilter(f as Filter))
    .map((f) => categoryIdFromFilter(f as `cat:${string}`))
  const pris = set
    .filter((f) => isPriorityFilter(f as Filter))
    .map((f) => priorityFromFilter(f as `pri:${'high' | 'medium' | 'low'}`))

  const completedToday = (td: Todo) => !!td.done && td.completionDate === today
  const isOverdue = (td: Todo) => !!td.dueDate && dueDateOnly(td.dueDate) < today
  const matchesStatus = (td: Todo, s: string): boolean => {
    if (s === 'done' || s === 'trash') return !!td.done || !!td.trashed
    if (td.trashed && !completedToday(td)) return false
    if (s === 'overdue') return isOverdue(td)
    if (s === 'open') return !td.done && !td.trashed
    return false // 'groceries' is not a todo predicate
  }

  let n = 0
  for (const td of todos) {
    if (statuses.length > 0) {
      if (!statuses.some((s) => matchesStatus(td, s))) continue
    } else if (td.trashed && !completedToday(td)) {
      continue
    }
    if (catIds.length > 0 && !catIds.some((id) => td.category === id)) continue
    if (pris.length > 0 && !pris.some((p) => td.priority === p)) continue
    n++
  }
  return n
}
