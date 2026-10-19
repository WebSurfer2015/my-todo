// Regressions found by the round-8 QA pass (2026-10-19): resuming a series
// whose end is still ahead regrows the cut days; undoing "make this one-off
// repeat" leaves no ghost series; a rule change from a snoozed row replaces
// the siblings it passed; a same-rule no-op returns the same list; new rows
// don't copy a stamped horizon; recurrenceRuleEquals.
import { describe, expect, it } from "vitest";
import {
  appendNextSeriesInstance,
  expandSeries,
  forgetTodoReferences,
  recordTodoReference,
  recurrenceRuleEquals,
  todoApplySeriesFutureEdits,
  todoApplyRecurrenceChange,
  todoEmptyTrash,
  todoMoveToTrash,
  todoMoveToTrashFutureSeries,
  todoSet,
  todoSetRecurrence,
  todoToggle,
  todosRevertChanges,
  todosRevertChangesWithReport,
  topUpSeries,
} from "../src/logic/derive";
import { planMochiOps, stampReminders, type MochiSnapshot } from "../src/logic/mochiOps";
import type { Todo } from "../src/domain/types";

const TODAY = "2026-10-19";

function row(over: Partial<Todo> = {}): Todo {
  return {
    id: "head",
    text: "Walk",
    done: false,
    priority: "medium",
    dueDate: TODAY,
    trashed: false,
    updatedAt: 1,
    recurrence: { freq: "daily" },
    ...over,
  };
}
const day = (t: Todo) => t.dueDate.slice(0, 10);
const series = (ts: Todo[], sid = "s") => ts.filter((t) => t.seriesId === sid);
const open = (ts: Todo[]) => ts.filter((t) => !t.done && !t.trashed);
/** Daily series head (Mon 10-19, id "head") + s_10-20 … s_10-26. */
const daily = () => expandSeries(row({ seriesId: "s" }), TODAY);
const WEEK = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"];

describe("1 — resuming a series whose end is still AHEAD regrows the cut days", () => {
  it("this & future to the bin from 10-22, then clear the end the same day → 10-22 … 10-26 back", () => {
    const binned = todoMoveToTrashFutureSeries(daily(), "s_2026-10-22").next;
    expect(binned.find((t) => t.id === "head")?.recurrence?.endDate).toBe("2026-10-21");
    const r = todoApplyRecurrenceChange(binned, "head", { freq: "daily" }, TODAY, { keepDetached: true });
    expect(open(series(r.next)).map(day)).toEqual(WEEK);
    expect(series(r.next).every((t) => t.recurrence?.endDate === undefined)).toBe(true);
    // The binned rows are gone (no `_2` duplicates next to the regrown days).
    expect(r.next.some((t) => t.trashed)).toBe(false);
    expect(new Set(r.next.map((t) => t.id)).size).toBe(r.next.length);
  });

  it("same after emptying the bin (the stamped horizon past the old end is dropped)", () => {
    const binned = todoMoveToTrashFutureSeries(daily(), "s_2026-10-22").next;
    const emptied = todoEmptyTrash(binned);
    expect(emptied[0].recurrence?.materializedThrough).toBe("2026-10-26");
    const r = todoApplyRecurrenceChange(emptied, "head", { freq: "daily" }, TODAY, { keepDetached: true });
    expect(open(series(r.next)).map(day)).toEqual(WEEK);
    expect(series(r.next).every((t) => t.recurrence?.materializedThrough === undefined)).toBe(true);
  });

  it("moving the end LATER (not clearing it) also regrows up to the new end", () => {
    const binned = todoMoveToTrashFutureSeries(daily(), "s_2026-10-22").next;
    const r = todoApplyRecurrenceChange(binned, "head", { freq: "daily", endDate: "2026-10-24" }, TODAY);
    expect(open(series(r.next)).map(day)).toEqual(WEEK.slice(0, 6));
    // Binned rows past the NEW end stay where they were (now one-offs).
    expect(r.next.filter((t) => t.trashed).map(day)).toEqual(["2026-10-25", "2026-10-26"]);
  });

  it("a NEW rule after the end was cut also drops the binned rows past it", () => {
    const binned = todoMoveToTrashFutureSeries(daily(), "s_2026-10-22").next;
    const r = todoApplyRecurrenceChange(binned, "head", { freq: "daily", interval: 2 }, TODAY, { keepDetached: true });
    expect(r.next.some((t) => t.trashed)).toBe(false);
    expect(open(series(r.next)).map(day)).toEqual(["2026-10-19", "2026-10-21", "2026-10-23", "2026-10-25"]);
  });

  it("a horizon stamped BEFORE the old end (a deliberate delete) is kept", () => {
    // Delete the 10-21 tail of a series that ends 10-21 → horizon 10-21.
    const ended = todoApplyRecurrenceChange(daily(), "head", { freq: "daily", endDate: "2026-10-21" }, TODAY).next;
    const emptied = todoEmptyTrash(todoMoveToTrash(ended, "s_2026-10-21"));
    expect(emptied.find((t) => t.id === "head")?.recurrence?.materializedThrough).toBe("2026-10-21");
    const r = todoApplyRecurrenceChange(emptied, "head", { freq: "daily", endDate: "2026-10-23" }, TODAY);
    expect(series(r.next).map(day)).toEqual(["2026-10-19", "2026-10-20", "2026-10-22", "2026-10-23"]);
  });

  it("an earlier end (shortening) is not a resume — its binned rows stay", () => {
    const binned = todoMoveToTrash(daily(), "s_2026-10-25");
    const r = todoApplyRecurrenceChange(binned, "head", { freq: "daily", endDate: "2026-10-23" }, TODAY);
    expect(r.next.some((t) => t.id === "s_2026-10-25" && t.trashed)).toBe(true);
  });
});

/** "Make this one-off repeat" as the store does it (todoSetRecurrence + top-up). */
function makeRepeat(before: Todo[]): { after: Todo[]; sid: string } {
  const set = todoSetRecurrence(before, "head", { freq: "daily" });
  const sid = set.find((t) => t.id === "head")!.seriesId!;
  return { after: topUpSeries(set, sid, TODAY), sid };
}

describe("2 — undoing 'make this one-off repeat' leaves no ghost series", () => {
  const oneOff = () => [row({ recurrence: undefined }), row({ id: "other", text: "Other", recurrence: undefined })];

  it("A: the next day's top-up appended a row → Undo drops it too", () => {
    const before = oneOff();
    const { after, sid } = makeRepeat(before);
    expect(series(after, sid).map(day)).toEqual(WEEK);
    const later = topUpSeries(after, sid, "2026-10-20");
    expect(later.length).toBe(after.length + 1);
    const undone = todosRevertChanges(later, before, after);
    expect(undone.map((t) => t.id)).toEqual(["head", "other"]);
    expect(undone[0].seriesId).toBeUndefined();
    expect(undone[0].recurrence).toBeUndefined();
  });

  it("B: the head was completed since (kept) → partial, but no open ghost row stays", () => {
    const before = oneOff();
    const { after, sid } = makeRepeat(before);
    const later = todoToggle(after, "head", TODAY);
    expect(later.filter((t) => !after.some((a) => a.id === t.id)).map(day)).toEqual(["2026-10-27"]);
    const undone = todosRevertChangesWithReport(later, before, after);
    expect(undone.skipped).toBe(1);
    expect(open(series(undone.todos, sid))).toEqual([]);
    expect(undone.todos.map((t) => t.id)).toEqual(["head", "other"]);
  });

  it("an open row the action made was edited since (kept) → the series and its appends stay", () => {
    const before = oneOff();
    const { after, sid } = makeRepeat(before);
    const renamed = todoSet(after, `${sid}_2026-10-21`, "text", "Run");
    const later = topUpSeries(renamed, sid, "2026-10-20");
    const undone = todosRevertChangesWithReport(later, before, after);
    expect(undone.skipped).toBe(1);
    expect(series(undone.todos, sid).map(day)).toEqual(["2026-10-21", "2026-10-27"]);
  });

  it("a series that existed before isn't treated as created (its appends stay)", () => {
    const before = daily();
    const after = todoSet(before, "head", "text", "Run");
    const later = topUpSeries(after, "s", "2026-10-20");
    const undone = todosRevertChanges(later, before, after);
    expect(undone.some((t) => day(t) === "2026-10-27")).toBe(true);
  });
});

describe("5 — a rule change from a row snoozed past its siblings replaces them", () => {
  it("s_10-20 snoozed to 10-23, change to every 2 days → no daily row left in between", () => {
    const moved = todoSet(daily(), "s_2026-10-20", "dueDate", "2026-10-23");
    const r = todoApplyRecurrenceChange(moved, "s_2026-10-20", { freq: "daily", interval: 2 }, TODAY, { keepDetached: true });
    const members = series(r.next).filter((t) => t.id !== "head");
    expect(members.every((t) => t.recurrence?.interval === 2)).toBe(true);
    expect(r.next.some((t) => t.id === "s_2026-10-21" || t.id === "s_2026-10-22")).toBe(false);
  });

  it("an explicit later fromDue is still capped at the id's day", () => {
    const moved = todoSet(daily(), "s_2026-10-20", "dueDate", "2026-10-23");
    const r = todoApplyRecurrenceChange(moved, "s_2026-10-20", { freq: "weekly" }, TODAY, {
      keepDetached: true,
      fromDue: "2026-10-23",
    });
    expect(r.next.some((t) => t.id === "s_2026-10-21")).toBe(false);
    // The head (before the id's day) is history: untouched.
    expect(r.next.find((t) => t.id === "head")?.recurrence?.freq).toBe("daily");
  });
});

describe("6 — no-op rule change, horizon copies, recurrenceRuleEquals", () => {
  it("restating the same rule returns the very same list", () => {
    const base = daily();
    const r = todoApplyRecurrenceChange(base, "head", { freq: "daily" }, TODAY);
    expect(r.next).toBe(base);
    expect(r.trashedCount).toBe(0);
    // A real end-date change still changes it.
    expect(todoApplyRecurrenceChange(base, "head", { freq: "daily", endDate: "2026-10-30" }, TODAY).next).not.toBe(base);
  });

  it("rows minted after a stamped horizon don't carry it", () => {
    const emptied = todoEmptyTrash(todoMoveToTrash(daily(), "s_2026-10-26"));
    const topped = topUpSeries(emptied, "s", "2026-10-21");
    const added = topped.filter((t) => !emptied.some((e) => e.id === t.id));
    expect(added.map(day)).toEqual(["2026-10-27", "2026-10-28"]);
    expect(added.every((t) => t.recurrence?.materializedThrough === undefined)).toBe(true);
    const appended = appendNextSeriesInstance(emptied, "s", TODAY);
    expect(appended[appended.length - 1].recurrence?.materializedThrough).toBeUndefined();
    expect(day(appended[appended.length - 1])).toBe("2026-10-27");
  });

  it("recurrenceRuleEquals compares the rule + end, ignoring derived fields", () => {
    expect(recurrenceRuleEquals(undefined, undefined)).toBe(true);
    expect(recurrenceRuleEquals({ freq: "daily" }, undefined)).toBe(false);
    expect(recurrenceRuleEquals(undefined, { freq: "daily" })).toBe(false);
    expect(recurrenceRuleEquals({ freq: "daily" }, { freq: "daily", interval: 1 })).toBe(true);
    expect(recurrenceRuleEquals({ freq: "monthly", anchorDay: 31, materializedThrough: "2026-12-31" }, { freq: "monthly" })).toBe(true);
    expect(recurrenceRuleEquals({ freq: "weekly", byWeekday: [] }, { freq: "weekly" })).toBe(true);
    expect(recurrenceRuleEquals({ freq: "weekly", byWeekday: [1] }, { freq: "weekly", byWeekday: [2] })).toBe(false);
    expect(recurrenceRuleEquals({ freq: "monthly", byWeekday: [1], bySetPos: [1] }, { freq: "monthly", byWeekday: [1], bySetPos: [-1] })).toBe(false);
    expect(recurrenceRuleEquals({ freq: "daily", interval: 2 }, { freq: "daily" })).toBe(false);
    expect(recurrenceRuleEquals({ freq: "daily" }, { freq: "weekly" })).toBe(false);
    expect(recurrenceRuleEquals({ freq: "daily", endDate: "2026-10-30" }, { freq: "daily" })).toBe(false);
    expect(recurrenceRuleEquals({ freq: "daily", endDate: "2026-10-30" }, { freq: "daily", endDate: "2026-10-30" })).toBe(true);
  });
});

describe("3/privacy — series-wide category clear; forgetting deleted titles", () => {
  it("todoApplySeriesFutureEdits: category null clears it on every sibling; undefined leaves it", () => {
    const tagged = daily().map((t) => ({ ...t, category: "work" }));
    const cleared = todoApplySeriesFutureEdits(tagged, "head", { category: null });
    expect(cleared.next.filter((t) => t.id !== "head").every((t) => t.category === undefined)).toBe(true);
    const kept = todoApplySeriesFutureEdits(tagged, "head", { category: undefined, text: "Run" });
    expect(kept.next.filter((t) => t.id !== "head").every((t) => t.category === "work")).toBe(true);
  });

  it("forgetTodoReferences drops a deleted title unless another to-do still has it", () => {
    let refs = recordTodoReference([], { text: "Call mom", priority: "medium" });
    refs = recordTodoReference(refs, { text: "Pay rent", priority: "high" });
    expect(forgetTodoReferences(refs, [{ text: " call MOM " }], [{ text: "Other" }]).map((r) => r.text)).toEqual(["Pay rent"]);
    expect(forgetTodoReferences(refs, [{ text: "Call mom" }], [{ text: "call mom" }])).toBe(refs);
    expect(forgetTodoReferences(refs, [], [])).toBe(refs);
    expect(forgetTodoReferences(refs, [{ text: "  " }], [])).toBe(refs);
    expect(forgetTodoReferences(refs, [{ text: "Never recorded" }], [])).toBe(refs);
  });
});

describe("Mochi — a date-only move keeps the time; reminders keep `until`; a restated rule moves the series", () => {
  const snapWith = (td: Partial<MochiSnapshot["todos"][number]>): MochiSnapshot => ({
    today: TODAY,
    todos: [{ id: "a", text: "Dentist", done: false, priority: "medium", dueDate: "2026-10-23T15:00", ...td }],
    categories: [],
    groceries: [],
  });
  const plan = (snap: MochiSnapshot, args: Record<string, unknown>) =>
    planMochiOps([{ kind: "editTodo", args: { todoId: "a", ...args } } as never], snap, { genId: () => "id" });

  it("'dentist is Monday' on a 15:00 row moves the day and keeps 15:00", () => {
    expect(plan(snapWith({}), { dueDate: "2026-10-26" })).toEqual([
      { type: "updateDueDate", todoId: "a", dueDate: "2026-10-26T15:00" },
    ]);
  });

  it("restating the same day is a no-op; an explicit new time or a clear is taken as is", () => {
    expect(plan(snapWith({}), { dueDate: "2026-10-23" })).toEqual([]);
    expect(plan(snapWith({}), { dueDate: "2026-10-23T09:00" })).toEqual([
      { type: "updateDueDate", todoId: "a", dueDate: "2026-10-23T09:00" },
    ]);
    expect(plan(snapWith({}), { dueDate: "" })).toEqual([{ type: "updateDueDate", todoId: "a", dueDate: "" }]);
    // An untimed row takes the bare day.
    expect(plan(snapWith({ dueDate: "2026-10-23" }), { dueDate: "2026-10-24" })).toEqual([
      { type: "updateDueDate", todoId: "a", dueDate: "2026-10-24" },
    ]);
  });

  it("a nag's `until` counts in the comparison and is carried on stamp", () => {
    const rem = [{ at: "2026-10-23T09:00", intervalMinutes: 30, until: "2026-10-23T12:00" }];
    const snap = snapWith({ reminders: rem });
    // Same reminders incl. until → no-op.
    expect(plan(snap, { reminders: rem })).toEqual([]);
    // A different until → a real edit, and the new until is kept.
    const ops = plan(snap, { reminders: [{ ...rem[0], until: "2026-10-23T18:00" }] }) as Array<{ type: string; reminders?: unknown }>;
    expect(ops.map((o) => o.type)).toEqual(["updateReminders"]);
    expect(ops[0].reminders).toEqual([{ id: "id", at: "2026-10-23T09:00", intervalMinutes: 30, until: "2026-10-23T18:00" }]);
    // A one-shot carries no until.
    expect(stampReminders([{ at: "2026-10-23T09:00", until: "2026-10-23T18:00" }], () => "x")).toEqual([
      { id: "x", at: "2026-10-23T09:00" },
    ]);
  });

  it("'move rent to the 5th, monthly' on a series row reschedules the series", () => {
    const snap = snapWith({ text: "Rent", dueDate: "2026-11-01", seriesId: "s", recurrence: { freq: "monthly", anchorDay: 1 } });
    expect(plan(snap, { dueDate: "2026-11-05", recurrence: { freq: "monthly" } })).toEqual([
      { type: "rescheduleSeries", todoId: "a", dueDate: "2026-11-05" },
    ]);
    // A bare date move stays this-occurrence-only.
    expect(plan(snap, { dueDate: "2026-11-05" })).toEqual([{ type: "updateDueDate", todoId: "a", dueDate: "2026-11-05" }]);
    // A one-off with a "repeat" is a rule change, not a reschedule.
    const oneOff = snapWith({ dueDate: "2026-11-01" });
    expect(plan(oneOff, { dueDate: "2026-11-05", recurrence: { freq: "monthly" } }).map((o) => o.type)).toEqual([
      "updateDueDate",
      "updateRecurrence",
    ]);
  });
});
