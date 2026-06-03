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
import type { Filter, ViewMode } from './types'

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
