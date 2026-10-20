import { useEffect, useMemo, useRef, useState } from "react";
import { SNACKBAR_DURATION_MS } from "../../app/notify";
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

/** How long a just-completed row stays on screen: its Undo window (the
 * completion snackbar's duration). */
export const LINGER_MS = SNACKBAR_DURATION_MS;

/**
 * "Linger" behavior for the Todos list. Done rows aren't in the open
 * groups (core deriveState), so a row the user just checked off drops out
 * of the filtered set. Instead of vanishing under their finger, it stays
 * visible (struck through) at the BOTTOM of its date-bucket group for its
 * Undo window (LINGER_MS), then leaves — or right away when the filter
 * changes. Only rows that left because they became DONE linger; a skipped
 * / deleted row leaves at once (its snackbar has the Undo).
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

  // One expiry timer per lingering id.
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const clearTimers = () => {
    timersRef.current.forEach((tm) => clearTimeout(tm));
    timersRef.current.clear();
  };
  useEffect(() => clearTimers, []);

  // Reset linger whenever the active filter set changes — the user
  // changing scope is the trigger to drop the lingering items.
  const filtersKey = useMemo(
    () => [...store.filters].sort().join("|"),
    [store.filters],
  );
  useEffect(() => {
    clearTimers();
    setLingerIds(new Set());
  }, [filtersKey]);

  // Diff store.filtered against the previous render to detect IDs that
  // just dropped out of view, and add them to lingerIds. Also remove any
  // lingering IDs that came BACK into the filter (e.g. the user
  // un-checked).
  const prevFilteredIdsRef = useRef<Set<string>>(new Set());
  const todosRef = useRef(store.todos);
  todosRef.current = store.todos;
  useEffect(() => {
    const currentIds = new Set(store.filtered.map((t) => t.id));
    const doneNow = new Set(todosRef.current.filter((t) => t.done).map((t) => t.id));
    const dropped: string[] = [];
    prevFilteredIdsRef.current.forEach((id) => {
      if (!currentIds.has(id) && doneNow.has(id)) dropped.push(id);
    });
    for (const id of dropped) {
      if (timersRef.current.has(id)) continue;
      timersRef.current.set(
        id,
        setTimeout(() => {
          timersRef.current.delete(id);
          setLingerIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, LINGER_MS),
      );
    }
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
          const tm = timersRef.current.get(id);
          if (tm) clearTimeout(tm);
          timersRef.current.delete(id);
        }
      });
      return touched ? next : prev;
    });
    prevFilteredIdsRef.current = currentIds;
  }, [store.filtered]);

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
