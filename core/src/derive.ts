import {
  Category,
  Filter,
  Priority,
  Subtask,
  Todo,
  isCategoryFilter,
  categoryIdFromFilter,
} from "./types";
import { CategoryDef, categoryLabel } from "./categories";
import { buildGroups, TodoGroup } from "./groups";
import { genUuid, todayLocal } from "./utils";
import type { Strings } from "./i18n";

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// ---- Hard caps ----------------------------------------------------------
// Defensive limits applied at hydration and on writes. These guard against
// corrupt/malicious cloud data and runaway local state. Conservative —
// well above any realistic legitimate use.
export const MAX_TODO_TEXT_LEN = 4096;
export const MAX_TODOS_PER_USER = 10_000;
export const MAX_SUBTASK_TEXT_LEN = 1024;
export const MAX_SUBTASKS_PER_TODO = 100;

// ---- Pure mutation helpers ----------------------------------------------

export function newTodo(input: {
  text: string;
  priority: Priority;
  dueDate: string;
  category?: Category;
}): Todo {
  return {
    id: genUuid(),
    text: input.text.slice(0, MAX_TODO_TEXT_LEN),
    done: false,
    priority: input.priority,
    dueDate: input.dueDate,
    category: input.category,
    trashed: false,
    updatedAt: Date.now(),
  };
}

export function todoToggle(prev: Todo[], id: string): Todo[] {
  const now = Date.now();
  return prev.map((td) => {
    if (td.id !== id) return td;
    const nextDone = !td.done;
    // Propagate parent toggle to subtasks so the parent's done state stays
    // equal to subs.every(s => s.done). Avoids ambiguous "parent open, all
    // subs done" states.
    const nextSubs =
      td.subtasks && td.subtasks.length > 0
        ? td.subtasks.map((s) => (s.done === nextDone ? s : { ...s, done: nextDone }))
        : td.subtasks;
    const next: Todo = { ...td, done: nextDone, updatedAt: now };
    if (nextSubs !== undefined) next.subtasks = nextSubs;
    return next;
  });
}

export function subtaskAdd(prev: Todo[], todoId: string, text: string): Todo[] {
  const trimmed = text.trim().slice(0, MAX_SUBTASK_TEXT_LEN);
  if (!trimmed) return prev;
  const now = Date.now();
  return prev.map((td) => {
    if (td.id !== todoId) return td;
    const existing = td.subtasks ?? [];
    if (existing.length >= MAX_SUBTASKS_PER_TODO) return td;
    const newSub: Subtask = { id: genUuid(), text: trimmed, done: false };
    const nextSubs = [...existing, newSub];
    // Adding an open subtask invalidates a previously-done parent.
    const next: Todo = { ...td, subtasks: nextSubs, updatedAt: now };
    next.done = nextSubs.every((s) => s.done);
    return next;
  });
}

export function subtaskToggle(
  prev: Todo[],
  todoId: string,
  subId: string,
): Todo[] {
  const now = Date.now();
  return prev.map((td) => {
    if (td.id !== todoId || !td.subtasks) return td;
    const nextSubs = td.subtasks.map((s) =>
      s.id === subId ? { ...s, done: !s.done } : s,
    );
    return {
      ...td,
      subtasks: nextSubs,
      done: nextSubs.every((s) => s.done),
      updatedAt: now,
    };
  });
}

export function subtaskUpdateText(
  prev: Todo[],
  todoId: string,
  subId: string,
  text: string,
): Todo[] {
  const trimmed = text.slice(0, MAX_SUBTASK_TEXT_LEN);
  const now = Date.now();
  return prev.map((td) => {
    if (td.id !== todoId || !td.subtasks) return td;
    const nextSubs = td.subtasks.map((s) =>
      s.id === subId ? { ...s, text: trimmed } : s,
    );
    return { ...td, subtasks: nextSubs, updatedAt: now };
  });
}

export function subtaskRemove(
  prev: Todo[],
  todoId: string,
  subId: string,
): Todo[] {
  const now = Date.now();
  return prev.map((td) => {
    if (td.id !== todoId || !td.subtasks) return td;
    const nextSubs = td.subtasks.filter((s) => s.id !== subId);
    const next: Todo = { ...td, subtasks: nextSubs, updatedAt: now };
    // Only re-derive parent done when subs remain. If the list becomes empty,
    // leave whatever state the user last set on the parent.
    if (nextSubs.length > 0) next.done = nextSubs.every((s) => s.done);
    return next;
  });
}

export function todoMoveToTrash(prev: Todo[], id: string): Todo[] {
  const now = Date.now();
  return prev.map((td) =>
    td.id === id ? { ...td, trashed: true, trashedAt: now, updatedAt: now } : td,
  );
}

export function todoRestoreFromTrash(prev: Todo[], id: string): Todo[] {
  const now = Date.now();
  return prev.map((td) => {
    if (td.id !== id) return td;
    const { trashedAt: _t, ...rest } = td;
    return { ...rest, trashed: false, updatedAt: now };
  });
}

export function todoPermanentlyDelete(prev: Todo[], id: string): Todo[] {
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
  id: string,
  field: K,
  value: Todo[K],
): Todo[] {
  const now = Date.now();
  return prev.map((td) => {
    if (td.id !== id) return td;
    const next = { ...td, [field]: value, updatedAt: now };
    if (field === "text" && typeof value === "string") {
      next.text = value.slice(0, MAX_TODO_TEXT_LEN);
    }
    return next;
  });
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
 * — useful when todos hydrate before categories are known. Field defaults,
 * trash-retention purge, and hard caps always run.
 *
 * Hardening:
 * - Numeric legacy ids → stringified (one-time conversion to UUID-shaped strings).
 * - text > MAX_TODO_TEXT_LEN truncated.
 * - Array length capped at MAX_TODOS_PER_USER (defends against malicious cloud push).
 * - Type-narrowing: non-string ids/text/dueDate, non-Priority priorities all rejected.
 * - Duplicate ids deduped (last write wins by updatedAt).
 */
export function migrateTodos(
  raw: unknown,
  categories: CategoryDef[] = [],
): Todo[] {
  if (!Array.isArray(raw)) return [];
  const validate = categories.length > 0;
  const validCatIds = new Set(categories.map((c) => c.id));
  const validPriorities = new Set<Priority>(["high", "medium", "low"]);
  const now = Date.now();
  const cutoff = now - TRASH_RETENTION_MS;

  const seen = new Map<string, Todo>();
  for (const td of raw.slice(0, MAX_TODOS_PER_USER)) {
    if (typeof td !== "object" || td === null || Array.isArray(td)) continue;
    const item = td as Partial<Todo> & { id?: unknown };

    let id: string;
    if (typeof item.id === "string" && item.id.length > 0) {
      id = item.id;
    } else if (typeof item.id === "number" && Number.isFinite(item.id)) {
      // Legacy v0 numeric id — keep stable across migrations.
      id = String(item.id);
    } else {
      id = genUuid();
    }

    const text =
      typeof item.text === "string"
        ? item.text.slice(0, MAX_TODO_TEXT_LEN)
        : "";
    const priority: Priority = validPriorities.has(item.priority as Priority)
      ? (item.priority as Priority)
      : "medium";
    const dueDate = typeof item.dueDate === "string" ? item.dueDate : "";
    const category =
      typeof item.category === "string" &&
      (!validate || validCatIds.has(item.category))
        ? item.category
        : undefined;
    const trashed = !!item.trashed;
    const trashedAt =
      typeof item.trashedAt === "number"
        ? item.trashedAt
        : trashed
          ? now
          : undefined;
    const updatedAt =
      typeof item.updatedAt === "number" ? item.updatedAt : undefined;

    if (trashed && (trashedAt ?? 0) < cutoff) continue;

    // Subtasks: sanitize/cap each entry. Drop garbage so a malicious cloud
    // push can't smuggle bad shapes through.
    let subtasks: Subtask[] | undefined;
    if (Array.isArray(item.subtasks)) {
      const cleaned: Subtask[] = [];
      const subSeen = new Set<string>();
      for (const sRaw of item.subtasks.slice(0, MAX_SUBTASKS_PER_TODO)) {
        if (typeof sRaw !== "object" || sRaw === null || Array.isArray(sRaw)) continue;
        const s = sRaw as Partial<Subtask>;
        const sid =
          typeof s.id === "string" && s.id.length > 0 ? s.id : genUuid();
        if (subSeen.has(sid)) continue;
        subSeen.add(sid);
        const sText =
          typeof s.text === "string" ? s.text.slice(0, MAX_SUBTASK_TEXT_LEN) : "";
        cleaned.push({ id: sid, text: sText, done: !!s.done });
      }
      if (cleaned.length > 0) subtasks = cleaned;
    }

    const merged: Todo = {
      id,
      text,
      // When subtasks exist, derive parent done from them so the invariant
      // (parent.done === subs.every(done)) holds even if stored data drifted.
      done: subtasks && subtasks.length > 0 ? subtasks.every((s) => s.done) : !!item.done,
      priority,
      dueDate,
      category,
      trashed,
    };
    if (trashedAt != null) merged.trashedAt = trashedAt;
    if (updatedAt != null) merged.updatedAt = updatedAt;
    if (subtasks) merged.subtasks = subtasks;

    // Dedupe by id — last write (or higher updatedAt) wins.
    const existing = seen.get(id);
    if (
      !existing ||
      (merged.updatedAt ?? 0) >= (existing.updatedAt ?? 0)
    ) {
      seen.set(id, merged);
    }
  }
  return Array.from(seen.values());
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
