import {
  Category,
  Filter,
  Priority,
  Recurrence,
  RecurrenceFreq,
  Subtask,
  Todo,
  isCategoryFilter,
  categoryIdFromFilter,
} from "./types";
import { CategoryDef, categoryLabel } from "./categories";
import { buildGroups, TodoGroup } from "./groups";
import { genUuid, todayLocal, nextOccurrence, expandRecurrence } from "./utils";
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
  recurrence?: Recurrence;
  subtasks?: Subtask[];
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
    ...(input.recurrence ? { recurrence: input.recurrence } : {}),
    ...(input.subtasks && input.subtasks.length > 0 ? { subtasks: input.subtasks } : {}),
  };
}

/**
 * Deep-clone a subtask list with fresh ids and `done: false`. Used when
 * generating recurring instances so each copy starts blank and is
 * independently togglable.
 */
function cloneSubtasksFresh(subs: Subtask[] | undefined): Subtask[] | undefined {
  if (!subs || subs.length === 0) return undefined;
  return subs.map((s) => ({ ...s, id: genUuid(), done: false }));
}

/**
 * Generate one Todo per occurrence of a recurring task between dueDate and
 * recurrence.endDate (inclusive). Each instance gets:
 *  - a fresh id and updatedAt
 *  - its own dueDate (from the expansion)
 *  - a deep copy of the template's subtasks (with new ids, all undone)
 *  - the recurrence definition copied verbatim (so the instance can show
 *    "↻ Monthly · ends Aug 15" in its meta row)
 *
 * Falls back to a single rolling task when recurrence has no endDate
 * (legacy / open-ended). Caps at MAX_RECURRENCE_INSTANCES (365) inside
 * expandRecurrence.
 */
export function generateRecurringInstances(input: {
  text: string;
  priority: Priority;
  dueDate: string;
  category?: Category;
  recurrence: Recurrence;
  subtasks?: Subtask[];
}): Todo[] {
  if (!input.recurrence.endDate) {
    // Open-ended series — one rolling task (legacy behavior preserved).
    return [
      newTodo({
        text: input.text,
        priority: input.priority,
        dueDate: input.dueDate,
        category: input.category,
        recurrence: input.recurrence,
        subtasks: cloneSubtasksFresh(input.subtasks),
      }),
    ];
  }
  const dates = expandRecurrence(input.dueDate, input.recurrence.endDate, input.recurrence);
  if (dates.length === 0) return [];
  const now = Date.now();
  // One seriesId per generation pass — every instance shares it so we can
  // bulk-delete future siblings without text matching.
  const seriesId = genUuid();
  return dates.map((date) => ({
    id: genUuid(),
    text: input.text.slice(0, MAX_TODO_TEXT_LEN),
    done: false,
    priority: input.priority,
    dueDate: date,
    category: input.category,
    trashed: false,
    updatedAt: now,
    recurrence: input.recurrence,
    seriesId,
    ...(input.subtasks && input.subtasks.length > 0
      ? { subtasks: cloneSubtasksFresh(input.subtasks) }
      : {}),
  }));
}

/**
 * Returns true if the transition from `before` → `after` counts as a pebble-
 * earning completion. A completion is either a non-recurring task flipping
 * done false → true, or a recurring task whose dueDate rolled forward (the
 * user finished an occurrence even though `done` stays false).
 */
export function didEarnPebble(before: Todo | undefined, after: Todo | undefined): boolean {
  if (!before || !after) return false;
  if (!before.done && after.done) return true;
  if (before.recurrence && after.recurrence && before.dueDate !== after.dueDate) return true;
  return false;
}

export function todoToggle(prev: Todo[], id: string): Todo[] {
  const now = Date.now();
  return prev.map((td) => {
    if (td.id !== id) return td;
    // Legacy rolling behavior: only when a recurring task has NO endDate.
    // Multi-instance recurring tasks (with endDate) are pre-expanded at
    // creation time, so each instance toggles like a normal task.
    if (
      !td.done &&
      td.recurrence &&
      !td.recurrence.endDate &&
      td.dueDate
    ) {
      const rolled = nextOccurrence(
        td.dueDate,
        td.recurrence.freq,
        td.recurrence.interval ?? 1,
        td.recurrence.byWeekday,
        td.recurrence.bySetPos,
      );
      return {
        ...td,
        dueDate: rolled,
        done: false,
        updatedAt: now,
        subtasks: td.subtasks?.map((s) =>
          s.done ? { ...s, done: false } : s,
        ),
      };
    }
    // For tasks with subtasks: toggling the parent cascades to all subtasks.
    if (td.subtasks && td.subtasks.length > 0) {
      const nextDone = !td.done;
      return {
        ...td,
        done: nextDone,
        updatedAt: now,
        subtasks: td.subtasks.map((s) =>
          s.done === nextDone ? s : { ...s, done: nextDone },
        ),
      };
    }
    return { ...td, done: !td.done, updatedAt: now };
  });
}

export function subtaskAdd(
  prev: Todo[],
  todoId: string,
  text: string,
  priority: Priority = "medium",
  dueDate: string = "",
): Todo[] {
  const trimmed = text.trim().slice(0, MAX_SUBTASK_TEXT_LEN);
  if (!trimmed) return prev;
  const now = Date.now();
  return prev.map((td) => {
    if (td.id !== todoId) return td;
    const existing = td.subtasks ?? [];
    if (existing.length >= MAX_SUBTASKS_PER_TODO) return td;
    const newSub: Subtask = {
      id: genUuid(),
      text: trimmed,
      done: false,
      priority,
      dueDate,
    };
    const nextSubs = [...existing, newSub];
    // If the new sub's date is later than the parent's, push the parent's
    // dueDate forward so the parent never finishes before its sub. ISO
    // YYYY-MM-DD strings sort lexically.
    const nextParentDueDate =
      dueDate && td.dueDate && dueDate > td.dueDate ? dueDate : td.dueDate;
    // Adding an open subtask invalidates a previously-done parent.
    const next: Todo = {
      ...td,
      subtasks: nextSubs,
      dueDate: nextParentDueDate,
      updatedAt: now,
    };
    next.done = nextSubs.every((s) => s.done);
    return next;
  });
}

export function subtaskUpdatePriority(
  prev: Todo[],
  todoId: string,
  subId: string,
  priority: Priority,
): Todo[] {
  const now = Date.now();
  return prev.map((td) => {
    if (td.id !== todoId || !td.subtasks) return td;
    const nextSubs = td.subtasks.map((s) =>
      s.id === subId ? { ...s, priority } : s,
    );
    return { ...td, subtasks: nextSubs, updatedAt: now };
  });
}

export function subtaskUpdateDueDate(
  prev: Todo[],
  todoId: string,
  subId: string,
  dueDate: string,
): Todo[] {
  const now = Date.now();
  return prev.map((td) => {
    if (td.id !== todoId || !td.subtasks) return td;
    const nextSubs = td.subtasks.map((s) =>
      s.id === subId ? { ...s, dueDate } : s,
    );
    // Push parent's dueDate forward if the new sub date is later.
    // (Parent with no date stays empty — comparison is undefined.)
    const nextParentDueDate =
      dueDate && td.dueDate && dueDate > td.dueDate ? dueDate : td.dueDate;
    return {
      ...td,
      subtasks: nextSubs,
      dueDate: nextParentDueDate,
      updatedAt: now,
    };
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

/**
 * Display-layer ordering for subtasks: open before done, then earliest
 * due date first (no date last), then high priority first. Pure — caller
 * keeps the original storage order intact.
 */
const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
export function sortedSubs(subs: Subtask[]): Subtask[] {
  return [...subs].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const ad = a.dueDate || "";
    const bd = b.dueDate || "";
    if (ad !== bd) {
      if (!ad) return 1;
      if (!bd) return -1;
      return ad < bd ? -1 : 1;
    }
    const ap = PRIORITY_RANK[a.priority ?? "medium"];
    const bp = PRIORITY_RANK[b.priority ?? "medium"];
    return ap - bp;
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

/**
 * Apply text / priority / category from a target instance to all future
 * non-trashed siblings in the same series (dueDate >= target's). Past
 * siblings are not touched — they're history. No-op when the target
 * has no seriesId.
 */
export function todoApplySeriesFutureEdits(
  prev: Todo[],
  id: string,
  fields: { text?: string; priority?: Priority; category?: Category | undefined },
): { next: Todo[]; affected: number } {
  const target = prev.find((t) => t.id === id);
  if (!target || !target.seriesId) return { next: prev, affected: 0 };
  const cutoff = target.dueDate;
  const now = Date.now();
  let affected = 0;
  const next = prev.map((td) => {
    if (td.id === id) return td;
    if (td.seriesId !== target.seriesId) return td;
    if (td.trashed) return td;
    if (cutoff && td.dueDate && td.dueDate < cutoff) return td;
    affected += 1;
    const merged: Todo = { ...td, updatedAt: now };
    if (fields.text !== undefined) merged.text = fields.text.slice(0, MAX_TODO_TEXT_LEN);
    if (fields.priority !== undefined) merged.priority = fields.priority;
    if (fields.category !== undefined) merged.category = fields.category;
    return merged;
  });
  return { next, affected };
}

/**
 * Trashes the targeted todo plus every other non-trashed todo in the same
 * recurring series with a dueDate >= the target's dueDate. Past instances
 * are intentionally left alone — the user is removing "this and the rest
 * of the series", not rewriting history.
 *
 * Falls back to a single-todo trash when the target has no seriesId (e.g.
 * legacy rolling recurrences or non-series todos).
 */
export function todoMoveToTrashFutureSeries(prev: Todo[], id: string): { next: Todo[]; affected: number } {
  const target = prev.find((t) => t.id === id);
  if (!target) return { next: prev, affected: 0 };
  if (!target.seriesId) {
    return { next: todoMoveToTrash(prev, id), affected: 1 };
  }
  const cutoff = target.dueDate;
  const now = Date.now();
  let affected = 0;
  const next = prev.map((td) => {
    if (td.seriesId !== target.seriesId) return td;
    if (td.trashed) return td;
    if (cutoff && td.dueDate && td.dueDate < cutoff) return td;
    affected += 1;
    return { ...td, trashed: true, trashedAt: now, updatedAt: now };
  });
  return { next, affected };
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

/**
 * Move all completed-and-not-yet-trashed todos to trash (soft delete).
 * Consistent with moveToTrash — items live in the 30-day trash and can be
 * restored. Replaces the prior hard-delete behavior.
 */
export function todoClearDone(prev: Todo[]): { todos: Todo[]; trashedIds: string[] } {
  const now = Date.now();
  const trashedIds: string[] = [];
  const todos = prev.map((td) => {
    if (td.done && !td.trashed) {
      trashedIds.push(td.id);
      return { ...td, trashed: true, trashedAt: now, updatedAt: now };
    }
    return td;
  });
  return { todos, trashedIds };
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
): { categories: CategoryDef[]; todos: Todo[]; deleted: boolean } {
  if (categories.length <= 1) return { categories, todos, deleted: false };
  const remaining = categories.filter((c) => c.id !== id);
  const now = Date.now();
  return {
    categories: remaining,
    todos: todos.map((td) =>
      td.category === id && !td.trashed
        ? { ...td, trashed: true, trashedAt: now, updatedAt: now }
        : td,
    ),
    deleted: true,
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
        const sPriority: Priority = validPriorities.has(s.priority as Priority)
          ? (s.priority as Priority)
          : "medium";
        const sDueDate = typeof s.dueDate === "string" ? s.dueDate : "";
        cleaned.push({
          id: sid,
          text: sText,
          done: !!s.done,
          priority: sPriority,
          dueDate: sDueDate,
        });
      }
      if (cleaned.length > 0) subtasks = cleaned;
    }

    // Recurrence: validate freq is in the allow-list; drop if malformed.
    let recurrence: Recurrence | undefined;
    if (item.recurrence && typeof item.recurrence === "object" && !Array.isArray(item.recurrence)) {
      const r = item.recurrence as Partial<Recurrence>;
      const validFreqs = new Set<RecurrenceFreq>(["daily", "weekly", "monthly", "yearly"]);
      if (validFreqs.has(r.freq as RecurrenceFreq)) {
        recurrence = { freq: r.freq as RecurrenceFreq };
        if (typeof r.interval === "number" && Number.isFinite(r.interval) && r.interval >= 1) {
          recurrence.interval = Math.floor(r.interval);
        }
        if (Array.isArray(r.byWeekday)) {
          const days = r.byWeekday
            .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 6)
            .map((n) => Math.floor(n));
          const unique = Array.from(new Set(days)).sort();
          if (unique.length > 0) recurrence.byWeekday = unique;
        }
        if (Array.isArray(r.bySetPos)) {
          const pos = r.bySetPos
            .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && ((n >= 1 && n <= 5) || n === -1))
            .map((n) => Math.floor(n));
          const unique = Array.from(new Set(pos));
          if (unique.length > 0) recurrence.bySetPos = unique;
        }
      }
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
    if (recurrence) merged.recurrence = recurrence;

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
  // "Carried over" / overdue counts every task whose dueDate is before today,
  // including tasks the user already completed. The done state is meaningful
  // history (you finished it, even if late), so it surfaces here too.
  const isOverdue = (td: Todo) =>
    !!td.dueDate && td.dueDate < today;
  const active = todos.filter((td) => !td.trashed);

  const filtered = todos.filter((td) => {
    // "All" shows everything: open, done, AND trashed in one combined list.
    // Other filters honor the trashed/active split as before.
    if (filter === "all") return true;
    if (filter === "trash") return td.trashed;
    if (td.trashed) return false;
    if (filter === "done") return td.done;
    if (filter === "overdue") return isOverdue(td);
    // "Open" includes carried-over (overdue) items — every unfinished task,
    // whether it's still on schedule or already past due. The separate
    // "Overdue" filter still exists for the user who wants only past-due.
    if (filter === "open") return !td.done;
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
    // Total reflects every to-do ever placed in this category — open +
    // done + trashed. Matches the All pill's inclusive scope so the
    // counts in the picker sheet read consistently.
    byCategoryTotal[c.id] = todos.filter((td) => td.category === c.id).length;
  }

  const systemCounts = {
    // "All" includes open, done, and trashed — the total of every task in
    // the store. Sub-filters still mirror their narrower scopes.
    all: totalOpen + completedCount + trashCount,
    // Carried-over count includes trashed past-due items too — matches the
    // All pill's inclusive scope. The Carried-over filter view itself still
    // excludes trashed (consistent with other status filters).
    overdue: todos.filter(isOverdue).length,
    open: active.filter((td) => !td.done).length,
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
  else if (filter === "done")
    emptyState = { title: t.emptyDoneTitle, hint: t.emptyDoneHint };
  else if (filter === "overdue")
    emptyState = { title: t.emptyOverdueTitle, hint: t.emptyOverdueHint };
  else if (filter === "open")
    emptyState = { title: t.emptyOpenTitle, hint: t.emptyOpenHint };
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
