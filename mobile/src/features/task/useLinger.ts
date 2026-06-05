import { useEffect, useMemo, useRef, useState } from "react";
import { buildGroups, TodoGroup } from "../../../../core/src/logic/groups";
import type { Todo, Filter } from "../../core-bindings/types";

/** The slice of the store this hook reads — kept structural so the hook
 * doesn't depend on the whole useTodoStore type. */
interface LingerStore {
  filters: Filter[];
  filtered: Todo[];
  groups: TodoGroup[];
  todos: Todo[];
}

/**
 * "Linger" behavior for the Todos list, extracted verbatim from
 * TodosScreen. When a filter is active and a row drops out of the
 * filtered set (e.g. the user checks off a task in the Open view), the
 * row would normally vanish instantly. Instead we keep it visible at the
 * BOTTOM of its date-bucket group until the filter changes — so a
 * check-off doesn't yank the just-tapped row out from under the user.
 *
 * Also folds in the search projection: `displayFiltered` (flat) and
 * `displayGroups` (grouped, lingering rows pushed to each group's end)
 * are the search-narrowed views every render path consumes in place of
 * store.filtered / store.groups.
 *
 * Behavior-preserving move only — the hook order + effect dependencies
 * are identical to the inline version. The auto-expand-first-group
 * effect stays in TodosScreen because it also touches collapsedGroups.
 */
export function useLinger(
  store: LingerStore,
  searchNeedle: string,
): { lingerIds: Set<string>; displayFiltered: Todo[]; displayGroups: TodoGroup[] } {
  const [lingerIds, setLingerIds] = useState<Set<string>>(new Set());

  // Reset linger whenever the active filter set changes — the user
  // changing scope is the trigger to drop the lingering items.
  const filtersKey = useMemo(
    () => [...store.filters].sort().join("|"),
    [store.filters],
  );
  useEffect(() => {
    setLingerIds(new Set());
  }, [filtersKey]);

  // Diff store.filtered against the previous render to detect IDs that
  // just dropped out of view, and add them to lingerIds. Also remove any
  // lingering IDs that came BACK into the filter (e.g. the user
  // un-checked).
  const prevFilteredIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (store.filters.length === 0) {
      prevFilteredIdsRef.current = new Set();
      return;
    }
    const currentIds = new Set(store.filtered.map((t) => t.id));
    const dropped: string[] = [];
    prevFilteredIdsRef.current.forEach((id) => {
      if (!currentIds.has(id)) dropped.push(id);
    });
    setLingerIds((prev) => {
      let touched = false;
      const next = new Set(prev);
      for (const id of dropped) {
        if (!next.has(id)) {
          next.add(id);
          touched = true;
        }
      }
      next.forEach((id) => {
        if (currentIds.has(id)) {
          next.delete(id);
          touched = true;
        }
      });
      return touched ? next : prev;
    });
    prevFilteredIdsRef.current = currentIds;
  }, [store.filtered, store.filters.length]);

  const displayFiltered = useMemo(() => {
    if (!searchNeedle) return store.filtered;
    return store.filtered.filter((td) => {
      if (td.text.toLowerCase().includes(searchNeedle)) return true;
      if (td.subtasks?.some((s) => s.text.toLowerCase().includes(searchNeedle)))
        return true;
      if (typeof td.notes === "string" && td.notes.toLowerCase().includes(searchNeedle))
        return true;
      return false;
    });
  }, [store.filtered, searchNeedle]);

  // Augment store.groups with lingering items at the bottom of their date
  // bucket. Re-runs buildGroups against the union of filter-matching +
  // lingering todos, then pushes lingering ids to each group's end so the
  // filter-matching rows still rank by priority/dueDate at the top.
  const groupsWithLinger = useMemo(() => {
    if (lingerIds.size === 0) return store.groups;
    const lingerTodos = store.todos.filter((t) => lingerIds.has(t.id));
    if (lingerTodos.length === 0) return store.groups;
    const seen = new Set<string>();
    const combined: Todo[] = [];
    for (const t of store.filtered) {
      seen.add(t.id);
      combined.push(t);
    }
    for (const t of lingerTodos) {
      if (!seen.has(t.id)) combined.push(t);
    }
    const groups = buildGroups(combined);
    return groups.map((g) => {
      const matching: Todo[] = [];
      const lingering: Todo[] = [];
      for (const t of g.todos) {
        if (lingerIds.has(t.id)) lingering.push(t);
        else matching.push(t);
      }
      return { ...g, todos: [...matching, ...lingering] };
    });
  }, [store.groups, store.filtered, store.todos, lingerIds]);

  const displayGroups = useMemo(() => {
    if (!searchNeedle) return groupsWithLinger;
    return groupsWithLinger
      .map((g) => ({
        ...g,
        todos: g.todos.filter((td) => {
          if (td.text.toLowerCase().includes(searchNeedle)) return true;
          if (td.subtasks?.some((s) => s.text.toLowerCase().includes(searchNeedle)))
            return true;
          if (
            typeof td.notes === "string" &&
            td.notes.toLowerCase().includes(searchNeedle)
          )
            return true;
          return false;
        }),
      }))
      .filter((g) => g.todos.length > 0);
  }, [groupsWithLinger, searchNeedle]);

  return { lingerIds, displayFiltered, displayGroups };
}
