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
import type { CategoryDef } from '../categories'
import type { Filter, Todo } from '../types'
import { isCategoryFilter, categoryIdFromFilter } from '../types'
import { categoryDelete } from '../derive'
import { stripFilterFromPinned } from '../filters'

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
