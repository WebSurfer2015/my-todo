// Regressions found by the round-9 QA pass (2026-10-19).
import { describe, expect, it } from "vitest";
import {
  MAX_TODO_REFERENCES,
  expandSeries,
  forgetTodoReferences,
  recurrenceRuleEquals,
  todoApplyRecurrenceChange,
  todoClearDone,
  todoMoveToTrash,
  todoMoveToTrashFutureSeries,
  todoSet,
  todoSetRecurrence,
  todoSkipSeriesFuture,
  todoToggle,
  todosRevertChanges,
  todosRevertChangesWithReport,
  topUpSeries,
} from "../src/logic/derive";
import { mergeTodoReferences } from "../src/store/mergeTodos";
import { planMochiOps, type MochiSnapshot } from "../src/logic/mochiOps";
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
const daily = () => expandSeries(row({ seriesId: "s" }), TODAY);
const WEEK = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"];

describe("1 — resuming a series with no live member left regrows it", () => {
  it("past rows done, Skip all from today's row, Ends Never from the skipped row → the week is back", () => {
    const past = [
      row({ id: "s_2026-10-17", seriesId: "s", dueDate: "2026-10-17" }),
      row({ id: "s_2026-10-18", seriesId: "s", dueDate: "2026-10-18" }),
    ];
    let todos = [...past, ...daily()];
    todos = todoToggle(todos, "s_2026-10-17", TODAY);
    todos = todoToggle(todos, "s_2026-10-18", TODAY);
    const skipped = todoSkipSeriesFuture(todos, "head", TODAY).next;
    expect(open(series(skipped))).toEqual([]);
    expect(skipped.find((t) => t.id === "head")?.trashed).toBe(true);
    const r = todoApplyRecurrenceChange(skipped, "head", { freq: "daily" }, TODAY, { keepDetached: true });
    expect(open(series(r.next)).map(day)).toEqual(WEEK);
    const reopened = r.next.find((t) => t.id === "head")!;
    expect(reopened.trashed).toBe(false);
    expect(reopened.status).toBeUndefined();
    expect(reopened.completionDate).toBeUndefined();
    expect(new Set(r.next.map((t) => t.id)).size).toBe(r.next.length);
    expect(r.next.filter((t) => t.done).map((t) => t.id).sort()).toEqual(["s_2026-10-17", "s_2026-10-18"]);
  });

  it("open head left, Skip all from 10-21, resume from binned 10-23 → 10-21/10-22 regrown, target reopened", () => {
    const skipped = todoSkipSeriesFuture(daily(), "s_2026-10-21", TODAY).next;
    expect(open(series(skipped)).map(day)).toEqual(WEEK.slice(0, 2));
    const r = todoApplyRecurrenceChange(skipped, "s_2026-10-23", { freq: "daily" }, TODAY, { keepDetached: true });
    expect(open(series(r.next)).map(day).sort()).toEqual(WEEK);
    expect(r.next.find((t) => t.id === "s_2026-10-23")?.trashed).toBe(false);
    expect(r.next.some((t) => t.trashed)).toBe(false);
    expect(new Set(r.next.map((t) => t.id)).size).toBe(r.next.length);
  });

  it("resume from a DONE target with nothing open re-expands from the day after the old end", () => {
    let todos = daily();
    todos = todoToggle(todos, "head", TODAY);
    const skipped = todoSkipSeriesFuture(todos, "s_2026-10-20", TODAY).next;
    expect(open(series(skipped))).toEqual([]);
    const r = todoApplyRecurrenceChange(skipped, "head", { freq: "daily" }, TODAY, { keepDetached: true });
    expect(open(series(r.next)).map(day).sort()).toEqual(WEEK.slice(1));
    expect(r.next.find((t) => t.id === "head")?.done).toBe(true);
  });

  it("a day skipped INSIDE the old live window (before the old end) stays skipped", () => {
    const one = todoMoveToTrash(daily(), "s_2026-10-21");
    const cut = todoMoveToTrashFutureSeries(one, "s_2026-10-24").next;
    const r = todoApplyRecurrenceChange(cut, "head", { freq: "daily" }, TODAY, { keepDetached: true });
    expect(r.next.find((t) => t.id === "s_2026-10-21")?.trashed).toBe(true);
    expect(open(series(r.next)).map(day).sort()).toEqual(WEEK.filter((d) => d !== "2026-10-21"));
  });
});

describe("5 — undoing a series reschedule drops a top-up's off-grid append", () => {
  it("weekly Mon series moved to Wed, a later top-up appends a Wed → Undo leaves only the Monday grid", () => {
    const before = expandSeries(row({ seriesId: "s", recurrence: { freq: "weekly" } }), TODAY);
    expect(before.map(day)).toEqual(["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"]);
    // rescheduleSeriesFrom as the store does it.
    const moved = todoSet(before, "head", "dueDate", "2026-10-21");
    const after = todoApplyRecurrenceChange(moved, "head", { freq: "weekly" }, TODAY, {
      keepDetached: true,
      fromDue: TODAY,
      rebuild: true,
    }).next;
    expect(series(after).map(day).sort()).toEqual(["2026-10-21", "2026-10-28", "2026-11-04", "2026-11-11", "2026-11-18"]);
    const later = topUpSeries(after, "s", "2026-10-26");
    expect(later.length).toBe(after.length + 1);
    const undone = todosRevertChangesWithReport(later, before, after);
    expect(undone.skipped).toBe(0);
    expect(series(undone.todos).map(day).sort()).toEqual(before.map(day));
  });

  it("an append that IS on the restored grid stays", () => {
    const before = daily();
    const moved = todoSet(before, "head", "dueDate", "2026-10-21");
    const after = todoApplyRecurrenceChange(moved, "head", { freq: "daily" }, TODAY, {
      keepDetached: true,
      fromDue: TODAY,
      rebuild: true,
    }).next;
    const later = topUpSeries(after, "s", "2026-10-21");
    const appended = later.filter((t) => !after.some((a) => a.id === t.id));
    expect(appended.length).toBeGreaterThan(0);
    const undone = todosRevertChanges(later, before, after);
    for (const a of appended) expect(undone.some((t) => t.id === a.id)).toBe(true);
  });
});

describe("7 — suggestion history keeps completed titles; merges across devices", () => {
  const refs = [
    { textLower: "pay rent", text: "Pay rent", lastSeenAt: 2 },
    { textLower: "call mom", text: "Call mom", lastSeenAt: 1 },
  ];
  it("a removed COMPLETED row never forgets its title; a deleted / skipped one does", () => {
    expect(forgetTodoReferences(refs, [{ text: "Pay rent", done: true }], [])).toBe(refs);
    expect(forgetTodoReferences(refs, [{ text: "Pay rent", done: false }], []).map((r) => r.text)).toEqual(["Call mom"]);
    // Same title removed both skipped and completed → kept (it was done).
    expect(forgetTodoReferences(refs, [{ text: "Pay rent" }, { text: "pay rent", done: true }], [])).toBe(refs);
  });

  it("Clear done keeps the titles of completed to-dos", () => {
    const done = row({ id: "d", text: "Pay rent", done: true, trashed: true, recurrence: undefined });
    const skipped = row({ id: "k", text: "Call mom", status: "notDo", trashed: true, recurrence: undefined });
    const r = todoClearDone([done, skipped]);
    expect(forgetTodoReferences(refs, [done, skipped], r.todos).map((x) => x.text)).toEqual(["Pay rent"]);
  });

  it("mergeTodoReferences: union by text, newer use wins, a forget on one side holds, newest first", () => {
    const base = [{ textLower: "a", text: "A", lastSeenAt: 1 }, { textLower: "gone", text: "Gone", lastSeenAt: 1 }];
    const local = [{ textLower: "a", text: "A", lastSeenAt: 5 }, { textLower: "l", text: "L", lastSeenAt: 3 }];
    const remote = [
      { textLower: "a", text: "a!", lastSeenAt: 4 },
      { textLower: "gone", text: "Gone", lastSeenAt: 1 },
      { textLower: "r", text: "R", lastSeenAt: 6 },
    ];
    expect(mergeTodoReferences(base, local, remote).map((r) => r.text)).toEqual(["R", "A", "L"]);
    // A forgotten entry re-used on the other side since → kept; one only in base → gone.
    const out2 = mergeTodoReferences(base, [], [{ textLower: "gone", text: "Gone", lastSeenAt: 9 }, { textLower: "a", text: "A", lastSeenAt: 1 }]);
    expect(out2.map((r) => r.text)).toEqual(["Gone"]);
    // No base → plain union, capped, newest first.
    const many = Array.from({ length: MAX_TODO_REFERENCES + 5 }, (_, i) => ({ textLower: `t${i}`, text: `t${i}`, lastSeenAt: i }));
    const capped = mergeTodoReferences(null, many.slice(0, 300), many.slice(300));
    expect(capped.length).toBe(MAX_TODO_REFERENCES);
    expect(capped[0].lastSeenAt).toBe(MAX_TODO_REFERENCES + 4);
    // A tie keeps the remote copy.
    const tie = mergeTodoReferences(null, [{ textLower: "x", text: "local", lastSeenAt: 1 }], [{ textLower: "x", text: "remote", lastSeenAt: 1 }]);
    expect(tie[0].text).toBe("remote");
  });
});

describe("round-9 coverage", () => {
  it("undoing a created series whose occurrence was binned + topped up leaves no open ghost row", () => {
    const before = [row({ recurrence: undefined })];
    const set = todoSetRecurrence(before, "head", { freq: "daily" });
    const sid = set[0].seriesId!;
    const after = topUpSeries(set, sid, TODAY);
    const binned = todoMoveToTrash(after, `${sid}_2026-10-21`);
    const later = topUpSeries(binned, sid, "2026-10-20");
    const undone = todosRevertChangesWithReport(later, before, after);
    expect(undone.todos.filter((t) => t.seriesId === sid && !t.trashed && !t.done)).toEqual([]);
  });

  it("an end moved to TODAY (after a past end) is a resume — today's row grows", () => {
    const head = row({
      seriesId: "s",
      dueDate: "2026-10-18",
      recurrence: { freq: "daily", endDate: "2026-10-18", materializedThrough: "2026-10-25" },
    });
    const r = todoApplyRecurrenceChange([head], "head", { freq: "daily", endDate: TODAY }, TODAY);
    expect(open(series(r.next)).map(day)).toContain(TODAY);
  });

  it("recurrenceRuleEquals compares end dates by day", () => {
    expect(recurrenceRuleEquals({ freq: "daily", endDate: "2026-10-20" }, { freq: "daily", endDate: "2026-10-20T00:00:00" })).toBe(true);
  });

  it("clearing a series row's date with its rule restated clears the date (no reschedule)", () => {
    const snap: MochiSnapshot = {
      today: TODAY,
      todos: [row({ id: "r", seriesId: "s", dueDate: "2026-10-20" })],
      categories: [],
      groceries: [],
    };
    const plan = planMochiOps([{ kind: "editTodo", args: { todoId: "r", dueDate: "", recurrence: { freq: "daily" } } }], snap, { genId: () => "x" });
    expect(plan).toContainEqual({ type: "updateDueDate", todoId: "r", dueDate: "" });
    expect(plan.some((i) => i.type === "rescheduleSeries")).toBe(false);
  });
});
