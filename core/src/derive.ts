import {
  Category,
  Filter,
  Priority,
  Todo,
  isCategoryFilter,
  categoryIdFromFilter,
} from "./types";
import { CategoryDef, categoryLabel } from "./categories";
import { buildGroups, TodoGroup } from "./groups";
import { todayLocal } from "./utils";
import type { Strings } from "./i18n";

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// ---- Pure mutation helpers ----------------------------------------------

export function newTodo(input: {
  text: string;
  priority: Priority;
  dueDate: string;
  category?: Category;
}): Todo {
  return {
    id: Date.now(),
    text: input.text,
    done: false,
    priority: input.priority,
    dueDate: input.dueDate,
    category: input.category,
    trashed: false,
  };
}

export function todoToggle(prev: Todo[], id: number): Todo[] {
  return prev.map((td) => (td.id === id ? { ...td, done: !td.done } : td));
}

export function todoMoveToTrash(prev: Todo[], id: number): Todo[] {
  return prev.map((td) =>
    td.id === id ? { ...td, trashed: true, trashedAt: Date.now() } : td,
  );
}

export function todoRestoreFromTrash(prev: Todo[], id: number): Todo[] {
  return prev.map((td) => {
    if (td.id !== id) return td;
    const { trashedAt: _t, ...rest } = td;
    return { ...rest, trashed: false };
  });
}

export function todoPermanentlyDelete(prev: Todo[], id: number): Todo[] {
  return prev.filter((td) => td.id !== id);
}

export function todoEmptyTrash(prev: Todo[]): Todo[] {
  return prev.filter((td) => !td.trashed);
}

export function todoClearDone(prev: Todo[]): Todo[] {
  return prev.filter((td) => !td.done || td.trashed);
}

export function todoSet<K extends keyof Todo>(
  prev: Todo[],
  id: number,
  field: K,
  value: Todo[K],
): Todo[] {
  return prev.map((td) => (td.id === id ? { ...td, [field]: value } : td));
}

export function categoryAdd(
  prev: CategoryDef[],
  newId: string,
  data: { label: string; color: string; icon: string },
): CategoryDef[] {
  return [...prev, { id: newId, ...data }];
}

export function categoryEdit(
  prev: CategoryDef[],
  id: string,
  data: { label: string; color: string; icon: string },
): CategoryDef[] {
  return prev.map((c) => (c.id === id ? { ...c, ...data } : c));
}

/**
 * Removes the category and reassigns affected todos to `targetId`. Returns
 * the new state for both arrays, since both must be updated atomically.
 */
export function categoryDelete(
  todos: Todo[],
  categories: CategoryDef[],
  id: string,
): { categories: CategoryDef[]; todos: Todo[]; targetId: string | null } {
  if (categories.length <= 1) return { categories, todos, targetId: null };
  const remaining = categories.filter((c) => c.id !== id);
  const targetId = remaining[0].id;
  return {
    categories: remaining,
    todos: todos.map((td) =>
      td.category === id ? { ...td, category: targetId } : td,
    ),
    targetId,
  };
}

export function categoryReorder(
  prev: CategoryDef[],
  fromIdx: number,
  toIdx: number,
): CategoryDef[] {
  if (fromIdx === toIdx) return prev;
  const next = [...prev];
  const [item] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, item);
  return next;
}

// ---- Migration of stored todos at load time ------------------------------

/**
 * Sanitize a freshly-loaded todos array. Pass `categories` to also validate
 * that each todo's category id exists; pass `[]` (or omit) to skip that check
 * — useful when todos hydrate before categories are known. Field defaults
 * and trash-retention purge always run.
 */
export function migrateTodos(
  raw: unknown,
  categories: CategoryDef[] = [],
): Todo[] {
  if (!Array.isArray(raw)) return [];
  const validate = categories.length > 0;
  const validIds = new Set(categories.map((c) => c.id));
  const now = Date.now();
  const cutoff = now - TRASH_RETENTION_MS;
  return raw
    .map((td) => {
      const item = td as Partial<Todo>;
      const category = item.category;
      const merged: Todo = {
        id: typeof item.id === "number" ? item.id : Date.now() + Math.random(),
        text: typeof item.text === "string" ? item.text : "",
        done: !!item.done,
        priority: item.priority ?? "medium",
        dueDate: typeof item.dueDate === "string" ? item.dueDate : "",
        category:
          category && (!validate || validIds.has(category))
            ? category
            : undefined,
        trashed: !!item.trashed,
      };
      if (item.trashedAt != null) merged.trashedAt = item.trashedAt;
      if (merged.trashed && merged.trashedAt == null) merged.trashedAt = now;
      return merged;
    })
    .filter((td) => !(td.trashed && (td.trashedAt ?? 0) < cutoff));
}

// ---- Derived state -------------------------------------------------------

export interface EmptyState {
  title: string;
  hint?: string;
  ctaLabel?: string;
}

export interface DerivedState {
  filtered: Todo[];
  groups: TodoGroup[];
  inTrashView: boolean;
  totalOpen: number;
  visibleRemaining: number;
  completedCount: number;
  trashCount: number;
  active: Todo[];
  systemCounts: {
    all: number;
    overdue: number;
    open: number;
    done: number;
    trash: number;
  };
  byCategoryOpen: Record<string, number>; // open todos per category
  byCategoryTotal: Record<string, number>; // all (active) todos per category
  sectionLabel: string | null;
  subtitle: string;
  emptyState: EmptyState;
  defaultCategory: Category;
}

export interface DeriveInput {
  todos: Todo[];
  filter: Filter;
  categories: CategoryDef[];
  t: Strings;
  options?: { separateDone?: boolean };
}

export function deriveState(input: DeriveInput): DerivedState {
  const { todos, filter, categories, t, options = {} } = input;
  const today = todayLocal();
  const isOverdue = (td: Todo) =>
    !td.done && !!td.dueDate && td.dueDate < today;
  const active = todos.filter((td) => !td.trashed);

  const filtered = todos.filter((td) => {
    if (filter === "trash") return td.trashed;
    if (td.trashed) return false;
    if (filter === "done") return td.done;
    if (filter === "overdue") return isOverdue(td);
    if (filter === "open") return !td.done && !isOverdue(td);
    if (filter === "all") return true;
    if (isCategoryFilter(filter))
      return td.category === categoryIdFromFilter(filter);
    return true;
  });

  const inTrashView = filter === "trash";
  const groups = inTrashView
    ? []
    : buildGroups(filtered, {
        separateDone: options.separateDone ?? filter !== "done",
      });

  const totalOpen = active.filter((td) => !td.done).length;
  const completedCount = active.filter((td) => td.done).length;
  const trashCount = todos.filter((td) => td.trashed).length;
  const visibleRemaining = inTrashView
    ? filtered.length
    : filtered.filter((td) => !td.done).length;

  const byCategoryOpen: Record<string, number> = {};
  const byCategoryTotal: Record<string, number> = {};
  for (const c of categories) {
    const inCat = active.filter((td) => td.category === c.id);
    byCategoryOpen[c.id] = inCat.filter((td) => !td.done).length;
    byCategoryTotal[c.id] = inCat.length;
  }

  const systemCounts = {
    all: totalOpen,
    overdue: active.filter(isOverdue).length,
    open: active.filter((td) => !td.done && !isOverdue(td)).length,
    done: completedCount,
    trash: trashCount,
  };

  let sectionLabel: string | null = null;
  if (filter === "overdue") sectionLabel = t.filters.overdue;
  else if (filter === "open") sectionLabel = t.filters.open;
  else if (filter === "done") sectionLabel = t.filters.done;
  else if (filter === "trash") sectionLabel = t.filters.trash;
  else if (isCategoryFilter(filter)) {
    const id = categoryIdFromFilter(filter);
    const cat = categories.find((c) => c.id === id);
    sectionLabel = cat ? categoryLabel(cat, t) : null;
  }

  const filteredDone = filtered.filter((td) => td.done).length;
  const filteredOpen = filtered.length - filteredDone;
  const subtitle = inTrashView
    ? t.trashSubtitle(trashCount)
    : t.listSubtitle(filteredDone, filteredOpen);

  let emptyState: EmptyState;
  if (filter === "trash")
    emptyState = { title: t.emptyTrashTitle, hint: t.trashRetention };
  else if (filter === "done") emptyState = { title: t.emptyDoneTitle };
  else if (filter === "overdue") emptyState = { title: t.emptyOverdueTitle };
  else if (filter === "open") emptyState = { title: t.emptyOpenTitle };
  else if (filter === "all")
    emptyState = {
      title: t.emptyAllTitle,
      hint: t.emptyHint,
      ctaLabel: t.addFirstTask,
    };
  else {
    const id = categoryIdFromFilter(filter);
    const cat = categories.find((c) => c.id === id);
    emptyState = {
      title: t.emptyCategoryTitle(cat ? categoryLabel(cat, t) : ""),
      hint: t.emptyHint,
      ctaLabel: t.addFirstTask,
    };
  }

  const defaultCategory: Category = isCategoryFilter(filter)
    ? categoryIdFromFilter(filter)
    : (categories.find((c) => c.id === "school")?.id ??
      categories[0]?.id ??
      "home");

  return {
    filtered,
    groups,
    inTrashView,
    totalOpen,
    visibleRemaining,
    completedCount,
    trashCount,
    active,
    systemCounts,
    byCategoryOpen,
    byCategoryTotal,
    sectionLabel,
    subtitle,
    emptyState,
    defaultCategory,
  };
}
