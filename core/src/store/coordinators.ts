/**
 * Pure cross-slice coordinators — state transforms that span more than
 * one persisted slice (todos + categories + filter + profile). Each
 * returns the next value of every touched slice plus a `changed` flag;
 * the React glue applies them via setState and skips writes when nothing
 * changed. No React, no adapter, no direct clock access.
 *
 * This is where the store's *orchestration* becomes testable — the logic
 * that used to live inline in the platform composer, deciding how a
 * single user action ripples across slices.
 */
import type { CategoryDef } from '../data/categories'
import type { Filter, Todo } from '../domain/types'
import { isCategoryFilter, categoryIdFromFilter } from '../domain/types'
import { categoryDelete, todoToggle } from '../logic/derive'
import { DEFAULT_HOME_STAT_TILES, filterSetKey, stripFilterFromPinned } from '../logic/filters'

export interface DeleteCategoryInput {
  todos: Todo[]
  categories: CategoryDef[]
  id: string
  /** Active filter — reset to 'all' when it targets the deleted category. */
  filter: Filter
  /** Active multi-filter selection — the deleted `cat:<id>` is removed. */
  filters?: Filter[]
  pinnedFilters: string[][] | undefined
  /** Profile's Dashboard stat tiles — the deleted `cat:<id>` is removed. */
  homeStatTiles?: string[]
}

export interface DeleteCategoryResult {
  /** False when the delete was refused (last category) or otherwise a no-op. */
  changed: boolean
  todos: Todo[]
  categories: CategoryDef[]
  /** Next filter, or null when no filter change is needed. */
  filter: Filter | null
  /** Next pinnedFilters (same reference ⇒ no change). */
  pinnedFilters: string[][] | undefined
  /** Next multi-filter selection, or null when it didn't contain the category. */
  filters: Filter[] | null
  /** Next homeStatTiles (same reference ⇒ no change). */
  homeStatTiles: string[] | undefined
}

/** Strip `filterId` from every pinned set (stripFilterFromPinned), then drop
 * sets that became duplicates of another — ['cat:x','done'] collapses to
 * ['done'], which may already be pinned. Same reference when unchanged. */
function stripAndDedupePinned(
  pinned: string[][] | undefined,
  filterId: string,
): string[][] | undefined {
  const stripped = stripFilterFromPinned(pinned, filterId)
  if (stripped === pinned || !stripped) return stripped
  const seen = new Set<string>()
  return stripped.filter((set) => {
    const key = filterSetKey(set)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Cascade for deleting a category across every slice it touches:
 *   - core `categoryDelete` drops the category and clears it on every todo
 *     that had it (the todos stay put — uncategorized, never binned)
 *   - reset the active filter to 'all' if it pointed at the deleted id, and
 *     drop it from the multi-filter selection
 *   - strip the ghost `cat:<id>` from every pinned filter set (deduping sets
 *     that collapse into each other) and from the Dashboard stat tiles
 *
 * Refuses to delete the last remaining category (`categoryDelete`
 * returns `deleted: false`). Pure — the glue applies the returned slices.
 */
export function deleteCategoryCascade(
  input: DeleteCategoryInput,
): DeleteCategoryResult {
  const { todos, categories, id, filter, filters, pinnedFilters, homeStatTiles } = input
  const next = categoryDelete(todos, categories, id)
  if (!next.deleted) {
    return {
      changed: false, todos, categories, filter: null, pinnedFilters, filters: null, homeStatTiles,
    }
  }
  const catFilter: Filter = `cat:${id}`
  // Unset tiles mean the default trio, which itself names categories.
  const tiles = homeStatTiles ?? DEFAULT_HOME_STAT_TILES
  const filterReset =
    isCategoryFilter(filter) && categoryIdFromFilter(filter) === id
      ? ('all' as Filter)
      : null
  return {
    changed: true,
    todos: next.todos,
    categories: next.categories,
    filter: filterReset,
    filters: filters && filters.includes(catFilter)
      ? filters.filter((f) => f !== catFilter)
      : null,
    pinnedFilters: stripAndDedupePinned(pinnedFilters, catFilter),
    homeStatTiles: tiles.includes(catFilter)
      ? tiles.filter((f) => f !== catFilter)
      : homeStatTiles,
  }
}

export interface ToggleOutcome {
  /** The toggled row after the flip (single-row view). */
  after: Todo
  /** Completion row to record as a "you've done this before" reference,
   * or null when this flip wasn't a fresh completion. */
  referenceRow: Todo | null
}

/**
 * Pure outcome of toggling a single todo: the after-row and the reference
 * row to record when the flip newly completes it. Mirrors the single-element
 * `todoToggle` the slice runs to read the after/snapshot rows without
 * scanning the whole list — a recurring todo yields a completed snapshot
 * (out[1]) plus its rolled-forward next instance (out[0]). The glue applies
 * the setState + side effects.
 */
export function toggleOutcome(before: Todo): ToggleOutcome {
  const out = todoToggle([before], before.id)
  const after = out[0]
  const snapshot = out.length > 1 ? out[1] : null
  const completionRow = snapshot && snapshot.done ? snapshot : after
  const referenceRow =
    completionRow && completionRow.done && !before.done ? completionRow : null
  return { after, referenceRow }
}
