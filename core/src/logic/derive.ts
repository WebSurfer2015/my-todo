import {
  Category,
  Filter,
  Priority,
  Recurrence,
  RecurrenceFreq,
  Reminder,
  Subtask,
  Todo,
  TodoReference,
  isCategoryFilter,
  categoryIdFromFilter,
  isPriorityFilter,
  priorityFromFilter,
} from "../domain/types";
import { CategoryDef, categoryLabel } from "../data/categories";
import { buildGroups, TodoGroup } from "./groups";
import { genUuid, isoDate, todayLocal, dueDateOnly, nextOccurrence, expandRecurrence, matchesRecurrence, MAX_RECURRENCE_INSTANCES } from "./utils";
import type { Strings } from "../data/i18n";

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
  reminders?: Reminder[];
}): Todo {
  const notes =
    typeof input.notes === "string" && input.notes.length > 0
      ? input.notes.slice(0, MAX_TODO_NOTES_LEN)
      : undefined;
  // Invariant: a recurring todo MUST carry an anchored dueDate. Without
  // one, expandSeries bails to a single dateless instance (no seriesId,
  // no tail) and todoToggle can't roll the series forward — both guard on
  // dueDate. The user sees a "No date" repeat that never advances. Manual
  // compose snaps the date before calling here, but non-UI creators (the
  // Mochi agent proposes a recurrence with no start date; future imports)
  // don't, so enforce it centrally: anchor to today when absent, then snap
  // to the first matching weekday when the recurrence filters days.
  let dueDate = input.dueDate;
  if (input.recurrence) {
    if (!dueDateOnly(dueDate)) dueDate = todayLocal();
    dueDate = snapDueDateToRecurrence(dueDate, input.recurrence);
  }
  const recurrence = input.recurrence ? recurrenceWithAnchor(input.recurrence, dueDate) : undefined;
  return {
    id: genUuid(),
    text: input.text.slice(0, MAX_TODO_TEXT_LEN),
    done: false,
    priority: input.priority,
    dueDate,
    category: input.category,
    trashed: false,
    updatedAt: Date.now(),
    ...(recurrence ? { recurrence } : {}),
    ...(input.subtasks && input.subtasks.length > 0 ? { subtasks: input.subtasks } : {}),
    ...(notes ? { notes } : {}),
    ...(input.reminders && input.reminders.length > 0 ? { reminders: input.reminders } : {}),
  };
}

/**
 * When a recurrence has a weekday filter, the dueDate is the FIRST
 * occurrence of the series — it must fall on one of the listed
 * weekdays (and, for a monthly rule, at one of the listed positions:
 * "2nd Thursday"). If `dueDate` is empty or doesn't match, snap
 * forward to the next matching day (starting from dueDate, or today
 * if empty). Preserves any time suffix on dueDate. No-op for
 * recurrences without byWeekday and for dueDates that already match.
 *
 * Example: today=Sat, recurrence={freq:weekly, byWeekday:[3]} (Wed)
 *  → returns next Wednesday's ISO date.
 */
export function snapDueDateToRecurrence(
  dueDate: string,
  recurrence: { freq?: RecurrenceFreq; byWeekday?: number[]; bySetPos?: number[] } | undefined,
): string {
  if (!recurrence?.byWeekday || recurrence.byWeekday.length === 0) {
    return dueDate;
  }
  const dateOnly = dueDateOnly(dueDate);
  const base = dateOnly ? new Date(`${dateOnly}T00:00:00`) : new Date();
  if (Number.isNaN(base.valueOf())) return dueDate;
  const tIdx = dueDate.indexOf("T");
  const withTime = (datePart: string) => (tIdx === -1 ? datePart : datePart + dueDate.slice(tIdx));
  // Monthly "Nth weekday": the next weekday alone isn't enough — mid-month,
  // "2nd Thursday" snapped to the 4th Thursday. Use the full rule (interval
  // 1: the first occurrence is the next match, not one a period later).
  if (recurrence.freq === "monthly") {
    const rule = { freq: "monthly" as const, byWeekday: recurrence.byWeekday, bySetPos: recurrence.bySetPos };
    const baseISO = isoDate(base);
    if (matchesRecurrence(baseISO, rule)) return withTime(baseISO);
    return withTime(nextOccurrence(baseISO, "monthly", 1, rule.byWeekday, rule.bySetPos));
  }
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.valueOf());
    d.setDate(d.getDate() + i);
    if (recurrence.byWeekday.includes(d.getDay())) return withTime(isoDate(d));
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
  // Whole days between the two dates — rounded, because the gap between two
  // LOCAL midnights is 23h / 25h across a DST change. Then move the
  // reminder's own LOCAL date by that many days, keeping its clock time.
  // (Adding the raw ms delta to the reminder instant slipped a 23:xx reminder
  // into the next day after fall-back.)
  const days = Math.round((to.valueOf() - from.valueOf()) / 86_400_000);
  const next = new Date(remind.valueOf());
  next.setDate(next.getDate() + days);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  const hh = String(remind.getHours()).padStart(2, "0");
  const mm = String(remind.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

/**
 * Copy reminders onto a new series occurrence, rebasing each `at` from the
 * source occurrence's due to the target's — rollDateTime preserves the
 * delta-from-due, i.e. the time-of-day / before-due offset, so every
 * occurrence reminds at the same clock time relative to its own due. Fresh
 * ids keep the scheduler's per-fire keys distinct across instances.
 */
function rebaseReminders(
  reminders: Reminder[],
  fromDue: string,
  toDue: string,
): Reminder[] {
  return reminders.map((r) => {
    const reb: Reminder = { id: genUuid(), at: rollDateTime(r.at, fromDue, toDue) };
    if (r.offsetMinutes != null) reb.offsetMinutes = r.offsetMinutes;
    if (r.intervalMinutes != null) reb.intervalMinutes = r.intervalMinutes;
    if (r.until) reb.until = rollDateTime(r.until, fromDue, toDue);
    return reb;
  });
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
 * path: completing the row marks it done in place (the next instance is
 * already materialized), appends one fresh tail via
 * `appendNextSeriesInstance` so the user always has the next occurrence
 * queued, and transfers its reminders forward. Un-doing simply clears the
 * flags and leaves the tail alone.
 *
 * `todayISO` defaults to `todayLocal()` so existing callers stay the
 * same; tests pass an explicit value for determinism. When passed
 * explicitly it also clamps the appended occurrence to today (see
 * appendNextSeriesInstance) — callers should pass it.
 */
/** Every step set to `done` (stamping / clearing each step's completionDate). */
function stepsSetAll(subs: Subtask[], done: boolean, today: string): Subtask[] {
  return subs.map((s) => {
    if (s.done === done) return s;
    const next: Subtask = { ...s, done };
    if (done) next.completionDate = today;
    else delete next.completionDate;
    return next;
  });
}

/**
 * Toggle a to-do done / not done. A to-do WITH steps toggles all of them at
 * once (the row's circle "completes the whole thing"); its done state stays
 * consistent with subtaskToggle's derived rule (done ⇔ every step done).
 */
export function todoToggle(prev: Todo[], id: string, todayISO?: string): Todo[] {
  const now = Date.now();
  const today = todayISO ?? todayLocal();
  const target = prev.find((td) => td.id === id);
  if (!target) return prev;
  // A skipped row is closed: completing it would turn "didn't do" into "did".
  if (target.status === "notDo" && !target.done) return prev;

  // Series instance: mark done/un-do in place, no snapshot, no
  // dueDate roll. On completion, append one tail so the user always
  // sees the next occurrence queued.
  if (target.seriesId && target.recurrence) {
    const nextDone = !target.done;
    const result = prev.map((td) => {
      if (td.id !== id) return td;
      const upd: Todo = {
        ...td,
        done: nextDone,
        trashed: nextDone,
        updatedAt: now,
      };
      if (td.subtasks && td.subtasks.length > 0) {
        upd.subtasks = stepsSetAll(td.subtasks, nextDone, today);
      }
      if (nextDone) {
        upd.trashedAt = now;
        upd.completionDate = today;
        // Done items don't need future reminders. The scheduler
        // diffs on these fields and cancels every queued fire.
        delete upd.reminders;
      } else {
        delete upd.trashedAt;
        delete upd.completionDate;
      }
      return upd;
    });
    // Only on completion do we extend the tail — un-doing must not
    // generate a brand-new instance the user didn't ask for.
    return nextDone ? seriesCompletionFollowUp(result, target, today, todayISO) : result;
  }

  return prev.flatMap((td) => {
    if (td.id !== id) return [td];
    const nextDone = !td.done;
    const next: Todo = {
      ...td,
      done: nextDone,
      trashed: nextDone,
      updatedAt: now,
    };
    if (td.subtasks && td.subtasks.length > 0) {
      next.subtasks = stepsSetAll(td.subtasks, nextDone, today);
    }
    if (nextDone) {
      next.trashedAt = now;
      next.completionDate = today;
      // Done items don't need future reminders (mirrors the series path).
      delete next.reminders;
    } else {
      delete next.trashedAt;
      delete next.completionDate;
    }
    return [next];
  });
}

/**
 * What completing a series instance does beyond flagging the row (shared by
 * todoToggle and the step paths, so finishing the last step rolls the series
 * exactly like tapping the circle): append one fresh tail via the append-one
 * helper (distinct from the window-driven topUpSeries used by migration /
 * app-open — "1 completion = 1 new tail" keeps the visible count stable), and
 * R7 — transfer the completed row's reminders (read from `target`, the row
 * BEFORE completion cleared them) onto the next-upcoming sibling. No-op for a
 * one-off.
 */
function seriesCompletionFollowUp(
  result: Todo[],
  target: Todo,
  today: string,
  clampToday?: string,
): Todo[] {
  if (!target.seriesId || !target.recurrence) return result;
  let out = seriesOwesTail(result, target, today)
    ? appendNextSeriesInstance(result, target.seriesId, clampToday)
    : result;
  const oldReminders = getReminders(target);
  if (oldReminders.length > 0) {
    out = transferSeriesReminders(out, target.id, oldReminders, target.dueDate, target.seriesId, today);
  }
  return out;
}

/**
 * Whether completing `target` still owes the series one new tail row. Each
 * row settled ahead of time (done / skipped, dated today or later — plus the
 * row being completed, which may be overdue) owes one row past the
 * materialization window; the rows already sitting past the window are the
 * ones earlier completions appended. Completing, un-completing and
 * re-completing the same row therefore appends once, not once per cycle,
 * while completing several different rows still appends one each ("1
 * completion = 1 new tail").
 */
function seriesOwesTail(todos: Todo[], target: Todo, today: string): boolean {
  const sid = target.seriesId;
  if (!sid || !target.recurrence) return false;
  const day0 = dueDateOnly(today);
  const cutoff = windowCutoffFor(target.recurrence.freq, day0);
  let owed = 0;
  let beyond = 0;
  for (const m of todos) {
    if (m.seriesId !== sid) continue;
    const d = dueDateOnly(m.dueDate);
    if (!d) continue;
    // A row moved past the window still stands for its own (earlier) day —
    // it isn't one of the tails earlier completions appended.
    if (occurrenceDay(m, sid) > cutoff) beyond += 1;
    if (m.id === target.id || ((m.done || m.status === "notDo") && d >= day0)) owed += 1;
  }
  return beyond < owed;
}

/**
 * A to-do with steps: its done state is derived (done ⇔ every step done).
 * Re-derive it after a step change and keep the Done-bin fields in lock-step
 * with it, exactly as todoToggle sets them — completing sets trashed +
 * trashedAt + completionDate and drops reminders; reopening clears all of
 * them. A to-do left with no steps keeps whatever state the user last set.
 */
function syncParentDone(td: Todo, today: string, now: number): Todo {
  const subs = td.subtasks;
  if (!subs || subs.length === 0) return td;
  const nextDone = subs.every((s) => s.done);
  const wasDone = !!td.done;
  if (nextDone === wasDone) return td;
  const next: Todo = { ...td, done: nextDone, trashed: nextDone, updatedAt: now };
  if (nextDone) {
    next.trashedAt = now;
    next.completionDate = today;
    // Done items don't need future reminders (the scheduler diffs on this).
    delete next.reminders;
  } else {
    delete next.trashedAt;
    delete next.completionDate;
  }
  return next;
}

/**
 * Apply a step change to one to-do, re-derive its done state, and — when that
 * completes it — run the series follow-up. `change` returns the to-do with its
 * new steps, or null for a no-op (then `prev` is returned unchanged).
 */
function applyStepChange(
  prev: Todo[],
  todoId: string,
  change: (td: Todo) => Todo | null,
  todayISO?: string,
): Todo[] {
  const target = prev.find((td) => td.id === todoId);
  if (!target) return prev;
  const changed = change(target);
  if (!changed) return prev;
  const now = Date.now();
  const today = todayISO ?? todayLocal();
  const next = syncParentDone({ ...changed, updatedAt: now }, today, now);
  const result = prev.map((td) => (td.id === todoId ? next : td));
  return !target.done && next.done ? seriesCompletionFollowUp(result, target, today, todayISO) : result;
}

/**
 * Put one to-do back exactly as `snapshot` (matched by id) — the completion
 * Undo. Exact, unlike toggling back: a to-do with steps gets its previous
 * per-step state, not "all open". No-op if the to-do is gone.
 */
export function todoRevert(prev: Todo[], snapshot: Todo): Todo[] {
  if (!prev.some((td) => td.id === snapshot.id)) return prev;
  const now = Date.now();
  return prev.map((td) => (td.id === snapshot.id ? { ...snapshot, updatedAt: now } : td));
}

/**
 * Undo an action EXACTLY, given the to-do list right before (`before`) and
 * right after (`after`) it: to-dos the action added are removed, to-dos it
 * changed are put back as they were, and to-dos it removed (a rule change
 * hard-removes the old future occurrences) are re-inserted at their original
 * position. A row whose id is in both but was replaced — a regenerated
 * occurrence reusing its deterministic id — counts as changed, so it reverts
 * to the `before` version.
 *
 * Only rows still exactly as the action left them are touched: an added or
 * changed row that was edited since (completed, renamed, …) is kept as is —
 * deleting or rewinding it would silently lose that later action. Rows a
 * later action appended (not in `after`) are left alone — except, when the
 * action changed a series' RULE and the Undo puts the old rule back, the open
 * generated rows appended under the new rule since (a top-up / completion);
 * keeping them would leave a mixed series. A removed row whose id is back in
 * `prev` is left as is.
 */
export function todosRevertChanges(prev: Todo[], before: Todo[], after: Todo[]): Todo[] {
  return todosRevertChangesWithReport(prev, before, after).todos;
}

/**
 * todosRevertChanges plus how many rows it could NOT put back: rows the
 * action added or changed that were edited since (so they're kept as is).
 * `skipped > 0` means the Undo was partial — callers can say "Some later
 * changes were kept." `todos === prev` when nothing was reverted.
 */
export function todosRevertChangesWithReport(
  prev: Todo[],
  before: Todo[],
  after: Todo[],
): { todos: Todo[]; skipped: number } {
  const beforeById = new Map(before.map((td) => [td.id, td]));
  const afterById = new Map(after.map((td) => [td.id, td]));
  const added = new Set<string>();
  const changed = new Map<string, Todo>();
  for (const td of after) {
    const old = beforeById.get(td.id);
    if (!old) added.add(td.id);
    else if (old !== td) changed.set(td.id, old);
  }
  const prevIds = new Set(prev.map((td) => td.id));
  const removed = before.filter((td) => !afterById.has(td.id) && !prevIds.has(td.id));
  if (added.size === 0 && changed.size === 0 && removed.length === 0) return { todos: prev, skipped: 0 };
  // Untouched since the action: the very object it produced, or a copy with
  // the same CONTENT — after a merge / remote snapshot rebuilt it, or after a
  // later change that was itself undone (which restamps updatedAt). So
  // updatedAt is ignored, as are optional empty arrays a parser may drop.
  const untouched = (td: Todo) => {
    const a = afterById.get(td.id);
    return a !== undefined && (a === td || jsonEqual(revertContent(a), revertContent(td)));
  };
  const now = Date.now();
  let touched = removed.length > 0;
  let skipped = 0;
  const out = prev.flatMap((td) => {
    const old = changed.get(td.id);
    if (!old && !added.has(td.id)) return [td];
    if (!untouched(td)) {
      skipped += 1;
      return [td];
    }
    touched = true;
    return old ? [{ ...old, updatedAt: now }] : [];
  });
  if (!touched) return { todos: prev, skipped };
  if (removed.length > 0) {
    // Re-insert each removed row right after its nearest `before`
    // predecessor that is in the list (or at the front when none is).
    const removedIds = new Set(removed.map((td) => td.id));
    let lastPos = -1;
    for (const td of before) {
      if (removedIds.has(td.id)) {
        out.splice(lastPos + 1, 0, { ...td, updatedAt: now });
        lastPos += 1;
        continue;
      }
      const at = out.findIndex((o) => o.id === td.id);
      if (at !== -1) lastPos = at;
    }
  }
  return { todos: dropForeignRuleAppends(out, after, beforeById, afterById), skipped };
}

/**
 * Undoing a series' RULE change: occurrences a later top-up / completion
 * appended under the new rule (generated ids, still open, in neither
 * `before` nor `after`) would leave a mixed series behind — drop the ones
 * whose rule isn't the restored one. Undoing the CREATION of a series (a
 * one-off made to repeat): its later appends would be a ghost series that
 * keeps growing — drop them once no row the action made is still an open
 * repeating member. `todos` itself when there are none.
 */
function dropForeignRuleAppends(
  todos: Todo[],
  after: Todo[],
  beforeById: Map<string, Todo>,
  afterById: Map<string, Todo>,
): Todo[] {
  // Series whose rule the action changed, with the rows it changed it on.
  const restored = new Map<string, Recurrence>();
  const ruleRows = new Map<string, string[]>();
  for (const td of after) {
    const old = beforeById.get(td.id);
    if (!td.seriesId || !old?.recurrence || old.seriesId !== td.seriesId) continue;
    if (td.recurrence && !sameRule(td.recurrence, old.recurrence)) {
      restored.set(td.seriesId, old.recurrence);
      ruleRows.set(td.seriesId, [...(ruleRows.get(td.seriesId) ?? []), td.id]);
    }
  }
  // Series the action CREATED ("make this one-off repeat"): no `before` row
  // carried that seriesId.
  const beforeSids = new Set<string>();
  for (const td of beforeById.values()) if (td.seriesId) beforeSids.add(td.seriesId);
  const created = new Set<string>();
  for (const td of after) if (td.seriesId && !beforeSids.has(td.seriesId)) created.add(td.seriesId);
  // Series the action REBUILT under the same rule (a moved start / a
  // re-expansion): it removed rows of the series and added others. Appends a
  // later top-up made on the rebuilt grid are off the restored one.
  const rebuilt = new Set<string>();
  const addedSids = new Set<string>();
  for (const td of after) if (td.seriesId && !beforeById.has(td.id)) addedSids.add(td.seriesId);
  for (const td of beforeById.values()) {
    if (td.seriesId && addedSids.has(td.seriesId) && !afterById.has(td.id)) rebuilt.add(td.seriesId);
  }
  if (restored.size === 0 && created.size === 0 && rebuilt.size === 0) return todos;
  // Only once the old rule really is back on those rows (a kept later edit
  // leaves the new rule in place, and its appended rows with it).
  const byId = new Map(todos.map((td) => [td.id, td]));
  for (const [sid, rule] of restored) {
    const back = (ruleRows.get(sid) ?? []).every((rid) => sameRule(byId.get(rid)?.recurrence, rule));
    if (!back) restored.delete(sid);
  }
  // A created series is gone once none of the action's own rows is still an
  // open repeating member (a kept later completion is history, not a series).
  for (const td of todos) {
    if (td.seriesId && created.has(td.seriesId) && afterById.has(td.id) && td.recurrence && !td.done && !td.trashed) {
      created.delete(td.seriesId);
    }
  }
  // A rebuilt series counts only once its removed rows are back.
  for (const td of beforeById.values()) {
    if (td.seriesId && rebuilt.has(td.seriesId) && !afterById.has(td.id) && !byId.has(td.id)) rebuilt.delete(td.seriesId);
  }
  const foreign = (td: Todo) => {
    if (!td.seriesId || beforeById.has(td.id) || afterById.has(td.id) || td.done || td.trashed) return false;
    if (!isGeneratedSeriesRow(td)) return false;
    if (created.has(td.seriesId)) return true;
    const rule = restored.get(td.seriesId);
    if (rule) return !sameRule(td.recurrence, rule);
    return rebuilt.has(td.seriesId) && !onRestoredGrid(todos, td, beforeById);
  };
  return todos.some(foreign) ? todos.filter((td) => !foreign(td)) : todos;
}

/** Whether `td` (a later append) falls on the grid of its series as restored:
 * walked by the restored rule from the latest restored member before it. No
 * such member → true (nothing to measure against; kept). */
function onRestoredGrid(todos: Todo[], td: Todo, beforeById: Map<string, Todo>): boolean {
  const sid = td.seriesId as string;
  const day = dueDateOnly(td.dueDate);
  let base: Todo | undefined;
  let baseDay = "";
  for (const m of todos) {
    if (m.seriesId !== sid || !beforeById.has(m.id) || !m.recurrence) continue;
    const d = occurrenceDay(m, sid);
    if (d && d < day && d > baseDay) {
      baseDay = d;
      base = m;
    }
  }
  if (!base?.recurrence) return true;
  const rec = base.recurrence;
  return expandRecurrence(baseDay, day, rec, storedAnchorDay(rec)).includes(day);
}

/** A row's content for the Undo "untouched" check: no updatedAt, and an
 * empty optional array (subtasks: [], reminders: []) reads as absent. */
function revertContent(td: Todo): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(td)) {
    if (k === "updatedAt" || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

/** Structural equality for plain JSON data (key order-insensitive). */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => jsonEqual(v, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
  return ak.length === bk.length && ak.every((k) => jsonEqual(ao[k], bo[k]));
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
  return applyStepChange(prev, todoId, (td) => {
    const existing = td.subtasks ?? [];
    if (existing.length >= MAX_SUBTASKS_PER_TODO) return null;
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
    // If the new sub's day is later than the parent's, push the parent's
    // dueDate forward so the parent never finishes before its sub (keeping
    // its time of day + moving its reminders). ISO days sort lexically.
    const subDay = dueDateOnly(effectiveDueDate);
    const parentDay = dueDateOnly(td.dueDate);
    const withSubs: Todo = { ...td, subtasks: nextSubs };
    // Adding an open subtask reopens a previously-done parent
    // (applyStepChange → syncParentDone clears its Done-bin flags too).
    return subDay && parentDay && subDay > parentDay
      ? withParentDay(withSubs, td, subDay, Date.now())
      : withSubs;
  });
}

/**
 * `next` (a to-do whose steps changed) with its due DAY moved to `day`,
 * keeping the original to-do's time-of-day suffix and moving its upcoming
 * reminders by the same whole-day delta (remindersForDueChange). No-op when
 * the day is unchanged.
 */
function withParentDay(next: Todo, original: Todo, day: string, now: number): Todo {
  if (dueDateOnly(original.dueDate) === day) return next;
  const tIdx = original.dueDate ? original.dueDate.indexOf("T") : -1;
  const due = tIdx === -1 ? day : day + original.dueDate.slice(tIdx);
  const out: Todo = { ...next, dueDate: due };
  const reminders = remindersForDueChange(original, due, now);
  if (reminders) out.reminders = reminders;
  return out;
}

export function subtaskUpdatePriority(
  prev: Todo[],
  todoId: string,
  subId: string,
  priority: Priority,
): Todo[] {
  const sub = findSubtask(prev, todoId, subId);
  if (!sub || sub.priority === priority) return prev;
  const now = Date.now();
  return prev.map((td) => {
    if (td.id !== todoId || !td.subtasks) return td;
    const nextSubs = td.subtasks.map((s) =>
      s.id === subId ? { ...s, priority } : s,
    );
    return { ...td, subtasks: nextSubs, updatedAt: now };
  });
}

/** The step `subId` of to-do `todoId`, if both exist. */
function findSubtask(prev: Todo[], todoId: string, subId: string): Subtask | undefined {
  return prev.find((td) => td.id === todoId)?.subtasks?.find((s) => s.id === subId);
}

export function subtaskUpdateDueDate(
  prev: Todo[],
  todoId: string,
  subId: string,
  dueDate: string,
): Todo[] {
  const sub = findSubtask(prev, todoId, subId);
  if (!sub || (sub.dueDate ?? "") === dueDate) return prev;
  const now = Date.now();
  return prev.map((td) => {
    if (td.id !== todoId || !td.subtasks) return td;
    const nextSubs = td.subtasks.map((s) =>
      s.id === subId ? { ...s, dueDate } : s,
    );
    // Parent's dueDate tracks the LATEST sub due date — every change
    // to any sub recalculates the max across all subs (by design, also when
    // that moves it earlier). ISO yyyy-mm-dd strings sort lexically. If no
    // sub has a date, the parent keeps its existing date so we don't
    // accidentally clear it.
    const maxSubDay = nextSubs.reduce<string>((acc, s) => {
      const d = dueDateOnly(s.dueDate);
      return d && d > acc ? d : acc;
    }, '');
    const withSubs: Todo = { ...td, subtasks: nextSubs, updatedAt: now };
    // Only the DAY follows the steps: the parent keeps its own time of day,
    // and its reminders move with it.
    return maxSubDay ? withParentDay(withSubs, td, maxSubDay, now) : withSubs;
  });
}

/**
 * Toggle one step. Finishing the LAST open step completes the to-do through
 * the same path as todoToggle — Done-bin flags, reminders dropped, and for a
 * series instance the next occurrence appended + reminders transferred;
 * reopening a step reopens the to-do.
 */
export function subtaskToggle(
  prev: Todo[],
  todoId: string,
  subId: string,
  todayISO?: string,
): Todo[] {
  const today = todayISO ?? todayLocal();
  return applyStepChange(prev, todoId, (td) => {
    if (!td.subtasks || !td.subtasks.some((s) => s.id === subId)) return null;
    const nextSubs = td.subtasks.map((s) => {
      if (s.id !== subId) return s;
      const nextS = { ...s, done: !s.done };
      // Stamp per-sub completionDate so Home's daily / weekly / monthly
      // stats can bucket sub completions alongside parent completions.
      if (nextS.done) nextS.completionDate = today;
      else delete nextS.completionDate;
      return nextS;
    });
    return { ...td, subtasks: nextSubs };
  }, today);
}

export function subtaskUpdateText(
  prev: Todo[],
  todoId: string,
  subId: string,
  text: string,
): Todo[] {
  const trimmed = text.slice(0, MAX_SUBTASK_TEXT_LEN);
  const sub = findSubtask(prev, todoId, subId);
  // Missing, or already this text: no change (see todoSet).
  if (!sub || sub.text === trimmed) return prev;
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
  return applyStepChange(prev, todoId, (td) => {
    if (!td.subtasks || !td.subtasks.some((s) => s.id === subId)) return null;
    // Parent done is re-derived only while steps remain (syncParentDone);
    // removing the last open one completes it. If the list becomes empty,
    // the parent keeps whatever state the user last set.
    return { ...td, subtasks: td.subtasks.filter((s) => s.id !== subId) };
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
 * future non-trashed siblings in the same series (dueDate >= target's, or
 * >= `fromDue` when given).
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
    /** null clears it on every sibling (undefined leaves it alone). */
    category?: Category | null;
    notes?: string;
  },
  options: { overwriteDetached?: boolean; fromDue?: string } = {},
): { next: Todo[]; affected: number } {
  const target = prev.find((t) => t.id === id);
  if (!target || !target.seriesId) return { next: prev, affected: 0 };
  // `fromDue`: the occurrence's ORIGINAL date when the same commit also
  // moved this row — "this and future" is measured from where it was.
  const cutoff = options.fromDue ?? target.dueDate;
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
    if (fields.category === null) delete merged.category;
    else if (fields.category !== undefined) merged.category = fields.category;
    if (fields.notes !== undefined) {
      if (fields.notes.length === 0) delete merged.notes;
      else merged.notes = fields.notes.slice(0, MAX_TODO_NOTES_LEN);
    }
    return merged;
  });
  return { next, affected };
}

/**
 * R6c — Propagate a series instance's current subtasks list to every
 * future non-trashed sibling. Cloned fresh per `cloneSubtasksFresh`
 * (new ids, done:false) so each instance gets its own toggleable
 * copy. Respects `keepDetached` so per-instance subtask
 * customizations the user carved out survive the "Keep modified"
 * branch.
 *
 * Pure read of the target's subtasks — callers that want to
 * propagate a different shape than what's currently on the target
 * should mutate the target first via the normal subtask helpers,
 * then call this. TaskDetailsSheet uses exactly that pattern:
 * subtask edits fire live on the row, then this runs at Save.
 */
export function todoApplySeriesSubtasks(
  prev: Todo[],
  id: string,
  options: { keepDetached: boolean; fromDue?: string },
): { next: Todo[]; affected: number } {
  const target = prev.find((t) => t.id === id);
  if (!target || !target.seriesId) return { next: prev, affected: 0 };
  const sid = target.seriesId;
  // `fromDue`: this occurrence's original date (see todoApplySeriesFutureEdits).
  const cutoff = options.fromDue ?? target.dueDate;
  const subs = target.subtasks ?? [];
  const now = Date.now();
  let affected = 0;
  const next = prev.map((td) => {
    if (td.id === id) return td;
    if (td.seriesId !== sid) return td;
    if (td.trashed) return td;
    if (cutoff && td.dueDate && td.dueDate < cutoff) return td;
    if (options.keepDetached && td.detachedFromSeries) return td;
    affected += 1;
    const fresh = cloneSubtasksFresh(subs);
    const merged: Todo = { ...td, updatedAt: now };
    if (fresh) merged.subtasks = fresh;
    else delete merged.subtasks;
    return merged;
  });
  return { next, affected };
}
/**
 * End a series BEFORE `cutoffDue`: every member that still repeats gets
 * recurrence.endDate = the day before. Used by every "end the series" action
 * (delete series, move this & future to the bin, skip all, stop repeating) so an OLDER open
 * occurrence (e.g. yesterday's, still undone) can't revive it — top-up and
 * append both stop at endDate.
 */
export function seriesEndBefore(todos: Todo[], seriesId: string | undefined, cutoffDue: string): Todo[] {
  const cutoff = dueDateOnly(cutoffDue);
  if (!seriesId || !cutoff) return todos;
  const d = new Date(`${cutoff}T00:00:00`);
  d.setDate(d.getDate() - 1);
  const endDate = isoDate(d);
  const now = Date.now();
  return todos.map((td) => {
    if (td.seriesId !== seriesId || !td.recurrence) return td;
    if (td.recurrence.endDate && td.recurrence.endDate <= endDate) return td;
    return { ...td, recurrence: { ...td.recurrence, endDate }, updatedAt: now };
  });
}


/**
 * R6b — Frequency-change apply for a series. Writes the new
 * recurrence to the target row, snaps its `dueDate` to the first
 * matching occurrence if needed, REMOVES every future open sibling
 * (modulo `keepDetached`; `trashedCount` counts them — the UI says
 * "replaced"), detaches the future ones already in the bin into plain
 * one-offs, then re-expands a fresh tail from the target via
 * `expandSeries`.
 *
 * Pass `newRecurrence === undefined` to stop the series here: the
 * target keeps its `seriesId` for "delete this and all future"
 * symmetry, but no new tail is generated.
 *
 * `keepDetached: true` preserves siblings the user explicitly
 * carved out via R6a's detach — they stay as one-off rows (seriesId
 * dropped); `false` removes them too ("Recreate all").
 *
 * `fromDue`: the occurrence's ORIGINAL date when the same commit also moved
 * this row (the "this and future" cutoff) — defaults to its current date;
 * either way no later than the day its generated id names (a row snoozed past
 * its siblings).
 * `rebuild`: re-expand even when the rule is unchanged (a just-captured
 * series whose start date moved).
 *
 * Resuming an ENDED series (its end date already past, the new rule open or
 * ending today or later) drops the occurrences Skip all / "this & future to
 * the bin" left in the Done bin AFTER today, so the series restarts tomorrow
 * instead of after the skipped stretch (they'd otherwise read as its tail).
 */
export function todoApplyRecurrenceChange(
  prev: Todo[],
  id: string,
  newRecurrence: Recurrence | undefined,
  todayISO: string,
  options: { keepDetached?: boolean; fromDue?: string; rebuild?: boolean } = {},
): { next: Todo[]; trashedCount: number } {
  const target = prev.find((t) => t.id === id);
  if (!target || !target.seriesId) return { next: prev, trashedCount: 0 };
  const sid = target.seriesId;
  const today = dueDateOnly(todayISO);
  const oldEnd = target.recurrence?.endDate;
  const resumes = !!newRecurrence && liftsEnd(oldEnd, newRecurrence.endDate, today);
  // A new rule (or a resume) starts a fresh horizon — the old one's
  // materializedThrough must not hold the new tail back.
  const freshRule = newRecurrence ? withoutHorizon(newRecurrence) : undefined;
  if (resumes && oldEnd) {
    prev = dropSkippedAfter(prev, sid, id, oldEnd > today ? oldEnd : today, newRecurrence?.endDate);
    // Resuming FROM a skipped / binned occurrence (opened from Done) on or
    // after today reopens it — it is the series' live row again, not a
    // leftover that keeps the tail (or the whole series) dead.
    if (target.trashed && !target.done && dueDateOnly(target.dueDate) >= today) {
      prev = todosRestoreFromTrash(prev, new Set([id]));
    }
  }
  // Same repeat rule (only the end date differs, or nothing): patch the
  // series' endDate instead of rebuilding it — a rebuild would re-anchor a
  // "31st" series on the target's own (shorter-month) day.
  if (freshRule && sameRule(target.recurrence, freshRule) && !options.rebuild) {
    return seriesSetEndDate(prev, target, freshRule.endDate, todayISO, !!options.keepDetached);
  }
  // "This and future" starts at this occurrence's own day: a row snoozed past
  // its siblings still stands for the day its generated id names, so the
  // siblings in between are replaced too (else a mixed series).
  const from = options.fromDue ?? target.dueDate;
  const idDay = seriesIdDay(target.id, sid);
  const cutoff = idDay && (!from || idDay < from) ? idDay : from;
  const now = Date.now();
  // 1) Update target's recurrence (+ snap dueDate if a weekday
  //    filter dictates a different anchor day).
  const snappedDueDate = newRecurrence
    ? snapDueDateToRecurrence(target.dueDate, newRecurrence)
    : target.dueDate;
  let updated = prev.map((td) => {
    if (td.id !== id) {
      // A member kept from before the change drops its old horizon.
      if (td.seriesId !== sid || !td.recurrence?.materializedThrough) return td;
      return { ...td, recurrence: withoutHorizon(td.recurrence), updatedAt: now };
    }
    const next: Todo = {
      ...td,
      dueDate: snappedDueDate,
      updatedAt: now,
    };
    // A new rule anchors on the target's own (snapped) day.
    if (freshRule) next.recurrence = recurrenceWithAnchor(freshRule, snappedDueDate);
    else delete next.recurrence;
    return next;
  });
  // 2) Replace the future siblings (old rule) of the same series: open ones
  //    are removed outright; ones already in the bin, and detached ones kept
  //    via keepDetached, leave the series as plain one-offs. Either way no
  //    superseded row stays a series member — top-up / append measure the
  //    tail from the latest member, so an old-rule row weeks out would
  //    otherwise open a gap in the new tail.
  let trashedCount = 0;
  const superseded = (td: Todo) =>
    td.id !== id && td.seriesId === sid && !(cutoff && td.dueDate && td.dueDate < cutoff);
  updated = updated.flatMap((td) => {
    if (!superseded(td)) return [td];
    const isOpen = !td.trashed;
    const keep = !isOpen || (options.keepDetached && td.detachedFromSeries);
    if (!keep) {
      trashedCount += 1;
      return [];
    }
    const oneOff: Todo = { ...td, updatedAt: now };
    delete oneOff.seriesId;
    delete oneOff.recurrence;
    delete oneOff.detachedFromSeries;
    return [oneOff];
  });
  // 3) If recurrence is set, re-expand from the (newly-snapped) target.
  if (!freshRule) return { next: seriesEndBefore(updated, sid, cutoff), trashedCount };
  const updatedTarget = updated.find((t) => t.id === id);
  if (!updatedTarget) return { next: updated, trashedCount };
  // The new rule anchors on the target's own day — not the earliest member's
  // under the OLD rule (daily from the 31st changed to monthly on Nov 30 must
  // go Dec 30, Jan 30).
  const ownDay = Number(dueDateOnly(updatedTarget.dueDate).slice(8, 10));
  const expanded = expandSeries(
    updatedTarget,
    todayISO,
    Number.isFinite(ownDay) && ownDay > 0 ? ownDay : undefined,
    new Set(updated.map((td) => td.id)),
  );
  // expanded[0] is the target itself — already in `updated`. Days a former
  // member still holds (a done / skipped / binned / kept-detached one-off,
  // now or from an earlier change) aren't minted again — that would land as
  // a `_2` duplicate next to it.
  const held = heldSeriesDays(updated, sid, id);
  const tail = expanded.slice(1).filter((td) => !held.has(dueDateOnly(td.dueDate)));
  return { next: [...updated, ...tail], trashedCount };
}

/**
 * The endDate-only branch of todoApplyRecurrenceChange (the rule itself is
 * unchanged): every member keeps its rule — stored anchorDay included — with
 * `endDate` replaced (or cleared). Members now past a shortened end leave the
 * series exactly as superseded rows do on a rule change (open ones removed and
 * counted, binned / kept-detached ones become one-offs); an extended or
 * cleared end tops the series up to its window.
 */
function seriesSetEndDate(
  prev: Todo[],
  target: Todo,
  endDate: string | undefined,
  todayISO: string,
  keepDetached: boolean,
): { next: Todo[]; trashedCount: number } {
  const sid = target.seriesId as string;
  const end = endDate ? dueDateOnly(endDate) : "";
  const now = Date.now();
  // A resume (the end lifted or moved later) regrows the days past the old
  // end, so the horizon those rows / a stamped materializedThrough held past
  // it goes too (todoApplyRecurrenceChange already dropped the binned rows).
  const oldEnd = target.recurrence?.endDate;
  const resumes = liftsEnd(oldEnd, end || undefined, dueDateOnly(todayISO));
  let trashedCount = 0;
  let changed = false;
  const kept = prev.flatMap((td) => {
    if (td.seriesId !== sid) return [td];
    const day = dueDateOnly(td.dueDate);
    if (td.id !== target.id && end && day && day > end) {
      changed = true;
      if (!td.trashed && !(keepDetached && td.detachedFromSeries)) {
        trashedCount += 1;
        return [];
      }
      const oneOff: Todo = { ...td, updatedAt: now };
      delete oneOff.seriesId;
      delete oneOff.recurrence;
      delete oneOff.detachedFromSeries;
      return [oneOff];
    }
    if (!td.recurrence) return [td];
    const mt = td.recurrence.materializedThrough;
    const dropHorizon = resumes && !!mt && !!oldEnd && mt > oldEnd;
    if ((td.recurrence.endDate ?? "") === end && !dropHorizon) return [td];
    const rec: Recurrence = dropHorizon ? withoutHorizon(td.recurrence) : { ...td.recurrence };
    if (end) rec.endDate = end;
    else delete rec.endDate;
    changed = true;
    return [{ ...td, recurrence: rec, updatedAt: now }];
  });
  // Nothing to change (the same rule restated): the very same list, so the
  // caller sees a no-op (no Undo, no write).
  const next = changed ? kept : prev;
  if (!resumes || !oldEnd) return { next: topUpSeries(next, sid, todayISO), trashedCount };
  // A resume regrows from the day after the old end (or today, when later) by
  // the rule — not from the latest kept row (a binned one past the old end
  // would hide the days before it) and even when no live member is left (the
  // target, opened from Done, is then the template).
  const today = dueDateOnly(todayISO);
  const dayAfterEnd = addDaysISO(oldEnd, 1);
  const template = next.find((td) => td.id === target.id) ?? target;
  return {
    next: growSeries(next, sid, todayISO, { from: dayAfterEnd > today ? dayAfterEnd : today, template }),
    trashedCount,
  };
}

/** `iso` (YYYY-MM-DD…) plus `n` calendar days, as YYYY-MM-DD. */
function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${dueDateOnly(iso)}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/**
 * True when a series' end is lifted: it had an end (`oldEnd`) and the new
 * rule has none, or a later one that isn't already past — a RESUME, whether
 * the old end is past ("restart") or still ahead ("this & future to the bin",
 * then the end cleared the same day). The days after the old end were cut
 * (binned / skipped rows, a stamped horizon) and must be regrown.
 */
function liftsEnd(oldEnd: string | undefined, newEnd: string | undefined, today: string): boolean {
  if (!oldEnd) return false;
  if (!newEnd) return true;
  const end = dueDateOnly(newEnd);
  return end > oldEnd && end >= today;
}

/** `rec` without its materializedThrough horizon (same object when absent). */
function withoutHorizon(rec: Recurrence): Recurrence {
  if (rec.materializedThrough === undefined) return rec;
  const { materializedThrough: _m, ...rest } = rec;
  return rest;
}

/** Drop `seriesId`'s binned, not-done rows (skipped / moved to the bin as
 * "this & future") dated after `after` (the later of today and the old end)
 * and up to the new end `until` (none = no bound) — except `exceptId`. A
 * resumed series regrows those days. */
function dropSkippedAfter(
  todos: Todo[],
  seriesId: string,
  exceptId: string,
  after: string,
  until: string | undefined,
): Todo[] {
  const end = until ? dueDateOnly(until) : "";
  const drop = (td: Todo) => {
    if (td.seriesId !== seriesId || td.id === exceptId || !td.trashed || td.done) return false;
    const d = dueDateOnly(td.dueDate);
    return d > after && (!end || d <= end);
  };
  return todos.some(drop) ? todos.filter((td) => !drop(td)) : todos;
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
 * Falls back to a single-todo trash when the target has no seriesId (a
 * one-off).
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
  return { next: seriesEndBefore(next, target.seriesId, cutoff), affected };
}

/**
 * Skip this occurrence AND all future siblings in the series — the
 * "Skip all" action. Mirrors todoMoveToTrashFutureSeries' targeting (same
 * seriesId, dueDate >= this row's, not already done/trashed) but applies
 * skip semantics (status 'notDo' + completionDate) rather than a plain
 * trash, and does NOT append a next instance (the series is being ended).
 * Falls back to a single-occurrence skip for a one-off (no seriesId).
 */
export function todoSkipSeriesFuture(
  prev: Todo[],
  id: string,
  todayISO?: string,
): { next: Todo[]; affected: number } {
  const target = prev.find((t) => t.id === id);
  if (!target) return { next: prev, affected: 0 };
  const today = todayISO ?? todayLocal();
  if (!target.seriesId) {
    return { next: todoSkip(prev, id, today), affected: 1 };
  }
  const cutoff = target.dueDate;
  const now = Date.now();
  let affected = 0;
  const next = prev.map((td) => {
    if (td.seriesId !== target.seriesId) return td;
    if (td.trashed || td.done) return td;
    if (cutoff && td.dueDate && td.dueDate < cutoff) return td;
    affected += 1;
    const out: Todo = {
      ...td,
      status: "notDo",
      trashed: true,
      trashedAt: now,
      completionDate: today,
      updatedAt: now,
    };
    delete out.reminders;
    return out;
  });
  return { next: seriesEndBefore(next, target.seriesId, cutoff), affected };
}

// ---- Recurring series: horizon/window helpers ---------------------------
//
// Pure functions backing the pre-materialized series model: compose
// (expandSeries), completion / skip (appendNextSeriesInstance), app-open
// horizon top-up (topUpAllSeries), and the series edit dialogs.

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
 *  - Seed retains its existing `id`, `reminders`, `subtasks`, `notes`;
 *    each generated instance gets the seed's reminders rebased onto it.
 *  - Generated instances get deterministic ids (seriesInstanceId), the shared `seriesId`
 *    (assigned if seed lacks one), and `cloneSubtasksFresh(seed.subtasks)`.
 *  - Any time-suffix on the seed's dueDate is preserved on each instance.
 *  - Occurrences before `todayISO` are not generated (no back-fill).
 *  - `takenIds` — ids already in the list; a clash falls back to a UUID.
 *  - No-op if seed lacks `recurrence` or `dueDate` — returns `[seed]`.
 *  - `anchorDay` — the series' day-of-month when re-expanding an existing
 *    series (see seriesAnchorDay); defaults to the seed's.
 */
export function expandSeries(
  seed: Todo,
  todayISO: string,
  anchorDay?: number,
  takenIds?: ReadonlySet<string>,
): Todo[] {
  if (!seed.recurrence || !seed.dueDate) return [seed];
  const seedDateOnly = dueDateOnly(seed.dueDate);
  const tIdx = seed.dueDate.indexOf("T");
  const timeSuffix = tIdx === -1 ? "" : seed.dueDate.slice(tIdx);
  const cutoff = windowCutoffFor(seed.recurrence.freq, todayISO);
  const hardEnd = seed.recurrence.endDate && seed.recurrence.endDate < cutoff ? seed.recurrence.endDate : cutoff;
  const seriesId = seed.seriesId ?? genUuid();
  // The day-of-month anchor: the caller's, else the rule's stored one, else
  // (expandRecurrence's default) the first occurrence's own day — then
  // stamped on the rule so it outlives the members it was derived from.
  const anchor = anchorDay ?? storedAnchorDay(seed.recurrence);
  const dates = hardEnd < seedDateOnly ? [] : expandRecurrence(seedDateOnly, hardEnd, seed.recurrence, anchor);
  const rec = recurrenceWithAnchor(seed.recurrence, dates[0] ?? seedDateOnly, anchor);
  const head: Todo = { ...seed, seriesId, recurrence: rec };
  if (hardEnd < seedDateOnly) return [head];
  // dates[0] is the seed itself only when the seed sits on the rule; a seed
  // that doesn't match (e.g. an un-snapped date) must not swallow the first
  // real occurrence.
  const firstNew = dates[0] === seedDateOnly ? 1 : 0;
  if (dates.length <= firstNew) return [head];
  const now = Date.now();
  // Seed reminders rebased onto each instance below, so every
  // occurrence reminds at the same time-of-day / before-due offset — the
  // "9:30 on each occurrence" behavior. Without this, only the seed kept
  // its reminders and future instances had none.
  const seedReminders = getReminders(seed);
  const out: Todo[] = [head];
  // Generate instances for every date after the seed — but never for a day
  // already past: a seed in the past is itself the one carried-over row; the
  // occurrences it missed are not back-filled.
  const today = dueDateOnly(todayISO);
  const taken = new Set(takenIds ?? []);
  taken.add(seed.id);
  for (let i = firstNew; i < dates.length; i++) {
    if (dates[i] < today) continue;
    const instDue = dates[i] + timeSuffix;
    const id = seriesInstanceId(seriesId, dates[i], taken);
    taken.add(id);
    const inst: Todo = {
      id,
      text: seed.text,
      done: false,
      priority: seed.priority,
      dueDate: instDue,
      trashed: false,
      updatedAt: now,
      seriesId,
      recurrence: rec,
    };
    if (seed.category) inst.category = seed.category;
    const subs = cloneSubtasksFresh(seed.subtasks);
    if (subs) inst.subtasks = subs;
    if (seed.notes) inst.notes = seed.notes;
    if (seedReminders.length > 0) {
      inst.reminders = rebaseReminders(seedReminders, seed.dueDate as string, instDue);
    }
    out.push(inst);
  }
  return out;
}

/** Max length of a generated series-instance id (the agent tools cap todo
 * ids at 64 chars). Longer (untrusted) seriesIds fall back to a UUID. */
const MAX_SERIES_INSTANCE_ID_LEN = 64;

/**
 * Deterministic id for a GENERATED series occurrence: `${seriesId}_${day}`.
 * Two devices topping up the same series on the same days mint the same ids,
 * so the three-way merge collapses them instead of keeping duplicates. The
 * separator is `_`, not `:` — notification identifiers split todo ids on
 * colons (mobile/src/adapters/reminderId.ts). When that id is already taken
 * (e.g. a superseded row kept after a rule change) the next free
 * `${seriesId}_${day}_2` … `_9` is used — still deterministic, so two devices
 * resolving the same clash agree. Falls back to a fresh UUID only when every
 * candidate is taken or the id would be too long.
 */
export function seriesInstanceId(
  seriesId: string,
  day: string,
  taken?: ReadonlySet<string>,
): string {
  const base = `${seriesId}_${dueDateOnly(day)}`;
  for (let n = 1; n <= 9; n++) {
    const id = n === 1 ? base : `${base}_${n}`;
    if (id.length > MAX_SERIES_INSTANCE_ID_LEN) break;
    if (!taken?.has(id)) return id;
  }
  return genUuid();
}

/**
 * True when `td`'s id is the one seriesInstanceId mints for its CURRENT day
 * (`${seriesId}_${day}` or a `_2`…`_9` clash variant) — i.e. a generated
 * occurrence that has not been moved off its day since. A snoozed /
 * rescheduled row (id names another day) or the user's own seed (a UUID)
 * never matches.
 */
export function isGeneratedSeriesRow(td: Todo): boolean {
  const day = dueDateOnly(td.dueDate);
  if (!td.seriesId || !day) return false;
  const base = `${td.seriesId}_${day}`;
  return td.id === base || (td.id.startsWith(`${base}_`) && /^[2-9]$/.test(td.id.slice(base.length + 1)));
}

/**
 * Two rules repeat the same way AND end the same day: freq, interval (absent
 * = 1), byWeekday / bySetPos (order-sensitive; absent = empty) and endDate
 * (absent = none). The derived anchorDay / materializedThrough are ignored.
 * Lets a UI skip a no-op rule change. Both undefined → true.
 */
export function recurrenceRuleEquals(a: Recurrence | undefined, b: Recurrence | undefined): boolean {
  if (!a || !b) return !a && !b;
  return sameRule(a, b) && dueDateOnly(a.endDate ?? "") === dueDateOnly(b.endDate ?? "");
}

/** Same repeat rule, ignoring endDate (which "end the series" rewrites). */
function sameRule(a: Recurrence | undefined, b: Recurrence): boolean {
  if (!a) return false;
  const list = (v: number[] | undefined) => (v && v.length > 0 ? v.join(",") : "");
  return (
    a.freq === b.freq &&
    (a.interval ?? 1) === (b.interval ?? 1) &&
    list(a.byWeekday) === list(b.byWeekday) &&
    list(a.bySetPos) === list(b.bySetPos)
  );
}

/** True for a rule whose occurrences sit on a day-of-month (monthly / yearly
 * without a weekday filter) — the only rules an anchor day applies to. */
function usesAnchorDay(rec: Recurrence): boolean {
  return (rec.freq === "monthly" || rec.freq === "yearly") && !(rec.byWeekday && rec.byWeekday.length > 0);
}

/** A valid stored anchor day (int 1..31), else undefined. */
function storedAnchorDay(rec: Recurrence): number | undefined {
  const d = rec.anchorDay;
  return typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 31 ? d : undefined;
}

/**
 * `rec` with `anchorDay` set to `due`'s day-of-month for a monthly / yearly
 * rule (or `day` when given), and stripped for any other rule. Called when a
 * series is created or its rule changes, so the anchor survives the Done-bin
 * purge of the series' earlier members.
 */
export function recurrenceWithAnchor(rec: Recurrence, due: string, day?: number): Recurrence {
  const anchor = day ?? Number(dueDateOnly(due).slice(8, 10));
  if (usesAnchorDay(rec) && Number.isInteger(anchor) && anchor >= 1 && anchor <= 31) {
    return rec.anchorDay === anchor ? rec : { ...rec, anchorDay: anchor };
  }
  if (rec.anchorDay === undefined) return rec;
  const { anchorDay: _a, ...rest } = rec;
  return rest;
}

/**
 * First occurrence strictly after `from` that lands on/after `today` — where
 * a lapsed series' new rows start. A series that sat idle (last row weeks
 * ago) resumes from today rather than back-filling every missed occurrence:
 * its existing newest missed row stays as the one "carried over" item.
 */
function firstOccurrenceFrom(
  from: string,
  today: string,
  rec: Recurrence,
  anchor: number | undefined,
): string {
  const interval = rec.interval ?? 1;
  let cursor = nextOccurrence(from, rec.freq, interval, rec.byWeekday, rec.bySetPos, anchor);
  // Bounded: a daily series idle for ten years is ~3650 steps.
  for (let guard = 0; cursor < today && guard < 10000; guard++) {
    cursor = nextOccurrence(cursor, rec.freq, interval, rec.byWeekday, rec.bySetPos, anchor);
  }
  return cursor;
}

/**
 * The anchor day for a series' CURRENT rule: `recurrence.anchorDay` when
 * stored, else seriesAnchorDay over only the
 * members that repeat by `rec` — members left from before a rule change
 * (e.g. daily from the 31st, changed to monthly on the 30th) must not drag
 * the new rule's day-of-month back to the old one.
 */
function currentRuleAnchorDay(members: Todo[], rec: Recurrence): number | undefined {
  // The rule's own anchor wins: the earliest SURVIVING member drifts once the
  // Done bin purges older ones (Apr 30 left → a "31st" series stuck on 30).
  const stored = storedAnchorDay(rec);
  if (stored !== undefined) return stored;
  return seriesAnchorDay(members.filter((m) => sameRule(m.recurrence, rec)));
}

/**
 * A series' day-of-month anchor: the day of its EARLIEST member's dueDate
 * (any state). Monthly/yearly advances aim for it so a series on the 31st
 * (or Feb 29) recovers after a short month instead of drifting — see
 * nextOccurrence. Undefined when no member has a date.
 */
function seriesAnchorDay(members: Todo[]): number | undefined {
  let earliest = "";
  for (const m of members) {
    const d = dueDateOnly(m.dueDate);
    if (d && (!earliest || d < earliest)) earliest = d;
  }
  const day = Number(earliest.slice(8, 10));
  return earliest && Number.isFinite(day) && day > 0 ? day : undefined;
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
  return growSeries(todos, seriesId, todayISO);
}

/**
 * topUpSeries' engine. `resume` (a resumed series — see seriesSetEndDate):
 * grow from the first occurrence on/after `resume.from` instead of past the
 * series' horizon, skipping days a member already stands for, and fall back
 * to `resume.template` when no open member is left.
 */
function growSeries(
  todos: Todo[],
  seriesId: string,
  todayISO: string,
  resume?: { from: string; template: Todo },
): Todo[] {
  if (!seriesId) return todos;
  const members = todos.filter((t) => t.seriesId === seriesId);
  if (members.length === 0) return todos;
  // The series' horizon: its latest occurrence day, any state (see
  // seriesHorizon — a row moved off its day doesn't count where it went, and
  // a deleted tail still counts).
  const latest = seriesHorizon(members, seriesId);
  if (!latest && !resume) return todos;
  // A series is only alive while at least one OPEN member still repeats.
  // Delete series / this & future to the bin (todoMoveToTrashFutureSeries) /
  // Skip all / Stop repeating / deleting the
  // category all leave no open repeating member — and a trashed member must
  // never be the template, or the series regrows on the next launch. (A
  // resume names its template explicitly — the user just restarted it.)
  const live = members.filter((m) => !m.trashed && !m.done && m.recurrence);
  if (live.length === 0 && !resume?.template.recurrence) return todos;
  // Inheritance: prefer the latest non-detached live row so per-instance
  // tweaks don't propagate forward via top-up.
  let inheritFrom: Todo | undefined;
  let inheritLatest = "";
  for (const m of live) {
    if (m.detachedFromSeries) continue;
    const d = dueDateOnly(m.dueDate);
    if (d && d > inheritLatest) {
      inheritLatest = d;
      inheritFrom = m;
    }
  }
  if (!inheritFrom) inheritFrom = live[0] ?? resume?.template;
  if (!inheritFrom?.recurrence) return todos;
  const rec = inheritFrom.recurrence;
  const cutoff = windowCutoffFor(rec.freq, todayISO);
  const hardEnd = rec.endDate && rec.endDate < cutoff ? rec.endDate : cutoff;
  if (!resume && latest >= hardEnd) return todos;
  const inheritDD = inheritFrom.dueDate;
  const tIdx = inheritDD.indexOf("T");
  const timeSuffix = tIdx === -1 ? "" : inheritDD.slice(tIdx);
  const interval = rec.interval ?? 1;
  const now = Date.now();
  const inheritReminders = getReminders(inheritFrom);
  const anchor = currentRuleAnchorDay(members, rec);
  const additions: Todo[] = [];
  const taken = new Set(todos.map((t) => t.id));
  const held = heldSeriesDays(todos, seriesId);
  const newRowRule = withoutHorizon(rec);
  // A lapsed series resumes at today — no flood of back-filled overdue rows.
  let cursor = resume
    ? resumeCursor(members, seriesId, resume.from, resume.template, rec, anchor, held)
    : firstOccurrenceFrom(latest, dueDateOnly(todayISO), rec, anchor);
  let guard = 0;
  while (cursor <= hardEnd && guard < MAX_RECURRENCE_INSTANCES) {
    if (held.has(cursor)) {
      cursor = nextOccurrence(cursor, rec.freq, interval, rec.byWeekday, rec.bySetPos, anchor);
      guard += 1;
      continue;
    }
    const instDue = cursor + timeSuffix;
    const id = seriesInstanceId(seriesId, cursor, taken);
    taken.add(id);
    const inst: Todo = {
      id,
      text: inheritFrom.text,
      done: false,
      priority: inheritFrom.priority,
      dueDate: instDue,
      trashed: false,
      updatedAt: now,
      seriesId,
      // A new row lies past any stamped horizon — it carries none.
      recurrence: newRowRule,
    };
    if (inheritFrom.category) inst.category = inheritFrom.category;
    const subs = cloneSubtasksFresh(inheritFrom.subtasks);
    if (subs) inst.subtasks = subs;
    if (inheritFrom.notes) inst.notes = inheritFrom.notes;
    if (inheritReminders.length > 0) {
      inst.reminders = rebaseReminders(inheritReminders, inheritDD, instDue);
    }
    additions.push(inst);
    cursor = nextOccurrence(cursor, rec.freq, interval, rec.byWeekday, rec.bySetPos, anchor);
    guard += 1;
  }
  if (additions.length === 0) return todos;
  return [...todos, ...additions];
}

/**
 * Where a resumed series regrows: the first occurrence on/after `from`, on
 * the rule's grid as walked from the latest member before `from` (else from
 * the template's own day). Days a member already stands for (by occurrence
 * day, the user's UUID seed included) are added to `held` so they're not
 * minted again.
 */
function resumeCursor(
  members: Todo[],
  seriesId: string,
  from: string,
  template: Todo,
  rec: Recurrence,
  anchor: number | undefined,
  held: Set<string>,
): string {
  let base = "";
  for (const m of members) {
    const d = occurrenceDay(m, seriesId);
    if (d) held.add(d);
    if (d && d < from && d > base) base = d;
  }
  if (base) return firstOccurrenceFrom(base, from, rec, anchor);
  const own = occurrenceDay(template, seriesId);
  return !own || own >= from ? own || from : firstOccurrenceFrom(own, from, rec, anchor);
}

/**
 * The day a series occurrence id names (`${seriesId}_${day}` or a `_2`…`_9`
 * clash variant), else "" (a UUID seed, another series' id).
 */
function seriesIdDay(id: string, seriesId: string): string {
  const prefix = `${seriesId}_`;
  if (!id.startsWith(prefix)) return "";
  const m = /^(\d{4}-\d{2}-\d{2})(?:_[2-9])?$/.exec(id.slice(prefix.length));
  return m ? m[1] : "";
}

/** The occurrence day a series row stands for: the day its generated id
 * names — a row moved (snoozed / rescheduled) elsewhere still stands for
 * it — else its own due day. */
function occurrenceDay(td: Todo, seriesId: string): string {
  return seriesIdDay(td.id, seriesId) || dueDateOnly(td.dueDate);
}

/**
 * The series' latest occurrence day, measured from its generated rows by the
 * day their id names — NOT where a row was moved to: an occurrence moved past
 * the window must not read as the tail (that left a permanent gap), and one
 * moved earlier must not let its own day be minted again. Rows without a
 * generated id (the user's seed) count only when no generated row exists.
 */
function seriesLatestDay(members: Todo[], seriesId: string): string {
  let latest = "";
  let fallback = "";
  for (const m of members) {
    const idDay = seriesIdDay(m.id, seriesId);
    if (idDay) {
      if (idDay > latest) latest = idDay;
      continue;
    }
    const d = dueDateOnly(m.dueDate);
    if (d && d > fallback) fallback = d;
  }
  return latest || fallback;
}

/**
 * How far `seriesId` has been generated: seriesLatestDay, or a member's
 * stamped materializedThrough when later (its latest rows were hard-deleted
 * — those days must not be minted again).
 */
function seriesHorizon(members: Todo[], seriesId: string): string {
  let h = seriesLatestDay(members, seriesId);
  for (const m of members) {
    const mt = m.recurrence?.materializedThrough;
    if (mt && mt > h) h = mt;
  }
  return h;
}

/**
 * After a hard delete (`after` = `before` minus some rows): every series that
 * lost rows and whose horizon dropped gets the old horizon stamped on its
 * surviving members (recurrence.materializedThrough), so the deleted latest
 * occurrences are never regenerated by top-up / completion. Returns `after`
 * unchanged when no horizon dropped.
 */
export function keepSeriesHorizons(before: Todo[], after: Todo[]): Todo[] {
  if (after.length === before.length) return after;
  const kept = new Set(after.map((td) => td.id));
  const lost = new Set<string>();
  for (const td of before) if (td.seriesId && !kept.has(td.id)) lost.add(td.seriesId);
  if (lost.size === 0) return after;
  const stamp = new Map<string, string>();
  for (const sid of lost) {
    const was = seriesHorizon(before.filter((td) => td.seriesId === sid), sid);
    const remaining = after.filter((td) => td.seriesId === sid);
    if (remaining.length > 0 && was && seriesHorizon(remaining, sid) < was) stamp.set(sid, was);
  }
  if (stamp.size === 0) return after;
  const now = Date.now();
  return after.map((td) => {
    const h = td.seriesId ? stamp.get(td.seriesId) : undefined;
    if (!h || !td.recurrence) return td;
    return { ...td, recurrence: { ...td.recurrence, materializedThrough: h }, updatedAt: now };
  });
}

/**
 * Days of `seriesId` already held by a row carrying that day's generated id —
 * a member, or a former member that left the series as a one-off (done,
 * skipped, binned or a kept detached edit), whatever its state or where it
 * was moved. Minting that day again would add a `_2` duplicate next to it.
 * `exceptId` (the row a rule change re-anchors) holds nothing.
 */
function heldSeriesDays(todos: Todo[], seriesId: string, exceptId?: string): Set<string> {
  const days = new Set<string>();
  for (const td of todos) {
    if (td.id === exceptId) continue;
    const day = seriesIdDay(td.id, seriesId);
    if (day) days.add(day);
  }
  return days;
}

/**
 * Append exactly one new instance one period past the series' current
 * tail. Called by `todoToggle` on every series completion so the user
 * always sees a stable number of future instances queued ("1
 * completion = 1 new tail"). Distinct from `topUpSeries`, which is
 * window-driven and used by migration + app-open catch-up.
 *
 * `todayISO` (optional): when given, the new occurrence is the first one
 * after the tail that lands on/after today — a lapsed series doesn't get an
 * overdue row appended. Omitted → strictly one period past the tail.
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
  todayISO?: string,
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
  // Cursor advances strictly after the series' latest occurrence day (any
  // state; see seriesLatestDay) so we don't double-up on a
  // recently-completed instance.
  const latest = seriesHorizon(members, seriesId);
  if (!latest) return todos;
  const anchor = currentRuleAnchorDay(members, rec);
  // With `todayISO`, a lapsed series resumes at today (as topUpSeries does)
  // instead of appending one more already-overdue occurrence.
  let next = todayISO
    ? firstOccurrenceFrom(latest, dueDateOnly(todayISO), rec, anchor)
    : nextOccurrence(latest, rec.freq, rec.interval ?? 1, rec.byWeekday, rec.bySetPos, anchor);
  // A day a former member still holds isn't minted again (a `_2` duplicate).
  const held = heldSeriesDays(todos, seriesId);
  for (let guard = 0; held.has(next) && guard < MAX_RECURRENCE_INSTANCES; guard++) {
    next = nextOccurrence(next, rec.freq, rec.interval ?? 1, rec.byWeekday, rec.bySetPos, anchor);
  }
  if (rec.endDate && next > rec.endDate) return todos;
  const tIdx = inheritFrom.dueDate.indexOf("T");
  const timeSuffix = tIdx === -1 ? "" : inheritFrom.dueDate.slice(tIdx);
  const now = Date.now();
  const instDue = next + timeSuffix;
  const inst: Todo = {
    id: seriesInstanceId(seriesId, next, new Set(todos.map((t) => t.id))),
    text: inheritFrom.text,
    done: false,
    priority: inheritFrom.priority,
    dueDate: instDue,
    trashed: false,
    updatedAt: now,
    seriesId,
    // The new row lies past any stamped horizon — it carries none.
    recurrence: withoutHorizon(rec),
  };
  if (inheritFrom.category) inst.category = inheritFrom.category;
  const subs = cloneSubtasksFresh(inheritFrom.subtasks);
  if (subs) inst.subtasks = subs;
  if (inheritFrom.notes) inst.notes = inheritFrom.notes;
  const appendReminders = getReminders(inheritFrom);
  if (appendReminders.length > 0) {
    inst.reminders = rebaseReminders(appendReminders, inheritFrom.dueDate, instDue);
  }
  return [...todos, inst];
}

/**
 * R7 — Returns the next-upcoming open instance of a series. "Open"
 * means not trashed, not done, not status==='notDo'. "Next-upcoming"
 * means the earliest `dueDate >= todayISO`; if every open instance
 * is already overdue, the earliest open instance overall is
 * returned so the user still has a row to attach the reminder to.
 * `excludeId` lets callers (R7 reminder transfer in todoToggle /
 * todoSkip) skip the just-completed row.
 */
export function nextUpcomingSeriesInstance(
  todos: Todo[],
  seriesId: string,
  todayISO: string,
  excludeId?: string,
): Todo | undefined {
  if (!seriesId) return undefined;
  const today = dueDateOnly(todayISO);
  const candidates = todos
    .filter((t) => {
      if (t.seriesId !== seriesId) return false;
      if (excludeId && t.id === excludeId) return false;
      if (t.trashed || t.done) return false;
      if (t.status === "notDo") return false;
      if (!t.dueDate) return false;
      return true;
    })
    .sort((a, b) => dueDateOnly(a.dueDate).localeCompare(dueDateOnly(b.dueDate)));
  if (candidates.length === 0) return undefined;
  const future = candidates.find((c) => dueDateOnly(c.dueDate) >= today);
  return future ?? candidates[0];
}

/** Stable identity for a reminder, ignoring its id — two entries with
 * the same at/offset/interval are the same reminder to the user (and to
 * the OS scheduler). Used to drop accidental duplicates. */
export function reminderKey(r: Reminder): string {
  return `${r.at}|${r.offsetMinutes ?? ''}|${r.intervalMinutes ?? ''}`;
}

/** Drop duplicate reminders (same at/offset/interval), keeping the first.
 * Guards against double-applies stacking
 * identical reminders (which would double-fire notifications). */
export function dedupeReminders(rs: Reminder[]): Reminder[] {
  const seen = new Set<string>();
  const out: Reminder[] = [];
  for (const r of rs) {
    const k = reminderKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/** A todo's reminders, deduped (same at/offset/interval). Empty when unset. */
export function getReminders(td: Todo): Reminder[] {
  return td.reminders && td.reminders.length > 0 ? dedupeReminders(td.reminders) : [];
}

/**
 * R7 — Rolls a reminder forward by the same day-delta between two
 * dueDates. Returns undefined when either date fails to parse
 * (defensive — caller treats undefined as "leave the reminder
 * where it was").
 */
function rolledReminder(
  reminder: Reminder,
  fromDueDate: string,
  toDueDate: string,
): Reminder | undefined {
  if (!reminder.at) return undefined;
  const at = rollDateTime(reminder.at, fromDueDate, toDueDate);
  const out: Reminder = { id: reminder.id, at };
  if (reminder.offsetMinutes != null) out.offsetMinutes = reminder.offsetMinutes;
  if (reminder.intervalMinutes) out.intervalMinutes = reminder.intervalMinutes;
  if (reminder.until) out.until = rollDateTime(reminder.until, fromDueDate, toDueDate);
  return out;
}

/**
 * R7 — Transfer the about-to-be-cleared reminders of a completing /
 * skipping series instance onto the next-upcoming open sibling.
 * Walks the array (multi-reminder schema) and rolls each entry by
 * the same dueDate delta. Called by todoToggle (series completion)
 * and todoSkip. No-op when the source had no reminders or when the
 * series has nowhere left to attach.
 */
function transferSeriesReminders(
  todos: Todo[],
  fromId: string,
  oldReminders: Reminder[],
  oldDueDate: string,
  seriesId: string,
  todayISO: string,
): Todo[] {
  if (oldReminders.length === 0) return todos;
  const candidate = nextUpcomingSeriesInstance(todos, seriesId, todayISO, fromId);
  if (!candidate || !candidate.dueDate) return todos;
  const rolled: Reminder[] = [];
  for (const r of oldReminders) {
    const next = rolledReminder(r, oldDueDate, candidate.dueDate);
    if (next) rolled.push(next);
  }
  if (rolled.length === 0) return todos;
  const now = Date.now();
  return todos.map((t) => {
    if (t.id !== candidate.id) return t;
    // Merge into any reminders the candidate already has — the
    // candidate's own reminders take precedence on id clashes (so
    // a user-set reminder isn't clobbered by a transfer from a
    // sibling).
    // Instances are pre-rebased (expand/top-up/append copy the seed's
    // reminders), so a rolled reminder usually already exists under another
    // id — skip any with the same time + repeat, or the OS fires it twice.
    const existing = t.reminders ?? [];
    const sameSlot = (a: Reminder, b: Reminder) =>
      a.at === b.at && (a.intervalMinutes ?? 0) === (b.intervalMinutes ?? 0);
    const byId = new Map<string, Reminder>();
    for (const r of rolled) if (!existing.some((e) => sameSlot(e, r))) byId.set(r.id, r);
    for (const r of existing) byId.set(r.id, r); // existing wins on conflict
    return {
      ...t,
      reminders: Array.from(byId.values()),
      updatedAt: now,
    };
  });
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
 *   - reminders: cleared (no more notifications for this occurrence)
 *
 * For series instances (those with `seriesId`), Skip also appends
 * one fresh tail via `appendNextSeriesInstance` so the user always
 * has the next occurrence queued — the same horizon-stability
 * promise R3 made for completion — and, like completion, only while the
 * series still owes one (seriesOwesTail), so re-skipping a restored row
 * doesn't append again.
 *
 * Pebble-neutral: `pebbleDelta` only fires on `done` flipping, which
 * Skip doesn't cause.
 *
 * No-op on a done or binned row. An explicit `todayISO` also clamps the
 * appended occurrence to today (appendNextSeriesInstance).
 */
export function todoSkip(prev: Todo[], id: string, todayISO?: string): Todo[] {
  const now = Date.now();
  const today = todayISO ?? todayLocal();
  const target = prev.find((td) => td.id === id);
  if (!target) return prev;
  // Only an open occurrence can be skipped: skipping a completed (done ⇒
  // binned) or binned row would relabel it "Skipped" and append another
  // occurrence.
  if (target.done || target.trashed) return prev;
  // Subtask-gated parents — same rule as todoToggle: when subs
  // exist, the parent's state is derived. Block the action so a
  // skip can't silently desync the parent from its sub list.
  if (target.subtasks && target.subtasks.length > 0) return prev;
  // R7 — capture the reminders so they can be transferred forward
  // to the next-upcoming open sibling after the tail extends.
  const oldReminders = getReminders(target);
  const oldDueDate = target.dueDate;
  let result = prev.map((td) => {
    if (td.id !== id) return td;
    const next: Todo = {
      ...td,
      status: "notDo",
      trashed: true,
      trashedAt: now,
      completionDate: today,
      updatedAt: now,
    };
    delete next.reminders;
    return next;
  });
  if (target.seriesId) {
    // Same "1 settle = 1 new tail" accounting as completion, so skip →
    // restore → skip cycles don't grow the series.
    if (seriesOwesTail(result, target, today)) {
      result = appendNextSeriesInstance(result, target.seriesId, todayISO);
    }
    if (oldReminders.length > 0) {
      result = transferSeriesReminders(
        result, id, oldReminders, oldDueDate, target.seriesId, today,
      );
    }
  }
  return result;
}

/**
 * Walk every distinct `seriesId` in the list and apply `topUpSeries`
 * to each. Idempotent. Called once per launch (after hydrate) so a
 * long-idle device catches up its series tails to the live horizon.
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

export function todoRestoreFromTrash(prev: Todo[], id: string): Todo[] {
  return todosRestoreFromTrash(prev, new Set([id]));
}

/**
 * Restore every Done-bin row whose id is in `ids` (single + bulk restore).
 * Only a row in the Done bin can be restored — on an active row this used to
 * reopen every finished step. Returns `prev` when nothing matches.
 */
export function todosRestoreFromTrash(prev: Todo[], ids: ReadonlySet<string>): Todo[] {
  if (!prev.some((td) => ids.has(td.id) && td.trashed)) return prev;
  const now = Date.now();
  return prev.map((td) => {
    if (!ids.has(td.id) || !td.trashed) return td;
    const { trashedAt: _t, completionDate: _c, status: _s, ...rest } = td;
    // Restoring from the Done bin clears both flags (and a "Not Do" mark) so
    // the row goes back to active. Its steps reopen too — done is derived
    // from them, so leaving them done would re-complete it on reload.
    const restored: Todo = { ...rest, done: false, trashed: false, updatedAt: now };
    if (td.subtasks?.some((st) => st.done)) {
      restored.subtasks = td.subtasks.map((st) => {
        if (!st.done) return st;
        const { completionDate: _sc, ...open } = st;
        return { ...open, done: false };
      });
    }
    return restored;
  });
}

export function todoPermanentlyDelete(prev: Todo[], id: string): Todo[] {
  if (!prev.some((td) => td.id === id)) return prev;
  return keepSeriesHorizons(prev, prev.filter((td) => td.id !== id));
}

/**
 * Hard-remove EVERY row of `seriesId` (any date or state) — the Undo of a
 * series that was only just created (an Ask Mochi capture). Returns `prev`
 * when the series has no rows.
 */
export function todoPermanentlyDeleteSeries(prev: Todo[], seriesId: string): Todo[] {
  if (!seriesId || !prev.some((td) => td.seriesId === seriesId)) return prev;
  return prev.filter((td) => td.seriesId !== seriesId);
}

/**
 * Permanently delete this occurrence + every future sibling in the series
 * ("Delete series"). Distinct from todoMoveToTrashFutureSeries (which moves this+future
 * to the bin, recoverable) — this hard-removes them. Past instances are
 * kept. Falls back to a single permanent delete for a one-off.
 */
export function todoPermanentlyDeleteSeriesFuture(prev: Todo[], id: string): Todo[] {
  const target = prev.find((td) => td.id === id);
  if (!target) return prev;
  if (!target.seriesId) return prev.filter((td) => td.id !== id);
  const cutoff = target.dueDate;
  const kept = prev.filter((td) => {
    if (td.seriesId !== target.seriesId) return true; // other series/one-offs
    if (cutoff && td.dueDate && td.dueDate < cutoff) return true; // keep past
    return false; // drop this + all future siblings
  });
  return seriesEndBefore(kept, target.seriesId, cutoff);
}

export function todoEmptyTrash(prev: Todo[]): Todo[] {
  return keepSeriesHorizons(prev, prev.filter((td) => !td.trashed));
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
  return { todos: keepSeriesHorizons(prev, todos), trashedIds: removedIds };
}

/**
 * Set one field on a to-do. Returns `prev` itself when the id is missing or
 * the (capped) value is already what the to-do has — a no-op edit must not
 * read as a change (no updatedAt bump, no Undo, no new Ask Mochi turn).
 */
export function todoSet<K extends keyof Todo>(
  prev: Todo[],
  id: string,
  field: K,
  value: Todo[K],
): Todo[] {
  const td = prev.find((x) => x.id === id);
  if (!td) return prev;
  let v: Todo[K] = value;
  if (field === "text" && typeof value === "string") v = value.slice(0, MAX_TODO_TEXT_LEN) as Todo[K];
  if (field === "notes" && typeof value === "string") v = value.slice(0, MAX_TODO_NOTES_LEN) as Todo[K];
  // No notes and empty notes read the same.
  const cur = field === "notes" ? (td.notes ?? "") : td[field];
  if (jsonEqual(cur, v)) return prev;
  const now = Date.now();
  const next = { ...td, [field]: v, updatedAt: now };
  if (field === "dueDate" && typeof v === "string") {
    const reminders = remindersForDueChange(td, v, now);
    if (reminders) next.reminders = reminders;
  }
  return prev.map((x) => (x.id === id ? next : x));
}

/** Replace a todo's `reminders` array. An empty array clears reminders
 * entirely (the field is removed rather than persisted as []). */
export function todoSetReminders(
  prev: Todo[],
  id: string,
  reminders: Reminder[],
): Todo[] {
  const td = prev.find((x) => x.id === id);
  // Missing, or the same reminders already: no change (see todoSet).
  if (!td || jsonEqual(td.reminders ?? [], reminders)) return prev;
  const next: Todo = { ...td, updatedAt: Date.now() };
  if (reminders.length > 0) next.reminders = reminders;
  else delete next.reminders;
  return prev.map((x) => (x.id === id ? next : x));
}

/** Set or clear a todo's `recurrence`. Passing undefined removes the
 * field entirely rather than leaving it set to undefined. */
export function todoSetRecurrence(
  prev: Todo[],
  id: string,
  recurrence: Recurrence | undefined,
): Todo[] {
  const target = prev.find((td) => td.id === id);
  if (!target || (!recurrence && !target.recurrence)) return prev;
  const now = Date.now();
  return prev.map((td) => {
    if (td.id !== id) return td;
    if (recurrence) {
      // Adding/changing a recurrence makes this a series. Assign a
      // seriesId if it lacks one so series-scoped UI + ops ("Edit
      // series", "Delete series", future-edit propagation) light up —
      // without this, a recurrence applied via the edit view (which
      // routes through here, not addTask's expandSeries) had no seriesId
      // and the "Edit series" control silently disappeared.
      const seriesId = td.seriesId ?? genUuid();
      // Same anchored-dueDate invariant as newTodo: a recurrence with no
      // dueDate yields a dead "No date" series that never advances. Manual
      // edit snaps before calling here; agent edits (Mochi) route straight
      // through, so enforce it centrally for identical outcomes.
      let dueDate = td.dueDate;
      if (!dueDateOnly(dueDate)) dueDate = todayLocal();
      dueDate = snapDueDateToRecurrence(dueDate, recurrence);
      // Re-anchor unless the rule is unchanged (an endDate-only edit keeps
      // the series' original day, e.g. the 31st on a row clamped to the 30th).
      const fresh = withoutHorizon(recurrence);
      const rec = td.recurrence && sameRule(td.recurrence, fresh) && storedAnchorDay(td.recurrence) !== undefined
        ? recurrenceWithAnchor(fresh, dueDate, storedAnchorDay(td.recurrence))
        : recurrenceWithAnchor(fresh, dueDate);
      return { ...td, recurrence: rec, seriesId, dueDate, updatedAt: now };
    }
    const next: Todo = { ...td, updatedAt: now };
    delete next.recurrence;
    return next;
  });
}

/** Active (not trashed, not done) todos whose dueDate is strictly before
 * `today` (an ISO yyyy-mm-dd). Pure selector for the defer-overdue flow. */
export function selectOverdue(todos: Todo[], today: string): Todo[] {
  return todos.filter(
    (td) => !td.trashed && !td.done && !!td.dueDate && td.dueDate < today,
  );
}

/**
 * A to-do's due date is moving from its current one to `newDue`: its one-shot
 * reminders that are still ahead move by the same whole-day delta (keeping
 * their time of day — "1h before" stays 1h before the new day), so a
 * snoozed / deferred / rescheduled to-do doesn't keep reminding on the old
 * day. Repeating (interval) reminders and ones already past stay as they
 * are. Returns undefined when nothing needs to change.
 */
function remindersForDueChange(td: Todo, newDue: string, nowMs: number): Reminder[] | undefined {
  const rs = td.reminders;
  if (!rs || rs.length === 0) return undefined;
  const from = dueDateOnly(td.dueDate);
  const to = dueDateOnly(newDue);
  if (!from || !to || from === to) return undefined;
  let changed = false;
  const out = rs.map((r) => {
    if (r.intervalMinutes) return r;
    const at = new Date(r.at).valueOf();
    if (!Number.isFinite(at) || at <= nowMs) return r;
    const moved = rolledReminder(r, from, to);
    if (!moved || moved.at === r.at) return r;
    changed = true;
    return moved;
  });
  return changed ? out : undefined;
}

/** Set each todo's dueDate to the value mapped to its id. The empty
 * string clears the date (Todo.dueDate's "no date" sentinel). Ids absent
 * from the map are untouched. Stamps updatedAt on every changed row, and
 * moves each row's upcoming one-shot reminders with its date
 * (remindersForDueChange). */
export function setDueDates(prev: Todo[], dates: Map<string, string>): Todo[] {
  if (dates.size === 0) return prev;
  const now = Date.now();
  return prev.map((td) => {
    const next = dates.get(td.id);
    if (next === undefined) return td;
    const out: Todo = { ...td, dueDate: next, updatedAt: now };
    const reminders = remindersForDueChange(td, next, now);
    if (reminders) out.reminders = reminders;
    return out;
  });
}

/**
 * Move carried-over / chosen to-dos to `targetISO` (a yyyy-mm-dd day) — the
 * "defer" action. Each moved to-do keeps its time of day and its upcoming
 * reminders move with it (setDueDates).
 *
 * A recurring series that missed several days would otherwise pile all of
 * them onto one day. So per series, only the MOST RECENT overdue (dueDate
 * before `todayISO`) instance among `ids` is moved; the older missed ones are
 * marked skipped ("Not Do", as todoSkip) without appending tails — the
 * series' future is already queued. Likewise an occurrence whose series
 * already has an open occurrence on the target day is skipped rather than
 * stacked as a second one. Done / trashed rows and unknown ids are
 * ignored.
 */
export function todoDeferTo(
  prev: Todo[],
  ids: Iterable<string>,
  targetISO: string,
  todayISO?: string,
): { next: Todo[]; deferred: number; skipped: number } {
  const target = dueDateOnly(targetISO);
  const today = todayISO ?? todayLocal();
  const want = new Set(ids);
  const candidates = prev.filter((td) => want.has(td.id) && !td.trashed && !td.done);
  if (!target || candidates.length === 0) return { next: prev, deferred: 0, skipped: 0 };
  const isOverdue = (td: Todo) => !!dueDateOnly(td.dueDate) && dueDateOnly(td.dueDate) < today;
  // Newest overdue instance per series — the one that is carried forward.
  const keepBySeries = new Map<string, Todo>();
  for (const td of candidates) {
    if (!td.seriesId || !isOverdue(td)) continue;
    const kept = keepBySeries.get(td.seriesId);
    if (!kept || dueDateOnly(td.dueDate) > dueDateOnly(kept.dueDate)) keepBySeries.set(td.seriesId, td);
  }
  // Days already holding an open occurrence of a series (rows not being
  // moved) — deferring another occurrence of that series onto such a day
  // would stack two, so it is skipped instead.
  const slot = (sid: string, day: string) => `${sid}|${day}`;
  const candidateIds = new Set(candidates.map((td) => td.id));
  const occupied = new Set<string>();
  for (const td of prev) {
    if (!td.seriesId || td.trashed || td.done || candidateIds.has(td.id)) continue;
    const day = dueDateOnly(td.dueDate);
    if (day) occupied.add(slot(td.seriesId, day));
  }
  const skipIds = new Set<string>();
  const dates = new Map<string, string>();
  for (const td of candidates) {
    const kept = td.seriesId && isOverdue(td) ? keepBySeries.get(td.seriesId) : undefined;
    if (kept && kept.id !== td.id) {
      skipIds.add(td.id);
      continue;
    }
    if (td.seriesId) {
      if (occupied.has(slot(td.seriesId, target))) {
        skipIds.add(td.id);
        continue;
      }
      occupied.add(slot(td.seriesId, target));
    }
    const tIdx = td.dueDate ? td.dueDate.indexOf("T") : -1;
    dates.set(td.id, tIdx === -1 ? target : target + td.dueDate.slice(tIdx));
  }
  let next = setDueDates(prev, dates);
  if (skipIds.size > 0) {
    const now = Date.now();
    next = next.map((td) => {
      if (!skipIds.has(td.id)) return td;
      const out: Todo = {
        ...td,
        status: "notDo",
        trashed: true,
        trashedAt: now,
        completionDate: today,
        updatedAt: now,
      };
      delete out.reminders;
      return out;
    });
  }
  return { next, deferred: dates.size, skipped: skipIds.size };
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
 * Removes the category, moves its open to-dos to the Done bin and clears the
 * category on every to-do that had it. Returns the new state for both
 * arrays, since both must be updated atomically.
 */
export function categoryDelete(
  todos: Todo[],
  categories: CategoryDef[],
  id: string,
): { categories: CategoryDef[]; todos: Todo[]; deleted: boolean } {
  if (categories.length <= 1) return { categories, todos, deleted: false };
  const remaining = categories.filter((c) => c.id !== id);
  const now = Date.now();
  // Earliest open member per series this delete bins — the series is ended
  // before it below, so restoring one binned occurrence can't re-grow it.
  const binnedFrom = new Map<string, string>();
  // Open to-dos go to the Done bin; every row (open or already binned)
  // drops the category so a restored one has no ghost category.
  let next = todos.map((td) => {
    if (td.category !== id) return td;
    const out: Todo = { ...td, updatedAt: now };
    delete out.category;
    if (!td.trashed) {
      out.trashed = true;
      out.trashedAt = now;
      const day = dueDateOnly(td.dueDate);
      if (td.seriesId && day) {
        const prior = binnedFrom.get(td.seriesId);
        if (!prior || day < prior) binnedFrom.set(td.seriesId, day);
      }
    }
    return out;
  });
  for (const [sid, day] of binnedFrom) {
    // Only a series left with no open member was fully binned; one with an
    // open row elsewhere (another category) keeps going.
    if (next.some((td) => td.seriesId === sid && !td.trashed && !td.done)) continue;
    next = seriesEndBefore(next, sid, day);
  }
  return { categories: remaining, todos: next, deleted: true };
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
 * - Missing / non-string ids → fresh UUID.
 * - text > MAX_TODO_TEXT_LEN truncated.
 * - Array length capped at MAX_TODOS_PER_USER (defends against malicious cloud push).
 * - Type-narrowing: non-string ids/text/dueDate, non-Priority priorities all rejected.
 * - Duplicate ids deduped (last write wins by updatedAt).
 */
/**
 * Per-item sanitization context — built once per batch (or once for a
 * collection read) so the trash cutoff + category allow-list are stable
 * across every item. `validate` is false when no categories are supplied
 * (category ids pass through unchecked).
 */
export interface MigrateTodoCtx {
  validate: boolean;
  validCatIds: ReadonlySet<string>;
  now: number;
  cutoff: number;
}

/** Build a MigrateTodoCtx from the category list. */
export function makeMigrateTodoCtx(categories: CategoryDef[] = []): MigrateTodoCtx {
  const now = Date.now();
  return {
    validate: categories.length > 0,
    validCatIds: new Set(categories.map((c) => c.id)),
    now,
    cutoff: now - TRASH_RETENTION_MS,
  };
}

/**
 * Sanitize ONE raw todo into a clean Todo — the single source of truth
 * for todo shape validation. Returns null when the input isn't a usable
 * object, or when it's a trashed item past the 30-day retention cutoff.
 *
 * `migrateTodos` runs this per array element and dedups by updatedAt.
 */
export function migrateTodo(raw: unknown, ctx: MigrateTodoCtx): Todo | null {
  const { validate, validCatIds, now, cutoff } = ctx;
  const validPriorities = new Set<Priority>(["high", "medium", "low"]);
  {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const item = raw as Partial<Todo> & { id?: unknown };

    const id =
      typeof item.id === "string" && item.id.length > 0 ? item.id : genUuid();

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

    if (trashed && (trashedAt ?? 0) < cutoff) return null;

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
        // "Repeat ends" — dropping it here made every series run forever
        // after a reload.
        if (typeof r.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.endDate)) {
          recurrence.endDate = r.endDate;
        }
        // Month-end anchor: an int 1..31 on a day-of-month rule, else dropped.
        if (
          typeof r.anchorDay === "number" && Number.isInteger(r.anchorDay) &&
          r.anchorDay >= 1 && r.anchorDay <= 31 && usesAnchorDay(recurrence)
        ) {
          recurrence.anchorDay = r.anchorDay;
        }
        if (typeof r.materializedThrough === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.materializedThrough)) {
          recurrence.materializedThrough = r.materializedThrough;
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
    // Preserve seriesId / detachedFromSeries / status; assign a seriesId to
    // any recurring todo that lacks one so the series UI + ops (and
    // todoToggle's series path) always apply.
    if (typeof item.seriesId === "string" && item.seriesId.length > 0) {
      merged.seriesId = item.seriesId;
    } else if (recurrence) {
      merged.seriesId = genUuid();
    }
    if (item.detachedFromSeries === true) merged.detachedFromSeries = true;
    if (item.status === "notDo") merged.status = "notDo";
    // Reminders: validate + dedupe each entry. `at` is required and must be
    // a local datetime string; past-dated entries pass through (the
    // scheduler filters at schedule time).
    const rawReminders = (item as { reminders?: unknown }).reminders;
    if (Array.isArray(rawReminders)) {
      const cleanedRems: Reminder[] = [];
      const seenRemIds = new Set<string>();
      for (const rRaw of rawReminders.slice(0, 50)) {
        if (typeof rRaw !== "object" || rRaw === null || Array.isArray(rRaw)) continue;
        const r = rRaw as Partial<Reminder>;
        if (typeof r.at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(r.at)) continue;
        const rid = typeof r.id === "string" && r.id.length > 0 ? r.id : genUuid();
        if (seenRemIds.has(rid)) continue;
        seenRemIds.add(rid);
        const rem: Reminder = { id: rid, at: r.at };
        if (typeof r.offsetMinutes === "number" && Number.isFinite(r.offsetMinutes)) {
          rem.offsetMinutes = Math.floor(r.offsetMinutes);
        }
        if (typeof r.intervalMinutes === "number" && Number.isFinite(r.intervalMinutes) && r.intervalMinutes >= 1) {
          rem.intervalMinutes = Math.floor(r.intervalMinutes);
        }
        if (typeof r.until === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(r.until)) {
          rem.until = r.until;
        }
        cleanedRems.push(rem);
      }
      if (cleanedRems.length > 0) merged.reminders = dedupeReminders(cleanedRems);
    }

    return merged;
  }
}

/**
 * Migrate the whole todos array (single-doc model). Caps at
 * MAX_TODOS_PER_USER, sanitizes each element via migrateTodo, and dedups
 * by id — last write (or higher updatedAt) wins.
 */
export function migrateTodos(
  raw: unknown,
  categories: CategoryDef[] = [],
): Todo[] {
  if (!Array.isArray(raw)) return [];
  const ctx = makeMigrateTodoCtx(categories);
  const seen = new Map<string, Todo>();
  for (const td of raw.slice(0, MAX_TODOS_PER_USER)) {
    const merged = migrateTodo(td, ctx);
    if (!merged) continue;
    const existing = seen.get(merged.id);
    if (!existing || (merged.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
      seen.set(merged.id, merged);
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
 * Forget the suggestion-history entries of permanently deleted to-dos (Delete
 * forever, emptying the bin, Clear done, a bulk delete, undoing a capture):
 * an entry whose text matches a `removed` row goes, unless a `remaining` row
 * (any state) still carries that text. A COMPLETED removed row never makes
 * its title go — clearing Done keeps what the user actually did, so typing it
 * again still auto-fills; only rows removed without being completed (deleted,
 * skipped) are forgotten. `refs` itself when nothing goes.
 */
export function forgetTodoReferences(
  refs: TodoReference[],
  removed: ReadonlyArray<Pick<Todo, "text"> & { done?: boolean }>,
  remaining: ReadonlyArray<Pick<Todo, "text">>,
): TodoReference[] {
  const key = (text: string | undefined) => (text ?? "").trim().toLowerCase();
  const gone = new Set(removed.filter((td) => !td.done).map((td) => key(td.text)).filter(Boolean));
  if (gone.size === 0) return refs;
  for (const td of removed) if (td.done) gone.delete(key(td.text));
  for (const td of remaining) gone.delete(key(td.text));
  if (gone.size === 0 || !refs.some((r) => gone.has(r.textLower))) return refs;
  return refs.filter((r) => !gone.has(r.textLower));
}

/**
 * Sanitize cloud / device-storage payloads of the suggestion history.
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

  // Single bucketed pass over `todos` for every per-category / per-
  // priority / system count. This replaces what used to be one
  // `active.filter(cat)` scan PER category + one PER priority + several
  // standalone `todos.filter(...)` scans — O(N·(C+P)) → O(N). Semantics
  // are byte-identical: *Open counts non-trashed & !done; *Total counts
  // every todo (open + done + trashed); category buckets only count ids
  // present in `categories` (a Set avoids prototype-key false positives).
  const catIds = new Set(categories.map((c) => c.id));
  const byCategoryOpen: Record<string, number> = {};
  const byCategoryTotal: Record<string, number> = {};
  for (const c of categories) {
    byCategoryOpen[c.id] = 0;
    byCategoryTotal[c.id] = 0;
  }
  // Priority counts — exact match against td.priority. Items with no
  // priority (undefined) don't count toward any priority bucket; they
  // only surface via "All", category filters, or status filters.
  const byPriorityOpen: Record<Priority, number> = { high: 0, medium: 0, low: 0 };
  const byPriorityTotal: Record<Priority, number> = { high: 0, medium: 0, low: 0 };
  let overdueScan = 0;
  let notDoScan = 0;
  for (const td of todos) {
    const isOpen = !td.trashed && !td.done;
    // Same predicate as the Carried-over list itself: past-due rows, minus
    // binned ones (a done row lingers only on the day it was completed).
    if (matchesStatus(td, "overdue")) overdueScan++;
    // Skipped recurring instances (R1 plumbing — populated when R5
    // lights up the Skip action). Counted across active + non-trashed.
    if (!td.trashed && td.status === "notDo") notDoScan++;
    const cat = td.category;
    // Total reflects every to-do ever placed in this category — open +
    // done + trashed. Matches the All pill's inclusive scope.
    if (cat !== undefined && catIds.has(cat)) {
      byCategoryTotal[cat]++;
      if (isOpen) byCategoryOpen[cat]++;
    }
    const pri = td.priority;
    if (pri === "high" || pri === "medium" || pri === "low") {
      byPriorityTotal[pri]++;
      if (isOpen) byPriorityOpen[pri]++;
    }
  }

  const systemCounts = {
    // "All" = open + everything in the merged Done bin.
    all: totalOpen + completedCount,
    overdue: overdueScan,
    // active && !done — identical to totalOpen.
    open: totalOpen,
    done: completedCount,
    trash: trashCount,
    notDo: notDoScan,
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
