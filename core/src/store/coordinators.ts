/**
 * Pure cross-slice coordinators — state transforms that span more than
 * one persisted slice (todos + categories + filter + profile). Each
 * returns the next value of every touched slice plus a `changed` flag;
 * the React glue applies them via setState and skips writes when nothing
 * changed. No React, no adapter, no direct clock access (see StoreDeps).
 *
 * This is where the store's *orchestration* becomes testable — the logic
 * that used to live inline in the platform composer, deciding how a
 * single user action ripples across slices.
 */
import type { CategoryDef } from '../data/categories'
import type { Filter, Todo } from '../domain/types'
import { isCategoryFilter, categoryIdFromFilter } from '../domain/types'
import { categoryDelete, todoToggle } from '../logic/derive'
import { stripFilterFromPinned } from '../logic/filters'

export interface DeleteCategoryInput {
  todos: Todo[]
  categories: CategoryDef[]
  id: string
  /** Active filter — reset to 'all' when it targets the deleted category. */
  filter: Filter
  pinnedFilters: string[][] | undefined
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
}

/**
 * Cascade for deleting a category across every slice it touches:
 *   - core `categoryDelete` drops the category + trashes its todos
 *   - reset the active filter to 'all' if it pointed at the deleted id
 *   - strip the ghost `cat:<id>` from every pinned filter set
 *
 * Refuses to delete the last remaining category (`categoryDelete`
 * returns `deleted: false`). Pure — the glue applies the returned slices.
 */
export function deleteCategoryCascade(
  input: DeleteCategoryInput,
): DeleteCategoryResult {
  const { todos, categories, id, filter, pinnedFilters } = input
  const next = categoryDelete(todos, categories, id)
  if (!next.deleted) {
    return { changed: false, todos, categories, filter: null, pinnedFilters }
  }
  const filterReset =
    isCategoryFilter(filter) && categoryIdFromFilter(filter) === id
      ? ('all' as Filter)
      : null
  return {
    changed: true,
    todos: next.todos,
    categories: next.categories,
    filter: filterReset,
    pinnedFilters: stripFilterFromPinned(pinnedFilters, `cat:${id}`),
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
