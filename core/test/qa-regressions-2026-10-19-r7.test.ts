// Regressions found by the round-7 QA pass (2026-10-19): a series edit that
// also moved this occurrence measures "this and future" from where it WAS;
// no-op setters hand back the same list; a repeating capture's start can move
// and its Undo removes every row; resuming after Skip all restarts tomorrow;
// deleted latest occurrences stay deleted (series horizon); undoing a rule
// change drops rows appended under the new rule since — plus mutation
// survivors.
import { describe, expect, it } from "vitest";
import {
  appendNextSeriesInstance,
  expandSeries,
  keepSeriesHorizons,
  migrateTodo,
  makeMigrateTodoCtx,
  subtaskUpdateDueDate,
  subtaskUpdatePriority,
  subtaskUpdateText,
  todoApplyRecurrenceChange,
  todoApplySeriesFutureEdits,
  todoApplySeriesSubtasks,
  todoClearDone,
  todoEmptyTrash,
  todoMoveToTrash,
  todoPermanentlyDelete,
  todoPermanentlyDeleteSeries,
  todoSet,
  todoSetRecurrence,
  todoSetReminders,
  todoSkipSeriesFuture,
  todoToggle,
  todosRevertChanges,
  todosRevertChangesWithReport,
  topUpSeries,
} from "../src/logic/derive";
import { applyBulkDelete } from "../src/logic/selection";
import { mergeAgentRecurrence, planMochiOps, type MochiSnapshot } from "../src/logic/mochiOps";
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
const onDay = (ts: Todo[], d: string) => ts.filter((t) => day(t) === d);
/** Daily series head (Mon 10-19, id "head") + s_10-20 … s_10-26. */
const daily = () => expandSeries(row({ seriesId: "s" }), TODAY);

describe("1 — 'this and future' is cut at the occurrence's ORIGINAL date", () => {
  it("rule change after the row moved: in-between siblings are replaced too", () => {
    // Details: on the Mon row, weekly on Thursday (the row moves to Thu 10-22).
    const moved = todoSet(daily(), "head", "dueDate", "2026-10-22");
    const r = todoApplyRecurrenceChange(moved, "head", { freq: "weekly", byWeekday: [4] }, TODAY, {
      keepDetached: true,
      fromDue: TODAY,
    });
    // 10-20 / 10-21 no longer linger as daily members.
    expect(onDay(r.next, "2026-10-20")).toHaveLength(0);
    expect(onDay(r.next, "2026-10-21")).toHaveLength(0);
    expect(series(r.next).every((t) => t.recurrence?.freq === "weekly")).toBe(true);
    expect(series(r.next).map(day)).toEqual(["2026-10-22", "2026-10-29", "2026-11-05", "2026-11-12", "2026-11-19"]);
  });

  it("without fromDue the cutoff is the row's current date (old behavior kept for plain calls)", () => {
    const moved = todoSet(daily(), "head", "dueDate", "2026-10-22");
    const r = todoApplyRecurrenceChange(moved, "head", { freq: "weekly", byWeekday: [4] }, TODAY, { keepDetached: true });
    expect(onDay(r.next, "2026-10-20")).toHaveLength(1);
  });

  it("field edit + date moved LATER reaches the siblings in between", () => {
    const moved = todoSet(daily(), "head", "dueDate", "2026-10-21");
    const r = todoApplySeriesFutureEdits(moved, "head", { text: "Run" }, { fromDue: TODAY });
    expect(r.next.find((t) => t.id === "s_2026-10-20")!.text).toBe("Run");
    expect(r.affected).toBe(7);
  });

  it("field edit + date moved EARLIER leaves the earlier siblings alone", () => {
    const moved = todoSet(daily(), "s_2026-10-22", "dueDate", "2026-10-20");
    const r = todoApplySeriesFutureEdits(moved, "s_2026-10-22", { text: "Run" }, { fromDue: "2026-10-22" });
    expect(r.next.find((t) => t.id === "s_2026-10-20")!.text).toBe("Walk");
    expect(r.next.find((t) => t.id === "s_2026-10-21")!.text).toBe("Walk");
    expect(r.next.find((t) => t.id === "s_2026-10-23")!.text).toBe("Run");
  });

  it("steps copy honors fromDue the same way", () => {
    const withStep = daily().map((t) =>
      t.id === "s_2026-10-22"
        ? { ...t, subtasks: [{ id: "x", text: "shoes", done: false, priority: "medium" as const, dueDate: "" }] }
        : t,
    );
    const moved = todoSet(withStep, "s_2026-10-22", "dueDate", "2026-10-20");
    const r = todoApplySeriesSubtasks(moved, "s_2026-10-22", { keepDetached: false, fromDue: "2026-10-22" });
    expect(r.next.find((t) => t.id === "s_2026-10-21")!.subtasks).toBeUndefined();
    expect(r.next.find((t) => t.id === "s_2026-10-23")!.subtasks).toHaveLength(1);
  });

  it("Mochi: a date move + new rule plans updateDueDate then updateRecurrence cut at the old date", () => {
    const snap: MochiSnapshot = {
      today: TODAY,
      todos: [{ id: "head", text: "Walk", done: false, seriesId: "s", dueDate: TODAY, recurrence: { freq: "daily" } }],
      categories: [],
      groceries: [],
    };
    const out = planMochiOps(
      [{ kind: "editTodo", args: { todoId: "head", dueDate: "2026-10-22", recurrence: { freq: "weekly", byWeekday: [4] } } }],
      snap,
      { genId: () => "id" },
    );
    expect(out).toEqual([
      { type: "updateDueDate", todoId: "head", dueDate: "2026-10-22" },
      { type: "updateRecurrence", todoId: "head", recurrence: { freq: "weekly", byWeekday: [4] }, fromDue: TODAY },
    ]);
    // A rule change alone carries no cutoff.
    const only = planMochiOps(
      [{ kind: "editTodo", args: { todoId: "head", recurrence: { freq: "weekly", byWeekday: [4] } } }],
      snap,
      { genId: () => "id" },
    );
    expect(only).toEqual([{ type: "updateRecurrence", todoId: "head", recurrence: { freq: "weekly", byWeekday: [4] } }]);
  });
});

describe("2 — a no-op edit hands back the same list", () => {
  const base = (): Todo[] => [
    row({
      id: "a",
      recurrence: undefined,
      category: "work",
      notes: "n",
      reminders: [{ id: "r", at: "2026-10-19T09:00" }],
      subtasks: [{ id: "st", text: "step", done: false, priority: "medium", dueDate: "2026-10-19" }],
    }),
  ];

  it("todoSet: same value, a missing id, or empty notes on none", () => {
    const ts = base();
    expect(todoSet(ts, "a", "text", "Walk")).toBe(ts);
    expect(todoSet(ts, "a", "priority", "medium")).toBe(ts);
    expect(todoSet(ts, "a", "dueDate", TODAY)).toBe(ts);
    expect(todoSet(ts, "a", "category", "work")).toBe(ts);
    expect(todoSet(ts, "a", "notes", "n")).toBe(ts);
    expect(todoSet(ts, "gone", "text", "x")).toBe(ts);
    const noNotes = [row({ id: "b" })];
    expect(todoSet(noNotes, "b", "notes", "")).toBe(noNotes);
    expect(todoSet(noNotes, "b", "category", undefined)).toBe(noNotes);
    // Capped values compare after the cap.
    const long = "x".repeat(5000);
    const capped = todoSet(ts, "a", "text", long);
    expect(todoSet(capped, "a", "text", long)).toBe(capped);
    // A real change still applies.
    expect(todoSet(ts, "a", "text", "Run")[0].text).toBe("Run");
  });

  it("todoSetReminders / subtask setters / todoSetRecurrence", () => {
    const ts = base();
    expect(todoSetReminders(ts, "a", [{ id: "r", at: "2026-10-19T09:00" }])).toBe(ts);
    expect(todoSetReminders(ts, "gone", [])).toBe(ts);
    const none = [row({ id: "b" })];
    expect(todoSetReminders(none, "b", [])).toBe(none);
    expect(subtaskUpdateText(ts, "a", "st", "step")).toBe(ts);
    expect(subtaskUpdateText(ts, "a", "nope", "x")).toBe(ts);
    expect(subtaskUpdateText(ts, "gone", "st", "x")).toBe(ts);
    expect(subtaskUpdateText(ts, "a", "st", "walk")[0].subtasks![0].text).toBe("walk");
    expect(subtaskUpdatePriority(ts, "a", "st", "medium")).toBe(ts);
    expect(subtaskUpdatePriority(ts, "a", "nope", "high")).toBe(ts);
    expect(subtaskUpdateDueDate(ts, "a", "st", "2026-10-19")).toBe(ts);
    expect(subtaskUpdateDueDate(ts, "a", "nope", "2026-10-20")).toBe(ts);
    expect(todoSetRecurrence(ts, "gone", { freq: "daily" })).toBe(ts);
    expect(todoSetRecurrence(ts, "a", undefined)).toBe(ts);
  });

  it("planTodoPatch skips fields already at the asked value", () => {
    const snap: MochiSnapshot = {
      today: TODAY,
      todos: [
        {
          id: "a", text: "Walk", done: false, dueDate: TODAY, priority: "high", category: "work", notes: "n",
          reminders: [{ at: "2026-10-19T09:00", offsetMinutes: 0 }],
        },
      ],
      categories: [{ id: "work", label: "Work", color: "#000", icon: "briefcase" }],
      groceries: [],
    };
    const plan = (args: Record<string, unknown>) =>
      planMochiOps([{ kind: "editTodo", args: { todoId: "a", ...args } } as never], snap, { genId: () => "id" });
    expect(
      plan({ text: "Walk", priority: "high", dueDate: TODAY, category: "work", notes: "n", reminders: [{ at: "2026-10-19T09:00" }] }),
    ).toEqual([]);
    expect(plan({ newCategoryLabel: "work" })).toEqual([]);
    expect(plan({ text: "Run", notes: "" })).toEqual([
      { type: "updateText", todoId: "a", text: "Run" },
      { type: "updateNotes", todoId: "a", notes: "" },
    ]);
  });
});

describe("3 — a repeating capture: move its start, Undo removes every row", () => {
  it("rebuild re-expands from the new date; deleting the series leaves nothing", () => {
    const captured = daily();
    const moved = todoSet(captured, "head", "dueDate", "2026-10-21");
    const r = todoApplyRecurrenceChange(moved, "head", { freq: "daily" }, TODAY, {
      keepDetached: true,
      fromDue: TODAY,
      rebuild: true,
    });
    expect(series(r.next).map(day)).toEqual([
      "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26",
    ]);
    // The old "cut at the head's new date" delete left the 10-20 row behind;
    // deleting by seriesId removes them all.
    expect(todoPermanentlyDeleteSeries(r.next, "s")).toEqual([]);
    const other = [row({ id: "x", seriesId: undefined, recurrence: undefined })];
    expect(todoPermanentlyDeleteSeries(other, "s")).toBe(other);
    expect(todoPermanentlyDeleteSeries(other, "")).toBe(other);
  });

  it("without rebuild the same rule only patches the end date (no re-expansion)", () => {
    const moved = todoSet(daily(), "head", "dueDate", "2026-10-21");
    const r = todoApplyRecurrenceChange(moved, "head", { freq: "daily" }, TODAY, { fromDue: TODAY });
    expect(onDay(r.next, "2026-10-20")).toHaveLength(1);
  });
});

describe("4 — resuming after Skip all restarts tomorrow", () => {
  it("daily from 10-18, Skip all from 10-19, resume daily → open rows 10-20 … (no gap)", () => {
    const start = expandSeries(row({ seriesId: "s", dueDate: "2026-10-18" }), "2026-10-18");
    const skipped = todoSkipSeriesFuture(start, "s_2026-10-19", TODAY).next;
    expect(open(series(skipped)).map(day)).toEqual(["2026-10-18"]);
    const head = skipped.find((t) => t.id === "head")!;
    const resume = mergeAgentRecurrence({ freq: "daily" }, head.recurrence, head.dueDate, TODAY);
    expect(resume).toEqual({ freq: "daily" });
    const r = todoApplyRecurrenceChange(skipped, "head", resume, TODAY, { keepDetached: true });
    // Today's occurrence was explicitly skipped (it stays in Done), so the
    // series restarts TOMORROW — not after the skipped stretch.
    expect(open(series(r.next)).map(day)).toEqual([
      "2026-10-18", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26",
    ]);
    // The skipped future rows are gone (they'd collide with the new ids);
    // today's skip stays as history.
    expect(r.next.filter((t) => t.status === "notDo").map(day)).toEqual(["2026-10-19"]);
    expect(new Set(r.next.map((t) => t.id)).size).toBe(r.next.length);
  });

  it("resume with a NEW rule drops the skipped future rows too", () => {
    const start = expandSeries(row({ seriesId: "s", dueDate: "2026-10-18" }), "2026-10-18");
    const skipped = todoSkipSeriesFuture(start, "s_2026-10-19", TODAY).next;
    const r = todoApplyRecurrenceChange(skipped, "head", { freq: "daily", interval: 2 }, TODAY, { keepDetached: true });
    expect(r.next.filter((t) => t.status === "notDo").map(day)).toEqual(["2026-10-19"]);
    expect(open(series(r.next)).map(day)).toEqual(["2026-10-18", "2026-10-20", "2026-10-22", "2026-10-24", "2026-10-26"]);
  });

  it("a series ending in the future isn't a resume — its binned rows stay", () => {
    const start = daily();
    const binned = todoMoveToTrash(start, "s_2026-10-25");
    const r = todoApplyRecurrenceChange(binned, "head", { freq: "daily", endDate: "2026-11-30" }, TODAY);
    expect(r.next.some((t) => t.id === "s_2026-10-25")).toBe(true);
  });
});

describe("5 — deleted latest occurrences are not regenerated (series horizon)", () => {
  it("delete every generated row → empty the bin → top-up adds 0", () => {
    let ts = daily();
    for (const t of ts) if (t.id !== "head") ts = todoMoveToTrash(ts, t.id);
    const emptied = todoEmptyTrash(ts);
    expect(emptied.map((t) => t.id)).toEqual(["head"]);
    expect(emptied[0].recurrence?.materializedThrough).toBe("2026-10-26");
    expect(topUpSeries(emptied, "s", TODAY)).toBe(emptied);
    // The next day only the NEW day is added.
    expect(topUpSeries(emptied, "s", "2026-10-20").slice(1).map(day)).toEqual(["2026-10-27"]);
  });

  it("delete only the tail row → empty the bin → not re-added (top-up or completion)", () => {
    const emptied = todoEmptyTrash(todoMoveToTrash(daily(), "s_2026-10-26"));
    expect(topUpSeries(emptied, "s", TODAY)).toBe(emptied);
    // Completing one appends past the old horizon, not the deleted day.
    const done = todoToggle(emptied, "head", TODAY);
    expect(done.filter((t) => !emptied.some((e) => e.id === t.id)).map(day)).toEqual(["2026-10-27"]);
  });

  it("every hard-delete path keeps the horizon (permanent delete, Clear done, bulk delete)", () => {
    const one = todoPermanentlyDelete(daily(), "s_2026-10-26");
    expect(topUpSeries(one, "s", TODAY)).toBe(one);
    const ts = todoMoveToTrash(daily(), "s_2026-10-26");
    const cleared = todoClearDone(ts).todos;
    expect(topUpSeries(cleared, "s", TODAY)).toBe(cleared);
    const bulk = applyBulkDelete(ts, new Set(["s_2026-10-26"]));
    expect(topUpSeries(bulk, "s", TODAY)).toBe(bulk);
    // Unknown id: nothing changes.
    const base = daily();
    expect(todoPermanentlyDelete(base, "nope")).toBe(base);
  });

  it("a middle delete, a one-off delete, or a horizon still shown by rows stamps nothing", () => {
    const base = daily();
    const mid = todoPermanentlyDelete(base, "s_2026-10-22");
    expect(mid.every((t) => t.recurrence?.materializedThrough === undefined)).toBe(true);
    const plain = [row({ id: "x", seriesId: undefined, recurrence: undefined }), ...base];
    expect(keepSeriesHorizons(plain, plain)).toBe(plain);
    const noSeries = keepSeriesHorizons(plain, plain.slice(1));
    expect(noSeries.every((t) => t.recurrence?.materializedThrough === undefined)).toBe(true);
    // The whole series gone: nobody to stamp.
    expect(keepSeriesHorizons(base, [])).toEqual([]);
  });

  it("a rule change or resume starts a fresh horizon", () => {
    const emptied = todoEmptyTrash(todoMoveToTrash(daily(), "s_2026-10-26"));
    const r = todoApplyRecurrenceChange(emptied, "head", { freq: "daily", interval: 2 }, TODAY);
    expect(series(r.next).every((t) => t.recurrence?.materializedThrough === undefined)).toBe(true);
    expect(series(r.next).map(day)).toEqual(["2026-10-19", "2026-10-21", "2026-10-23", "2026-10-25"]);
  });

  it("migrateTodo keeps a valid materializedThrough and drops junk", () => {
    const ctx = makeMigrateTodoCtx();
    const ok = migrateTodo({ ...row({ seriesId: "s" }), recurrence: { freq: "daily", materializedThrough: "2026-10-26" } }, ctx);
    expect(ok?.recurrence?.materializedThrough).toBe("2026-10-26");
    const bad = migrateTodo({ ...row({ seriesId: "s" }), recurrence: { freq: "daily", materializedThrough: "soon" } }, ctx);
    expect(bad?.recurrence?.materializedThrough).toBeUndefined();
  });
});

describe("7 — undoing a rule change drops rows appended under the new rule since", () => {
  it("daily → weekly, the next day's top-up appends a weekly row, Undo → a clean daily series", () => {
    const before = daily();
    const after = todoApplyRecurrenceChange(before, "head", { freq: "weekly" }, TODAY).next;
    const later = topUpSeries(after, "s", "2026-10-26");
    const appended = later.filter((t) => !after.some((a) => a.id === t.id));
    expect(appended.map(day)).toEqual(["2026-11-23"]);
    const undone = todosRevertChanges(later, before, after);
    expect(series(undone).every((t) => t.recurrence?.freq === "daily")).toBe(true);
    expect(series(undone).map(day)).toEqual(series(before).map(day));
  });

  it("when the rule change itself was edited since (kept), its appended rows stay", () => {
    const before = daily();
    const after = todoApplyRecurrenceChange(before, "head", { freq: "weekly" }, TODAY).next;
    const renamed = todoSet(after, "head", "text", "Run");
    const later = topUpSeries(renamed, "s", "2026-10-26");
    const undone = todosRevertChangesWithReport(later, before, after);
    expect(undone.skipped).toBe(1);
    expect(undone.todos.some((t) => day(t) === "2026-11-23")).toBe(true);
  });
});

describe("9 — mutation survivors", () => {
  it("a `_2` clash id still names its day: append adds the next day only", () => {
    const rows = daily()
      .filter((t) => day(t) <= "2026-10-22" && t.id !== "head")
      .map((t) => (t.id === "s_2026-10-22" ? { ...t, id: "s_2026-10-22_2" } : t));
    const out = appendNextSeriesInstance(rows, "s");
    expect(out.slice(rows.length).map(day)).toEqual(["2026-10-23"]);
  });

  it("the re-anchored row holds no day: interval-2 change on a moved row → one row on 10-25", () => {
    const moved = todoSet(daily(), "s_2026-10-25", "dueDate", "2026-10-21");
    const r = todoApplyRecurrenceChange(moved, "s_2026-10-25", { freq: "daily", interval: 2 }, TODAY);
    expect(onDay(r.next, "2026-10-25")).toHaveLength(1);
  });

  it("todosRevertChangesWithReport counts what it had to keep", () => {
    const ts = [row({ id: "a", recurrence: undefined }), row({ id: "b", recurrence: undefined })];
    const after = todoToggle(todoToggle(ts, "a", TODAY), "b", TODAY);
    const later = todoSet(after, "a", "text", "renamed");
    const r = todosRevertChangesWithReport(later, ts, after);
    expect(r.skipped).toBe(1);
    expect(r.todos.find((t) => t.id === "a")!.done).toBe(true);
    expect(r.todos.find((t) => t.id === "b")!.done).toBe(false);
  });
});
