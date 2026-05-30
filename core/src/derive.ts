import {
  Category,
  Filter,
  Priority,
  Recurrence,
  RecurrenceFreq,
  Subtask,
  Todo,
  TodoReference,
  isCategoryFilter,
  categoryIdFromFilter,
  isPriorityFilter,
  priorityFromFilter,
  PRIORITY_VALUES,
} from "./types";
import { CategoryDef, categoryLabel } from "./categories";
import { buildGroups, TodoGroup } from "./groups";
import { genUuid, todayLocal, nextOccurrence, expandRecurrence, MAX_RECURRENCE_INSTANCES } from "./utils";
import type { Strings } from "./i18n";

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Compose-suggestion history cap. Stored separately from `Todo[]`
 * (see TodoReference + recordTodoReference) so it survives the 30-day
 * trash purge and stays compact regardless of how active the user is.
 * 500 entries covers ~a year of unique recurring/one-off items for a
 * typical user; old entries fall off LRU-style as the cap is hit.
 */
export const MAX_TODO_REFERENCES = 500;

// ---- Hard caps ----------------------------------------------------------
// Defensive limits applied at hydration and on writes. These guard against
// corrupt/malicious cloud data and runaway local state. Conservative —
// well above any realistic legitimate use.
export const MAX_TODO_TEXT_LEN = 4096;
export const MAX_TODOS_PER_USER = 10_000;
export const MAX_SUBTASK_TEXT_LEN = 1024;
export const MAX_SUBTASKS_PER_TODO = 100;
// Notes are intentionally generous (a few pages of free-form text) — the
// field is meant to absorb anxiety-driven externalization, not be a tight
// metadata slot.
export const MAX_TODO_NOTES_LEN = 8192;

// ---- Pure mutation helpers ----------------------------------------------

export function newTodo(input: {
  text: string;
  priority: Priority;
  dueDate: string;
  category?: Category;
  recurrence?: Recurrence;
  subtasks?: Subtask[];
  notes?: string;
  reminder?: Todo["reminder"];
}): Todo {
  const notes =
    typeof input.notes === "string" && input.notes.length > 0
      ? input.notes.slice(0, MAX_TODO_NOTES_LEN)
      : undefined;
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
    ...(notes ? { notes } : {}),
    ...(input.reminder?.at ? { reminder: input.reminder } : {}),
  };
}

/**
 * Strip the optional time suffix from a dueDate. Used everywhere the
 * date is bucketed/compared/grouped, since time-bearing todos must
 * sort into the same bucket as their date-only siblings on the same
 * day. Empty input returns empty.
 */
export function dueDateOnly(dueDate: string | undefined): string {
  if (!dueDate) return "";
  const t = dueDate.indexOf("T");
  return t === -1 ? dueDate : dueDate.slice(0, t);
}

/**
 * When a recurrence has a weekday filter, the dueDate is the FIRST
 * occurrence of the series — it must fall on one of the listed
 * weekdays. If `dueDate` is empty or its weekday isn't in
 * recurrence.byWeekday, snap forward to the next matching day
 * (starting from dueDate, or today if empty). Preserves any time
 * suffix on dueDate. No-op for recurrences without byWeekday and
 * for dueDates that already match.
 *
 * Example: today=Sat, recurrence={freq:weekly, byWeekday:[3]} (Wed)
 *  → returns next Wednesday's ISO date.
 */
export function snapDueDateToRecurrence(
  dueDate: string,
  recurrence: { byWeekday?: number[] } | undefined,
): string {
  if (!recurrence?.byWeekday || recurrence.byWeekday.length === 0) {
    return dueDate;
  }
  const dateOnly = dueDateOnly(dueDate);
  const base = dateOnly ? new Date(`${dateOnly}T00:00:00`) : new Date();
  if (Number.isNaN(base.valueOf())) return dueDate;
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.valueOf());
    d.setDate(d.getDate() + i);
    if (recurrence.byWeekday.includes(d.getDay())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const datePart = `${y}-${m}-${day}`;
      const tIdx = dueDate.indexOf("T");
      return tIdx === -1 ? datePart : datePart + dueDate.slice(tIdx);
    }
  }
  return dueDate;
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
 * Roll a local-datetime string forward by the same day-delta between
 * the old and new dueDate. Preserves the time-of-day the user set
 * (e.g., "remind 1h before pickup at 2pm" stays "1h before 2pm" on
 * the next occurrence). Falls back to the original value if any
 * input fails to parse — better to leave the reminder where it is
 * than to drop it silently.
 */
function rollDateTime(at: string, fromDate: string, toDate: string): string {
  // Strip time suffixes from the date inputs so the day-delta is
  // purely date-based — recurrence rolls by whole days, not by the
  // time-of-day of the dueDate.
  const from = new Date(dueDateOnly(fromDate) + "T00:00:00");
  const to = new Date(dueDateOnly(toDate) + "T00:00:00");
  const remind = new Date(at);
  if (Number.isNaN(from.valueOf()) || Number.isNaN(to.valueOf()) || Number.isNaN(remind.valueOf())) {
    return at;
  }
  const deltaMs = to.valueOf() - from.valueOf();
  const next = new Date(remind.valueOf() + deltaMs);
  // Return the same `yyyy-mm-ddTHH:mm` shape we stored (local time,
  // no timezone suffix). Reconstructing via getFullYear/etc. keeps
  // the original local hour even across DST changes (deltaMs would
  // shift it by an hour otherwise).
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  const hh = String(remind.getHours()).padStart(2, "0");
  const mm = String(remind.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

/**
 * Build the initial Todo for a recurring series. Always one rolling
 * instance, regardless of whether the recurrence has an endDate —
 * todoToggle advances dueDate to the next occurrence on each completion
 * and caps the series when the next occurrence would exceed endDate.
 *
 * Previously (before 2026-05-19) endDate triggered a full expansion at
 * creation time, dumping every future instance into the list at once.
 * That overwhelmed the active view for any non-trivial series and made
 * "I finished one" feel indistinguishable from "I finished none". The
 * rolling model surfaces exactly one actionable row, with the Done bin
 * showing one capped snapshot per completed occurrence.
 */
export function generateRecurringInstances(input: {
  text: string;
  priority: Priority;
  dueDate: string;
  category?: Category;
  recurrence: Recurrence;
  subtasks?: Subtask[];
  notes?: string;
}): Todo[] {
  return [
    newTodo({
      text: input.text,
      priority: input.priority,
      dueDate: input.dueDate,
      category: input.category,
      recurrence: input.recurrence,
      subtasks: cloneSubtasksFresh(input.subtasks),
      notes: input.notes,
    }),
  ];
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

/**
 * Net pebble change for a single Todo's transition. Used by every mutation
 * path that can affect pebble counts (toggle, moveToTrash, restoreFromTrash)
 * so the math is one place — not duplicated across call sites where it can
 * drift apart (root cause of B3, where moveToTrash silently skipped pebbles
 * the toggle path awarded).
 *
 * `task` is the parent's contribution: -1 / 0 / +1.
 *   • +1 on done false → true (any path)
 *   • -1 on done true → false
 *   • +1 on a recurring rolling completion (dueDate moved, done stays false)
 *
 * `subtask` is the net of every per-sub transition under this todo. Indexed
 * by position in the subs array — added/removed subs don't contribute (an
 * add isn't a completion; a remove deletes the pebble's source-of-truth too).
 */
export interface PebbleDelta {
  task: -1 | 0 | 1;
  subtask: number;
}

export function pebbleDelta(
  before: Todo | undefined,
  after: Todo | undefined,
): PebbleDelta {
  if (!before || !after) return { task: 0, subtask: 0 };
  let task: -1 | 0 | 1 = 0;
  if (!before.done && after.done) task = 1;
  else if (before.done && !after.done) task = -1;
  else if (
    before.recurrence &&
    after.recurrence &&
    before.dueDate !== after.dueDate &&
    !before.done &&
    !after.done
  )
    task = 1;
  const beforeSubs = before.subtasks ?? [];
  const afterSubs = after.subtasks ?? [];
  let subtask = 0;
  for (let i = 0; i < beforeSubs.length; i++) {
    const b = beforeSubs[i];
    const a = afterSubs[i];
    if (!a) continue;
    if (!b.done && a.done) subtask += 1;
    else if (b.done && !a.done) subtask -= 1;
  }
  return { task, subtask };
}

/**
 * Marks a Todo as done (or un-marks it). Done items also flip the
 * `trashed` flag with a `trashedAt` stamp — they sit in the 30-day
 * Done bin until either the user un-checks them (restored to open)
 * or the auto-purge removes them. There's no separate Trash bucket
 * any more; "done" and "removed" are one concept with one timeline.
 *
 * When the todo has subtasks, parent.done is a derived value (true iff
 * every subtask is done). Direct toggling of the parent is therefore a
 * no-op — the user must toggle subtasks individually. Locked in by
 * core.test.ts ("todoToggle is a no-op when subs exist").
 *
 * Series instances (R3 — `seriesId` + `recurrence`) take a different
 * path: completing the row marks it done in place (no snapshot, no
 * dueDate roll — the next instance is already materialized) and
 * appends one fresh tail via `topUpSeries` so the user always has the
 * next occurrence queued. Un-doing simply clears the flags and leaves
 * the tail alone.
 *
 * Legacy rolling recurrences (no `seriesId` — should be unreachable
 * after the R2 migration) still hit the original snapshot+roll path
 * as a defensive fallback. When `recurrence.endDate` is set and the
 * next occurrence would exceed it, only the snapshot is emitted.
 *
 * `todayISO` defaults to `todayLocal()` so existing callers stay the
 * same; tests pass an explicit value for determinism.
 */
export function todoToggle(prev: Todo[], id: string, todayISO?: string): Todo[] {
  const now = Date.now();
  const today = todayISO ?? todayLocal();
  const target = prev.find((td) => td.id === id);
  if (!target) return prev;

  // Series instance: mark done/un-do in place, no snapshot, no
  // dueDate roll. On completion, append one tail so the user always
  // sees the next occurrence queued. Parent-with-subs rule still
  // applies (toggling the parent is a no-op when subs exist).
  if (target.seriesId && target.recurrence) {
    if (target.subtasks && target.subtasks.length > 0) return prev;
    const nextDone = !target.done;
    const updated = prev.map((td) => {
      if (td.id !== id) return td;
      const upd: Todo = {
        ...td,
        done: nextDone,
        trashed: nextDone,
        updatedAt: now,
      };
      if (nextDone) {
        upd.trashedAt = now;
        upd.completionDate = today;
        // Done items don't need a future reminder. The scheduler
        // diffs on this field and cancels every queued fire.
        delete upd.reminder;
      } else {
        delete upd.trashedAt;
        delete upd.completionDate;
      }
      return upd;
    });
    // Only on completion do we extend the tail — un-doing must not
    // generate a brand-new instance the user didn't ask for. Use the
    // append-one helper (distinct from the window-driven topUpSeries
    // used by migration / app-open): "1 completion = 1 new tail"
    // keeps the visible count stable as the user works through it.
    return nextDone
      ? appendNextSeriesInstance(updated, target.seriesId)
      : updated;
  }

  return prev.flatMap((td) => {
    if (td.id !== id) return [td];
    if (
      !td.done &&
      td.recurrence &&
      td.dueDate
    ) {
      const rolled = nextOccurrence(
        td.dueDate,
        td.recurrence.freq,
        td.recurrence.interval ?? 1,
        td.recurrence.byWeekday,
        td.recurrence.bySetPos,
      );
      // Snapshot of the just-completed occurrence — frozen at the
      // completed dueDate, in the Done bin, with the recurrence capped
      // at that date so the snapshot still shows the repeat icon as a
      // self-contained "series of one" record.
      const snapshot: Todo = {
        id: genUuid(),
        text: td.text,
        done: true,
        priority: td.priority,
        dueDate: td.dueDate,
        category: td.category,
        trashed: true,
        trashedAt: now,
        updatedAt: now,
        completionDate: today,
        recurrence: { ...td.recurrence, endDate: td.dueDate },
      };
      if (td.notes) snapshot.notes = td.notes;
      // If endDate caps the series and the next occurrence is past it,
      // we're done — emit only the snapshot. Otherwise roll forward as
      // a fresh open instance.
      if (td.recurrence.endDate && rolled > td.recurrence.endDate) {
        return [snapshot];
      }
      const rolledNext: Todo = {
        ...td,
        dueDate: rolled,
        done: false,
        updatedAt: now,
        subtasks: td.subtasks?.map((s) =>
          s.done ? { ...s, done: false } : s,
        ),
      };
      // Reminder rolls forward by the same day-delta as dueDate.
      // The snapshot stays reminder-free — a past occurrence's
      // reminder firing would be noise, and Notifications.cancel
      // for the original id covers the existing scheduled ones.
      if (td.reminder?.at) {
        rolledNext.reminder = {
          at: rollDateTime(td.reminder.at, td.dueDate, rolled),
          ...(td.reminder.intervalMinutes ? { intervalMinutes: td.reminder.intervalMinutes } : {}),
          ...(td.reminder.until ? { until: rollDateTime(td.reminder.until, td.dueDate, rolled) } : {}),
        };
      }
      delete (snapshot as Todo).reminder;
      return [rolledNext, snapshot];
    }
    // Parent.done is derived from subs — toggling the parent directly is
    // a no-op. The user expands the row and toggles subs to mark progress.
    if (td.subtasks && td.subtasks.length > 0) return [td];
    const nextDone = !td.done;
    const next: Todo = {
      ...td,
      done: nextDone,
      trashed: nextDone,
      updatedAt: now,
    };
    if (nextDone) {
      next.trashedAt = now;
      next.completionDate = today;
      // Done items don't need a future reminder. The scheduler
      // diffs on this field and cancels every queued fire.
      delete next.reminder;
    } else {
      delete next.trashedAt;
      delete next.completionDate;
    }
    return [next];
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
    // Default the new step's dueDate to the parent's when the caller
    // didn't supply one. Initial-only — subtaskUpdateDueDate (the edit
    // path) accepts empty without re-defaulting, so a user who clears
    // the date later sees it stay cleared.
    const effectiveDueDate = dueDate || td.dueDate || "";
    const newSub: Subtask = {
      id: genUuid(),
      text: trimmed,
      done: false,
      priority,
      dueDate: effectiveDueDate,
    };
    const nextSubs = [...existing, newSub];
    // If the new sub's date is later than the parent's, push the parent's
    // dueDate forward so the parent never finishes before its sub. ISO
    // YYYY-MM-DD strings sort lexically.
    const nextParentDueDate =
      effectiveDueDate && td.dueDate && effectiveDueDate > td.dueDate
        ? effectiveDueDate
        : td.dueDate;
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
    // Parent's dueDate tracks the LATEST sub due date — every change
    // to any sub recalculates the max across all subs. ISO yyyy-mm-dd
    // strings sort lexically. If no sub has a date, the parent keeps
    // its existing date so we don't accidentally clear it.
    const maxSubDate = nextSubs.reduce<string>((acc, s) => {
      if (s.dueDate && s.dueDate > acc) return s.dueDate;
      return acc;
    }, '');
    const nextParentDueDate = maxSubDate || td.dueDate;
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
  const today = todayLocal();
  return prev.map((td) => {
    if (td.id !== todoId || !td.subtasks) return td;
    const nextSubs = td.subtasks.map((s) => {
      if (s.id !== subId) return s;
      const nextS = { ...s, done: !s.done };
      // Stamp per-sub completionDate so Home's daily / weekly / monthly
      // stats can bucket sub completions alongside parent completions.
      if (nextS.done) nextS.completionDate = today;
      else delete nextS.completionDate;
      return nextS;
    });
    const nextDone = nextSubs.every((s) => s.done);
    const wasDone = !!td.done;
    const next: Todo = {
      ...td,
      subtasks: nextSubs,
      done: nextDone,
      updatedAt: now,
    };
    // Mirror todoToggle's Done-bin merge: a fully-done parent should
    // also be `trashed: true` with a `trashedAt` so every filter and
    // sync layer treats it identically to a directly-checked todo.
    // Un-cascading (a sub goes from done back to open) clears all
    // three flags so the parent comes back to the active list.
    if (nextDone && !wasDone) {
      next.completionDate = today;
      next.trashed = true;
      next.trashedAt = now;
    } else if (!nextDone && wasDone) {
      delete next.completionDate;
      next.trashed = false;
      delete next.trashedAt;
    }
    return next;
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

/**
 * Remove every subtask from a todo in one shot. Used by the "Clear
 * all" action in TaskDetailsModal/Sheet. Leaves the parent's done
 * state untouched (no re-derivation), mirroring subtaskRemove's
 * behavior when the list reaches empty — the user owns the parent
 * state once subs are gone.
 */
export function subtaskClearAll(prev: Todo[], todoId: string): Todo[] {
  const now = Date.now();
  return prev.map((td) => {
    if (td.id !== todoId) return td;
    if (!td.subtasks || td.subtasks.length === 0) return td;
    // Drop the field entirely (vs. setting []) so the persisted doc
    // stays minimal and matches a never-had-subtasks todo. Matches
    // newTodo's "omit when empty" pattern.
    const next = { ...td, updatedAt: now } as Todo;
    delete next.subtasks;
    return next;
  });
}

/**
 * "Delete to-do" — sends the item to the merged Done bin (done +
 * trashed flags both set). Sits there for 30 days. Same outcome as
 * tapping the checkbox; named differently for the user who wants to
 * "remove" rather than "complete." Both flow through the same bin.
 */
export function todoMoveToTrash(prev: Todo[], id: string): Todo[] {
  const now = Date.now();
  return prev.map((td) =>
    td.id === id
      ? // Trashing is "I discarded this", not "I finished it". Preserve
        // the existing `done` + `completionDate` so a user who completes
        // an item then later trashes the row still reads as completed in
        // the Done bin, while an item trashed without ever being checked
        // off stays !done (no pebble earned, no "Today" Done group).
        { ...td, trashed: true, trashedAt: now, updatedAt: now }
      : td,
  );
}

/**
 * Apply text / priority / category / notes from a target instance to all
 * future non-trashed siblings in the same series (dueDate >= target's).
 * Past siblings are not touched — they're history. By default skips
 * any future siblings with `detachedFromSeries: true` (per-instance
 * customizations the user explicitly carved out); pass
 * `{ overwriteDetached: true }` from the R6b/R6c "Recreate all" branch
 * to opt back in. No-op when the target has no seriesId.
 */
export function todoApplySeriesFutureEdits(
  prev: Todo[],
  id: string,
  fields: {
    text?: string;
    priority?: Priority;
    category?: Category | undefined;
    notes?: string;
  },
  options: { overwriteDetached?: boolean } = {},
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
    if (td.detachedFromSeries && !options.overwriteDetached) return td;
    affected += 1;
    const merged: Todo = { ...td, updatedAt: now };
    if (fields.text !== undefined) merged.text = fields.text.slice(0, MAX_TODO_TEXT_LEN);
    if (fields.priority !== undefined) merged.priority = fields.priority;
    if (fields.category !== undefined) merged.category = fields.category;
    if (fields.notes !== undefined) {
      if (fields.notes.length === 0) delete merged.notes;
      else merged.notes = fields.notes.slice(0, MAX_TODO_NOTES_LEN);
    }
    return merged;
  });
  return { next, affected };
}

/**
 * R6a — Mark a series instance as `detachedFromSeries: true`. Fires
 * the first time the user makes a series-eligible edit in the
 * "Edit this only" mode. Idempotent — already-detached rows
 * short-circuit so the caller can call this on every save without
 * worrying about the noise. No-op when the target has no
 * `seriesId` (it's a one-off).
 */
export function todoDetachFromSeries(prev: Todo[], id: string): Todo[] {
  const target = prev.find((t) => t.id === id);
  if (!target || !target.seriesId) return prev;
  if (target.detachedFromSeries) return prev;
  return prev.map((td) =>
    td.id === id ? { ...td, detachedFromSeries: true, updatedAt: Date.now() } : td,
  );
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
    // Preserve existing done/completionDate — see todoMoveToTrash for
    // the rationale (trashing is "discarded", not "completed").
    return { ...td, trashed: true, trashedAt: now, updatedAt: now };
  });
  return { next, affected };
}

// ---- Recurring series: horizon/window helpers ---------------------------
//
// R1 of the recurring redesign (see docs/RECURRING-REDESIGN-PLAN.md).
// Pure functions only — no callers in this PR. Wired into todoToggle
// (R3), migration (R2), and edit dialogs (R6) by later PRs.

/**
 * Per-frequency materialization window (calendar-aware).
 *   daily   → today + 7 days
 *   weekly  → today + 1 month
 *   monthly → today + 3 months
 *   yearly  → today + 3 years
 *
 * Returns the inclusive cutoff ISO date. Instances with
 * `dueDate <= cutoff` are materialized; everything past is left for
 * future top-ups as the calendar slides forward.
 */
export function windowCutoffFor(freq: RecurrenceFreq, todayISO: string): string {
  const [y, m, d] = dueDateOnly(todayISO).split("-").map(Number);
  if (!y || !m || !d) return todayISO;
  const dt = new Date(y, m - 1, d);
  switch (freq) {
    case "daily":
      dt.setDate(dt.getDate() + 7);
      break;
    case "weekly":
      dt.setMonth(dt.getMonth() + 1);
      break;
    case "monthly":
      dt.setMonth(dt.getMonth() + 3);
      break;
    case "yearly":
      dt.setFullYear(dt.getFullYear() + 3);
      break;
  }
  // Use the same yyyy-mm-dd formatter the rest of derive uses.
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/**
 * Materialize a recurring series from `seed.dueDate` forward to
 * `windowCutoffFor(freq, todayISO)`, capped at `recurrence.endDate`.
 * Returns the seed as the head plus one Todo per subsequent occurrence.
 *
 * Behavior:
 *  - Seed retains its existing `id`, `reminder`, `subtasks`, `notes`.
 *    Reminder lives on the head only — top-ups don't carry it forward.
 *  - Generated instances get fresh UUIDs, the shared `seriesId`
 *    (assigned if seed lacks one), and `cloneSubtasksFresh(seed.subtasks)`.
 *  - Any time-suffix on the seed's dueDate is preserved on each instance.
 *  - No-op if seed lacks `recurrence` or `dueDate` — returns `[seed]`.
 */
export function expandSeries(seed: Todo, todayISO: string): Todo[] {
  if (!seed.recurrence || !seed.dueDate) return [seed];
  const rec = seed.recurrence;
  const seedDateOnly = dueDateOnly(seed.dueDate);
  const tIdx = seed.dueDate.indexOf("T");
  const timeSuffix = tIdx === -1 ? "" : seed.dueDate.slice(tIdx);
  const cutoff = windowCutoffFor(rec.freq, todayISO);
  const hardEnd = rec.endDate && rec.endDate < cutoff ? rec.endDate : cutoff;
  const seriesId = seed.seriesId ?? genUuid();
  const head: Todo = { ...seed, seriesId };
  if (hardEnd < seedDateOnly) return [head];
  const dates = expandRecurrence(seedDateOnly, hardEnd, rec);
  if (dates.length <= 1) return [head];
  const now = Date.now();
  const out: Todo[] = [head];
  // Skip the first generated date (it's the seed). Generate fresh
  // instances for the rest.
  for (let i = 1; i < dates.length; i++) {
    const inst: Todo = {
      id: genUuid(),
      text: seed.text,
      done: false,
      priority: seed.priority,
      dueDate: dates[i] + timeSuffix,
      trashed: false,
      updatedAt: now,
      seriesId,
      recurrence: rec,
    };
    if (seed.category) inst.category = seed.category;
    const subs = cloneSubtasksFresh(seed.subtasks);
    if (subs) inst.subtasks = subs;
    if (seed.notes) inst.notes = seed.notes;
    out.push(inst);
  }
  return out;
}

/**
 * Append fresh instances to an existing series so its tail reaches
 * `windowCutoffFor(freq, todayISO)`. Idempotent — calling twice with
 * the same input returns the same list. No-op when the series is
 * already at horizon or has been ended by `recurrence.endDate`.
 *
 * Inheritance: new tail rows inherit text/priority/category/subtasks/
 * notes from the *latest non-detached* member of the series. Falling
 * back to the latest member overall when every instance is detached.
 * The latest member's recurrence definition (carried on every row) is
 * what drives `nextOccurrence` forward.
 */
export function topUpSeries(
  todos: Todo[],
  seriesId: string,
  todayISO: string,
): Todo[] {
  if (!seriesId) return todos;
  const members = todos.filter((t) => t.seriesId === seriesId);
  if (members.length === 0) return todos;
  // Latest dueDate of ANY member (done/trashed/detached) — that's the
  // current horizon of the series, regardless of state.
  let latest = "";
  for (const m of members) {
    const d = dueDateOnly(m.dueDate);
    if (d && d > latest) latest = d;
  }
  if (!latest) return todos;
  // Inheritance: prefer the latest non-detached row so per-instance
  // tweaks don't propagate forward via top-up.
  let inheritFrom: Todo | undefined;
  let inheritLatest = "";
  for (const m of members) {
    if (m.detachedFromSeries) continue;
    if (!m.recurrence) continue;
    const d = dueDateOnly(m.dueDate);
    if (d && d > inheritLatest) {
      inheritLatest = d;
      inheritFrom = m;
    }
  }
  if (!inheritFrom) inheritFrom = members.find((m) => m.recurrence);
  if (!inheritFrom || !inheritFrom.recurrence) return todos;
  const rec = inheritFrom.recurrence;
  const cutoff = windowCutoffFor(rec.freq, todayISO);
  const hardEnd = rec.endDate && rec.endDate < cutoff ? rec.endDate : cutoff;
  if (latest >= hardEnd) return todos;
  const inheritDD = inheritFrom.dueDate;
  const tIdx = inheritDD.indexOf("T");
  const timeSuffix = tIdx === -1 ? "" : inheritDD.slice(tIdx);
  const interval = rec.interval ?? 1;
  const now = Date.now();
  const additions: Todo[] = [];
  let cursor = nextOccurrence(latest, rec.freq, interval, rec.byWeekday, rec.bySetPos);
  let guard = 0;
  while (cursor <= hardEnd && guard < MAX_RECURRENCE_INSTANCES) {
    const inst: Todo = {
      id: genUuid(),
      text: inheritFrom.text,
      done: false,
      priority: inheritFrom.priority,
      dueDate: cursor + timeSuffix,
      trashed: false,
      updatedAt: now,
      seriesId,
      recurrence: rec,
    };
    if (inheritFrom.category) inst.category = inheritFrom.category;
    const subs = cloneSubtasksFresh(inheritFrom.subtasks);
    if (subs) inst.subtasks = subs;
    if (inheritFrom.notes) inst.notes = inheritFrom.notes;
    additions.push(inst);
    cursor = nextOccurrence(cursor, rec.freq, interval, rec.byWeekday, rec.bySetPos);
    guard += 1;
  }
  if (additions.length === 0) return todos;
  return [...todos, ...additions];
}

/**
 * Append exactly one new instance one period past the series' current
 * tail. Called by `todoToggle` on every series completion so the user
 * always sees a stable number of future instances queued ("1
 * completion = 1 new tail"). Distinct from `topUpSeries`, which is
 * window-driven and used by migration + app-open catch-up.
 *
 * No-op when:
 *  - The series has no members.
 *  - The next occurrence past the tail would exceed
 *    `recurrence.endDate` — the series is finished.
 *
 * Inheritance: text/category/subtasks/notes come from the latest
 * non-detached member; falls back to any member with a recurrence
 * definition.
 */
export function appendNextSeriesInstance(
  todos: Todo[],
  seriesId: string,
): Todo[] {
  if (!seriesId) return todos;
  const members = todos.filter((t) => t.seriesId === seriesId);
  if (members.length === 0) return todos;
  // Inherit from the latest non-detached member so per-instance
  // tweaks don't propagate forward via "1 completion = 1 new tail".
  let inheritFrom: Todo | undefined;
  let inheritLatest = "";
  for (const m of members) {
    if (m.detachedFromSeries) continue;
    if (!m.recurrence) continue;
    const d = dueDateOnly(m.dueDate);
    if (d && d > inheritLatest) {
      inheritLatest = d;
      inheritFrom = m;
    }
  }
  if (!inheritFrom) inheritFrom = members.find((m) => m.recurrence);
  if (!inheritFrom || !inheritFrom.recurrence) return todos;
  const rec = inheritFrom.recurrence;
  // Cursor advances strictly after the latest dueDate of ANY member
  // (done/trashed/detached included) so we don't double-up on a
  // recently-completed instance.
  let latest = "";
  for (const m of members) {
    const d = dueDateOnly(m.dueDate);
    if (d && d > latest) latest = d;
  }
  if (!latest) return todos;
  const interval = rec.interval ?? 1;
  const next = nextOccurrence(latest, rec.freq, interval, rec.byWeekday, rec.bySetPos);
  if (rec.endDate && next > rec.endDate) return todos;
  const tIdx = inheritFrom.dueDate.indexOf("T");
  const timeSuffix = tIdx === -1 ? "" : inheritFrom.dueDate.slice(tIdx);
  const now = Date.now();
  const inst: Todo = {
    id: genUuid(),
    text: inheritFrom.text,
    done: false,
    priority: inheritFrom.priority,
    dueDate: next + timeSuffix,
    trashed: false,
    updatedAt: now,
    seriesId,
    recurrence: rec,
  };
  if (inheritFrom.category) inst.category = inheritFrom.category;
  const subs = cloneSubtasksFresh(inheritFrom.subtasks);
  if (subs) inst.subtasks = subs;
  if (inheritFrom.notes) inst.notes = inheritFrom.notes;
  return [...todos, inst];
}

/**
 * R5 — Skip ("Not Do") action. Marks a todo as deliberately not
 * happening:
 *   - status: 'notDo'
 *   - trashed: true (so it sits in the Done bin alongside completed
 *     and trashed rows; the bin's row renderer reads `status` to
 *     show a "Not Do" tag instead of a "Done <date>" tag)
 *   - done: false (key difference from completion — skipping is
 *     not a pebble-earning event)
 *   - reminder: cleared (no more notifications for this occurrence)
 *
 * For series instances (those with `seriesId`), Skip also appends
 * one fresh tail via `appendNextSeriesInstance` so the user always
 * has the next occurrence queued — the same horizon-stability
 * promise R3 made for completion.
 *
 * Pebble-neutral: `pebbleDelta` only fires on `done` flipping (or
 * recurring dueDate rolling for legacy rows), neither of which Skip
 * causes.
 */
export function todoSkip(prev: Todo[], id: string, todayISO?: string): Todo[] {
  const now = Date.now();
  const today = todayISO ?? todayLocal();
  const target = prev.find((td) => td.id === id);
  if (!target) return prev;
  // Subtask-gated parents — same rule as todoToggle: when subs
  // exist, the parent's state is derived. Block the action so a
  // skip can't silently desync the parent from its sub list.
  if (target.subtasks && target.subtasks.length > 0) return prev;
  const skipped = prev.map((td) => {
    if (td.id !== id) return td;
    const next: Todo = {
      ...td,
      status: "notDo",
      trashed: true,
      trashedAt: now,
      completionDate: today,
      updatedAt: now,
    };
    delete next.reminder;
    return next;
  });
  return target.seriesId
    ? appendNextSeriesInstance(skipped, target.seriesId)
    : skipped;
}

/**
 * R2 migration. Promotes legacy rolling recurring todos to the
 * pre-expanded horizon model:
 *
 *  - Active (non-trashed, non-done) recurring todos without a
 *    `seriesId` get one assigned and a tail materialized through
 *    `windowCutoffFor(rec.freq, today)`.
 *  - When the seed's `dueDate` is in the past, the head keeps its
 *    original overdue date (so the user still sees the "carried
 *    over" cue) and the tail starts at today's first valid
 *    occurrence. No retroactive instances are generated between the
 *    overdue date and today.
 *  - Trashed / done recurring todos (rolling snapshots, history) are
 *    left untouched — they're not part of any active series.
 *  - Todos already carrying a `seriesId` are left alone here; the
 *    `topUpAllSeries` pass that follows extends their tails to the
 *    current horizon if needed.
 *
 * Idempotent at the "changed" level: a second call on the same input
 * is a no-op because every active recurring todo will now have a
 * `seriesId`.
 */
export function migrateToRecurringV2(
  todos: Todo[],
  todayISO: string,
): { todos: Todo[]; changed: boolean } {
  let changed = false;
  const additions: Todo[] = [];
  const next = todos.map((td) => {
    if (!td.recurrence) return td;
    if (td.trashed || td.done) return td;
    if (td.seriesId) return td;
    const seriesId = genUuid();
    changed = true;
    const seedDateOnly = dueDateOnly(td.dueDate);
    if (seedDateOnly >= todayISO) {
      // Future- or today-dated head: normal forward expansion.
      const expanded = expandSeries({ ...td, seriesId }, todayISO);
      const [head, ...rest] = expanded;
      additions.push(...rest);
      return head;
    }
    // Past-dated head: keep the overdue dueDate on the head; build a
    // fresh tail starting at the first valid occurrence >= today.
    const head: Todo = { ...td, seriesId };
    const rec = td.recurrence;
    const cutoff = windowCutoffFor(rec.freq, todayISO);
    const hardEnd = rec.endDate && rec.endDate < cutoff ? rec.endDate : cutoff;
    if (todayISO > hardEnd) return head;
    const tIdx = td.dueDate.indexOf("T");
    const timeSuffix = tIdx === -1 ? "" : td.dueDate.slice(tIdx);
    const futureDates = expandRecurrence(todayISO, hardEnd, rec);
    const now = Date.now();
    for (const d of futureDates) {
      const subs = cloneSubtasksFresh(td.subtasks);
      const inst: Todo = {
        id: genUuid(),
        text: td.text,
        done: false,
        priority: td.priority,
        dueDate: d + timeSuffix,
        trashed: false,
        updatedAt: now,
        seriesId,
        recurrence: rec,
      };
      if (td.category) inst.category = td.category;
      if (subs) inst.subtasks = subs;
      if (td.notes) inst.notes = td.notes;
      additions.push(inst);
    }
    return head;
  });
  return { todos: changed ? [...next, ...additions] : todos, changed };
}

/**
 * Walk every distinct `seriesId` in the list and apply `topUpSeries`
 * to each. Idempotent. Called after migration on first launch and on
 * every subsequent launch so a long-idle device catches up its series
 * tails to the live horizon.
 */
export function topUpAllSeries(
  todos: Todo[],
  todayISO: string,
): { todos: Todo[]; changed: boolean } {
  const seriesIds = new Set<string>();
  for (const t of todos) {
    if (t.seriesId) seriesIds.add(t.seriesId);
  }
  if (seriesIds.size === 0) return { todos, changed: false };
  let current = todos;
  let changed = false;
  for (const sid of seriesIds) {
    const after = topUpSeries(current, sid, todayISO);
    if (after !== current) {
      current = after;
      changed = true;
    }
  }
  return { todos: current, changed };
}

/**
 * Non-trashed series members with `dueDate >= anchor`. Used by R6's
 * "Apply to all future events" path to find the rows a series-wide
 * edit should touch.
 */
export function seriesFutureFrom(
  todos: Todo[],
  seriesId: string,
  anchorISO: string,
): Todo[] {
  if (!seriesId) return [];
  const anchor = dueDateOnly(anchorISO);
  return todos.filter((t) => {
    if (t.seriesId !== seriesId) return false;
    if (t.trashed) return false;
    const d = dueDateOnly(t.dueDate);
    return d >= anchor;
  });
}

export function todoRestoreFromTrash(prev: Todo[], id: string): Todo[] {
  const now = Date.now();
  return prev.map((td) => {
    if (td.id !== id) return td;
    const { trashedAt: _t, completionDate: _c, ...rest } = td;
    // Restoring from the Done bin clears both flags so the row goes
    // back to active.
    return { ...rest, done: false, trashed: false, updatedAt: now };
  });
}

export function todoPermanentlyDelete(prev: Todo[], id: string): Todo[] {
  return prev.filter((td) => td.id !== id);
}

export function todoEmptyTrash(prev: Todo[]): Todo[] {
  return prev.filter((td) => !td.trashed);
}

/**
 * Permanently delete every item already in the Done bin. The user
 * uses this to manually empty the bin before the 30-day auto-purge.
 * Items merely marked done (which already implies trashed in the
 * merged model) all flow through here. Restored items aren't
 * affected because they're no longer flagged.
 */
export function todoClearDone(prev: Todo[]): { todos: Todo[]; trashedIds: string[] } {
  const removedIds: string[] = [];
  const todos = prev.filter((td) => {
    if (td.done || td.trashed) {
      removedIds.push(td.id);
      return false;
    }
    return true;
  });
  return { todos, trashedIds: removedIds };
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
    if (field === "notes" && typeof value === "string") {
      next.notes = value.slice(0, MAX_TODO_NOTES_LEN);
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
        const sCompletionDate =
          typeof s.completionDate === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(s.completionDate)
            ? s.completionDate
            : undefined;
        const cleanedSub: Subtask = {
          id: sid,
          text: sText,
          done: !!s.done,
          priority: sPriority,
          dueDate: sDueDate,
        };
        if (sCompletionDate) cleanedSub.completionDate = sCompletionDate;
        cleaned.push(cleanedSub);
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

    const notes =
      typeof item.notes === "string"
        ? item.notes.slice(0, MAX_TODO_NOTES_LEN)
        : undefined;

    const completionDate =
      typeof item.completionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.completionDate)
        ? item.completionDate
        : undefined;

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
    if (notes && notes.length > 0) merged.notes = notes;
    if (completionDate) merged.completionDate = completionDate;
    // Reminder: validate the shape. `at` is required, must be a
    // datetime string. interval/until are optional. Past-dated
    // `at` still passes through; the scheduler filters at schedule
    // time. Legacy `remindAt` (a single string) from a previous
    // build is migrated into `reminder.at`.
    const rawRem = (item as { reminder?: unknown; remindAt?: unknown }).reminder
      ?? ((item as { remindAt?: unknown }).remindAt
        ? { at: (item as { remindAt?: unknown }).remindAt }
        : undefined);
    if (rawRem && typeof rawRem === "object") {
      const r = rawRem as { at?: unknown; intervalMinutes?: unknown; until?: unknown };
      if (typeof r.at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(r.at)) {
        const reminder: NonNullable<Todo["reminder"]> = { at: r.at };
        if (typeof r.intervalMinutes === "number" && Number.isFinite(r.intervalMinutes) && r.intervalMinutes >= 1) {
          reminder.intervalMinutes = Math.floor(r.intervalMinutes);
        }
        if (typeof r.until === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(r.until)) {
          reminder.until = r.until;
        }
        merged.reminder = reminder;
      }
    }

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
    notDo: number;
  };
  byCategoryOpen: Record<string, number>; // open todos per category
  byCategoryTotal: Record<string, number>; // all (active) todos per category
  byPriorityOpen: Record<Priority, number>; // open todos per priority
  byPriorityTotal: Record<Priority, number>; // all todos per priority (exact match)
  sectionLabel: string | null;
  subtitle: string;
  emptyState: EmptyState;
  defaultCategory: Category;
}

export interface DeriveInput {
  todos: Todo[];
  /**
   * Active filter set. Empty array OR `['all']` means no constraint.
   * Multiple filters are combined as:
   *   - OR within type (open ∪ done, Home ∪ Work, high ∪ medium)
   *   - AND across types ((open ∪ done) ∩ (Home ∪ Work))
   * Status/grocery filters: each item passes one status. Currently the
   * picker only supports picking one status at a time of {overdue,open,
   * done,trash} since they're mutually exclusive in meaning; the multi-
   * select shape still expresses this naturally as a one-element status
   * group.
   */
  filters: Filter[];
  categories: CategoryDef[];
  t: Strings;
}

/**
 * Upsert a todo into the long-lived suggestion history. Called when a
 * todo is checked off — we capture the user's chosen category /
 * priority / recurrence so the same item, typed again later, can be
 * auto-filled with the same metadata.
 *
 * Dedupe by lowercased text: re-completing the same item updates the
 * existing entry in-place (most-recent values win) and bumps
 * `lastSeenAt` so it ranks first in the suggestion list. The history
 * is capped at MAX_TODO_REFERENCES on an LRU basis.
 */
export function recordTodoReference(
  refs: TodoReference[],
  todo: Pick<Todo, "text" | "category" | "priority" | "recurrence">,
): TodoReference[] {
  const text = (todo.text ?? "").trim();
  if (!text) return refs;
  const textLower = text.toLowerCase();
  const next: TodoReference = {
    textLower,
    text: text.slice(0, MAX_TODO_TEXT_LEN),
    category: todo.category,
    priority: todo.priority,
    recurrence: todo.recurrence,
    lastSeenAt: Date.now(),
  };
  // Drop any prior entry for the same text, then prepend the new
  // version. Slicing to the cap evicts the oldest by sort position
  // (which is recency, since we keep `next` at the head).
  const filtered = refs.filter((r) => r.textLower !== textLower);
  return [next, ...filtered].slice(0, MAX_TODO_REFERENCES);
}

/**
 * Sanitize cloud / localStorage payloads of the suggestion history.
 * Drops malformed entries silently so a corrupt write can't crash the
 * compose sheet.
 */
export function migrateTodoReferences(raw: unknown): TodoReference[] {
  if (!Array.isArray(raw)) return [];
  const validPriorities = new Set<Priority>(["high", "medium", "low"]);
  const out: TodoReference[] = [];
  const seen = new Set<string>();
  for (const r of raw.slice(0, MAX_TODO_REFERENCES)) {
    if (typeof r !== "object" || r === null || Array.isArray(r)) continue;
    const item = r as Partial<TodoReference>;
    const text =
      typeof item.text === "string"
        ? item.text.slice(0, MAX_TODO_TEXT_LEN).trim()
        : "";
    if (!text) continue;
    const textLower = text.toLowerCase();
    if (seen.has(textLower)) continue;
    seen.add(textLower);
    out.push({
      textLower,
      text,
      category:
        typeof item.category === "string" && item.category.length > 0
          ? item.category
          : undefined,
      priority: validPriorities.has(item.priority as Priority)
        ? (item.priority as Priority)
        : undefined,
      // Trust the shape of recurrence — same migrator as Todo would be
      // overkill for this small suggestion list. Validation here just
      // confirms it's a plain object with a known freq.
      recurrence:
        item.recurrence &&
        typeof item.recurrence === "object" &&
        typeof (item.recurrence as Recurrence).freq === "string"
          ? (item.recurrence as Recurrence)
          : undefined,
      lastSeenAt:
        typeof item.lastSeenAt === "number" && Number.isFinite(item.lastSeenAt)
          ? item.lastSeenAt
          : 0,
    });
  }
  // Newest first so consumers don't need to sort.
  out.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  return out;
}

/**
 * Pick a sensible default category for the compose sheet when the user
 * is on a non-category filter. Walks `todos` newest-first (by
 * `updatedAt`, skipping trashed) and returns the first valid category
 * id — i.e. "the last category you used." Falls back to `home` when
 * present in the list, else `categories[0]`, else literal "home".
 *
 * Pure + exported so the platform stores can call it directly when they
 * need the prefill outside of `deriveState`.
 */
export function inferDefaultCategory(
  todos: Todo[],
  categories: CategoryDef[],
): string {
  const validIds = new Set(categories.map((c) => c.id));
  const recent = [...todos]
    .filter((t) => !t.trashed)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  for (const t of recent) {
    const cat = t.category;
    if (cat && validIds.has(cat)) return cat;
  }
  // Empty / all-stale history: prefer `home` (the calm default), then
  // first-in-list, then literal "home" if categories[] is empty.
  return (
    categories.find((c) => c.id === "home")?.id ??
    categories[0]?.id ??
    "home"
  );
}

export function deriveState(input: DeriveInput): DerivedState {
  const { todos, filters: filtersRaw, categories, t } = input;
  // Normalize: treat empty array AND explicit ['all'] as "no
  // constraint" so downstream code can branch uniformly.
  const filters: Filter[] =
    filtersRaw.length === 0 || filtersRaw.includes('all') ? [] : filtersRaw;
  // Group selected filters by type for the OR-within / AND-across rule.
  const selectedStatuses = filters.filter((f): f is Exclude<Filter, `cat:${string}` | `pri:${string}` | 'all'> =>
    f === 'overdue' || f === 'open' || f === 'done' || f === 'trash' || f === 'groceries',
  );
  const selectedCategoryIds = filters
    .filter(isCategoryFilter)
    .map((f) => categoryIdFromFilter(f));
  const selectedPriorities = filters
    .filter(isPriorityFilter)
    .map((f) => priorityFromFilter(f));
  // Legacy single-filter alias for code paths that still need a single
  // primary filter (section label, empty state, defaultCategory). Picks
  // the lone selection when exactly one filter is active; else 'all'.
  const filter: Filter = filters.length === 1 ? filters[0] : 'all';
  const today = todayLocal();
  // "Carried over" / overdue counts every task whose dueDate is before today,
  // including tasks the user already completed. The done state is meaningful
  // history (you finished it, even if late), so it surfaces here too.
  const isOverdue = (td: Todo) =>
    !!td.dueDate && dueDateOnly(td.dueDate) < today;
  const active = todos.filter((td) => !td.trashed);

  // Items just completed today linger in the open / overdue / category
  // views so the user sees the strike-through before they navigate away
  // — checking off a task shouldn't make it instantly vanish out from
  // under them. Older done items drop out so the active view doesn't
  // accumulate cruft over weeks. Because checking off a todo also
  // sets `trashed: true` (done + trash are one merged bin), this
  // predicate gates BOTH the trash-exclusion and the per-filter rule.
  const completedToday = (td: Todo) =>
    td.done && td.completionDate === today;

  // Per-type status predicate. Pulled out so the multi-faceted match
  // below can reuse it for each selected status.
  const matchesStatus = (td: Todo, status: typeof selectedStatuses[number]): boolean => {
    if (status === 'done' || status === 'trash') return td.done || td.trashed;
    // For non-done/trash statuses, trashed items drop out unless
    // they were just completed today (grace period for the strike-
    // through animation).
    if (td.trashed && !completedToday(td)) return false;
    if (status === 'overdue') return isOverdue(td);
    if (status === 'open') return !td.done && !td.trashed;
    // 'groceries' isn't a real Todo predicate — the grocery filter
    // routes to a different view. Treat as no-match here.
    return false;
  };

  const filtered = todos.filter((td) => {
    // No filters selected → "all" semantics: include everything
    // (including trashed items, matching the old "all" behavior).
    if (filters.length === 0) return true;
    // Status group (OR within). If a Done/Trash status is selected,
    // its predicate intentionally includes trashed items; other
    // statuses exclude them. The matchesStatus helper handles the
    // grace-period rule per status, so we don't need a separate
    // trash short-circuit here.
    if (selectedStatuses.length > 0) {
      if (!selectedStatuses.some((s) => matchesStatus(td, s))) return false;
    } else if (td.trashed && !completedToday(td)) {
      // No status filter active but category/priority filters are;
      // exclude trashed items (matching the legacy category/priority
      // filter behavior).
      return false;
    }
    // Category group (OR within).
    if (selectedCategoryIds.length > 0) {
      if (!selectedCategoryIds.some((id) => td.category === id)) return false;
    }
    // Priority group (OR within).
    if (selectedPriorities.length > 0) {
      if (!selectedPriorities.some((p) => td.priority === p)) return false;
    }
    return true;
  });

  const inTrashView = filter === "trash";
  const groups = inTrashView ? [] : buildGroups(filtered);

  const totalOpen = active.filter((td) => !td.done).length;
  // Done bin = done OR trashed (one merged 30-day bucket).
  const completedCount = todos.filter((td) => td.done || td.trashed).length;
  const trashCount = completedCount;
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

  // Priority counts — exact match against td.priority. Items with no
  // priority (undefined) don't count toward any priority bucket; they
  // only surface via "All", category filters, or status filters. Same
  // open-vs-total split as categories.
  const byPriorityOpen: Record<Priority, number> = { high: 0, medium: 0, low: 0 };
  const byPriorityTotal: Record<Priority, number> = { high: 0, medium: 0, low: 0 };
  for (const p of PRIORITY_VALUES) {
    const inP = active.filter((td) => td.priority === p);
    byPriorityOpen[p] = inP.filter((td) => !td.done).length;
    byPriorityTotal[p] = todos.filter((td) => td.priority === p).length;
  }

  const systemCounts = {
    // "All" = open + everything in the merged Done bin.
    all: totalOpen + completedCount,
    // Carried-over count includes done past-due items too (history).
    overdue: todos.filter(isOverdue).length,
    open: active.filter((td) => !td.done).length,
    done: completedCount,
    trash: trashCount,
    // Skipped recurring instances (R1 plumbing — populated when R5
    // lights up the Skip action). Counted across active + non-trashed.
    notDo: todos.filter((td) => !td.trashed && td.status === "notDo").length,
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
  else if (isPriorityFilter(filter)) {
    sectionLabel = t.priority[priorityFromFilter(filter)];
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
  else if (filter === "groceries")
    // Grocery view owns its own empty state; the deriveState empty
    // copy is a fallback that won't actually render because App.tsx
    // branches on filter === 'groceries' before consuming this.
    emptyState = { title: "", hint: "" };
  else if (isCategoryFilter(filter)) {
    const id = categoryIdFromFilter(filter);
    const cat = categories.find((c) => c.id === id);
    emptyState = {
      title: t.emptyCategoryTitle(cat ? categoryLabel(cat, t) : ""),
      hint: t.emptyHint,
      ctaLabel: t.addFirstTask,
    };
  } else if (isPriorityFilter(filter)) {
    emptyState = {
      title: t.emptyPriorityTitle(t.priority[priorityFromFilter(filter)]),
      hint: t.emptyHint,
      ctaLabel: t.addFirstTask,
    };
  } else {
    emptyState = { title: "", hint: "" };
  }

  const defaultCategory: Category = isCategoryFilter(filter)
    ? categoryIdFromFilter(filter)
    : inferDefaultCategory(todos, categories);

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
    byPriorityOpen,
    byPriorityTotal,
    sectionLabel,
    subtitle,
    emptyState,
    defaultCategory,
  };
}
