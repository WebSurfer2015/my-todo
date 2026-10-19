// Regressions found by the round-3 QA pass (2026-10-19): merge dedupe must
// never drop a real row, month-end anchor stored on the rule, exact Undo of a
// rule change, bulk restore parity, today-clamped appends, Mochi same-turn
// duplicate ops, skip on a closed row — plus mutation-survivor gaps.
import { describe, expect, it } from "vitest";
import {
  appendNextSeriesInstance,
  expandSeries,
  isGeneratedSeriesRow,
  migrateTodo,
  makeMigrateTodoCtx,
  seriesInstanceId,
  todoApplyRecurrenceChange,
  todoDeferTo,
  todoMoveToTrash,
  todoRestoreFromTrash,
  todoSetRecurrence,
  todoSkip,
  todoToggle,
  todosRevertChanges,
  topUpSeries,
  newTodo,
} from "../src/logic/derive";
import { applyBulkRestore } from "../src/logic/selection";
import { mergeTodos } from "../src/store/mergeTodos";
import { planMochiOps, type MochiSnapshot } from "../src/logic/mochiOps";
import { formatRepeatEnd, recurrenceLabel, shortDate } from "../src/logic/labels";
import type { Todo } from "../src/domain/types";

function row(over: Partial<Todo> = {}): Todo {
  return {
    id: "head",
    text: "Water plants",
    done: false,
    priority: "medium",
    dueDate: "2026-10-19",
    trashed: false,
    updatedAt: 1,
    recurrence: { freq: "daily" },
    ...over,
  };
}
const open = (ts: Todo[]) => ts.filter((t) => !t.trashed && !t.done);
const day = (t: Todo) => t.dueDate.slice(0, 10);

describe("1 — mergeTodos never drops a row that is in base", () => {
  it("snooze puts two real occurrences on one day; a later merge keeps both", () => {
    const a = row({ id: "s_2026-10-20", seriesId: "s", dueDate: "2026-10-20", notes: "bring gloves" });
    const b = row({ id: "s_2026-10-21", seriesId: "s", dueDate: "2026-10-21" });
    const base = [a, b];
    const local = [{ ...a, dueDate: "2026-10-21", updatedAt: 5 }, b]; // snoozed a day
    const merged = mergeTodos(base, local, base);
    expect(merged.map((t) => t.id).sort()).toEqual(["s_2026-10-20", "s_2026-10-21"]);
    expect(merged.find((t) => t.id === "s_2026-10-20")!.notes).toBe("bring gloves");
  });

  it("a NEW row the user moved onto the day (id names another day) is kept too", () => {
    const b = row({ id: "s_2026-10-21", seriesId: "s", dueDate: "2026-10-21" });
    const moved = row({ id: "s_2026-10-22", seriesId: "s", dueDate: "2026-10-21", updatedAt: 3 });
    expect(mergeTodos([b], [b, moved], [b])).toHaveLength(2);
    // …and a new user-made row (UUID id) is never treated as a generated copy.
    const own = row({ id: "0f3c-uuid", seriesId: "s", dueDate: "2026-10-21" });
    expect(mergeTodos([b], [b, own], [b])).toHaveLength(2);
    expect(isGeneratedSeriesRow(own)).toBe(false);
    expect(isGeneratedSeriesRow(moved)).toBe(false);
  });

  it("a fresh generated copy on a day the base already holds is collapsed", () => {
    const b = row({ id: "keep-me", seriesId: "s", dueDate: "2026-10-21" });
    const copy = row({ id: "s_2026-10-21", seriesId: "s", dueDate: "2026-10-21" });
    expect(mergeTodos([b], [b, copy], [b]).map((t) => t.id)).toEqual(["keep-me"]);
    // A detached copy is the user's — kept.
    const detached = { ...copy, detachedFromSeries: true };
    expect(mergeTodos([b], [b, detached], [b])).toHaveLength(2);
  });

  it("two devices' top-ups after a clash mint the same deterministic fallback id", () => {
    const taken = new Set(["s_2026-10-22"]);
    expect(seriesInstanceId("s", "2026-10-22", taken)).toBe("s_2026-10-22_2");
    expect(seriesInstanceId("s", "2026-10-22", new Set([...taken, "s_2026-10-22_2"]))).toBe("s_2026-10-22_3");
  });

  it("closed rows on the day are never collapsed (done survives)", () => {
    const done = row({ id: "s_2026-10-20", seriesId: "s", dueDate: "2026-10-20", done: true });
    const y = row({ id: "s_2026-10-20_2", seriesId: "s", dueDate: "2026-10-20" });
    const x = row({ id: "s_2026-10-20_3", seriesId: "s", dueDate: "2026-10-20" });
    const merged = mergeTodos([], [done, y], [x]);
    expect(merged.some((t) => t.id === "s_2026-10-20" && t.done)).toBe(true);
    expect(open(merged)).toHaveLength(1);
  });
});

describe("2 — month-end anchor lives on the rule", () => {
  const rec = { freq: "monthly" as const, anchorDay: 31 };
  const members = () => [
    row({ id: "apr", seriesId: "s", dueDate: "2026-04-30", recurrence: rec, done: true, trashed: true }),
    row({ id: "may", seriesId: "s", dueDate: "2026-05-31", recurrence: rec }),
    row({ id: "jun", seriesId: "s", dueDate: "2026-06-30", recurrence: rec }),
  ];

  it("Apr 30 (done), May 31, Jun 30 → next is Jul 31", () => {
    expect(appendNextSeriesInstance(members(), "s").at(-1)!.dueDate).toBe("2026-07-31");
  });

  it("still the 31st after the earlier members are purged", () => {
    const purged = members().filter((t) => t.id === "jun");
    expect(appendNextSeriesInstance(purged, "s").at(-1)!.dueDate).toBe("2026-07-31");
    expect(topUpSeries(purged, "s", "2026-06-30").map(day)).toEqual([
      "2026-06-30", "2026-07-31", "2026-08-31", "2026-09-30",
    ]);
  });

  it("is stamped when a series is created (newTodo / expandSeries) — not on weekly / Nth-weekday", () => {
    const t = newTodo({ text: "Rent", priority: "medium", dueDate: "2026-01-31", recurrence: { freq: "monthly" } });
    expect(t.recurrence!.anchorDay).toBe(31);
    const ts = expandSeries({ ...row({ seriesId: "s", dueDate: "2026-01-31" }), recurrence: { freq: "monthly" } }, "2026-01-31");
    expect(ts.every((m) => m.recurrence!.anchorDay === 31)).toBe(true);
    expect(ts.map(day)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(expandSeries(row({ recurrence: { freq: "weekly" } }), "2026-10-19")[1].recurrence!.anchorDay).toBeUndefined();
    const nth = newTodo({
      text: "x", priority: "low", dueDate: "2026-10-08",
      recurrence: { freq: "monthly", byWeekday: [4], bySetPos: [2], anchorDay: 8 },
    });
    expect(nth.recurrence!.anchorDay).toBeUndefined();
  });

  it("a rule change re-anchors on the target's day; an endDate-only edit keeps it", () => {
    let ts = expandSeries(row({ seriesId: "s", dueDate: "2026-10-31", recurrence: { freq: "monthly" } }), "2026-10-31");
    const nov = ts.find((t) => day(t) === "2026-11-30")!;
    // A real rule change (every 2 months) anchors on the target's own day…
    const changedRule = todoApplyRecurrenceChange(ts, nov.id, { freq: "monthly", interval: 2 }, "2026-11-30").next;
    expect(changedRule.find((t) => t.id === nov.id)!.recurrence!.anchorDay).toBe(30);
    // …while re-saving the SAME rule (round 4) keeps the series' 31st.
    ts = todoApplyRecurrenceChange(ts, nov.id, { freq: "monthly", anchorDay: 31 }, "2026-11-30").next;
    expect(ts.find((t) => t.id === nov.id)!.recurrence!.anchorDay).toBe(31);
    // endDate-only edit on a clamped row keeps the series' 31st.
    const clamped = row({ id: "c", seriesId: "q", dueDate: "2026-02-28", recurrence: { freq: "monthly", anchorDay: 31 } });
    const [kept] = todoSetRecurrence([clamped], "c", { freq: "monthly", anchorDay: 31, endDate: "2026-12-31" });
    expect(kept.recurrence!.anchorDay).toBe(31);
    const [changed] = todoSetRecurrence([clamped], "c", { freq: "yearly" });
    expect(changed.recurrence!.anchorDay).toBe(28);
  });

  it("§5 fixture: after the rule change every later monthly top-up lands on the 30th", () => {
    let ts = expandSeries(row({ dueDate: "2026-10-31", seriesId: "s" }), "2026-10-31");
    ts = topUpSeries(ts, "s", "2026-11-30");
    const nov30 = ts.find((t) => t.dueDate === "2026-11-30")!;
    ts = todoApplyRecurrenceChange(ts, nov30.id, { freq: "monthly" }, "2026-11-30").next;
    const topped = topUpSeries(ts, "s", "2027-05-01");
    const later = open(topped).filter((t) => t.recurrence?.freq === "monthly" && day(t) > "2027-03-31");
    expect(later.length).toBeGreaterThan(0);
    expect(later.every((t) => day(t).endsWith("-30"))).toBe(true);
  });

  it("the migrator keeps a valid anchorDay and drops a bad one", () => {
    const ctx = makeMigrateTodoCtx();
    const mig = (r: unknown) => migrateTodo(row({ recurrence: r as Todo["recurrence"] }), ctx)!.recurrence;
    expect(mig({ freq: "monthly", anchorDay: 31 })!.anchorDay).toBe(31);
    for (const bad of [0, 32, 3.5, "31", -1, NaN]) {
      expect(mig({ freq: "monthly", anchorDay: bad })!.anchorDay).toBeUndefined();
    }
    expect(mig({ freq: "weekly", anchorDay: 5 })!.anchorDay).toBeUndefined();
  });
});

describe("3 — todosRevertChanges restores rows the action removed", () => {
  it("daily → weekly rule change, Undo = the original 8 rows in order", () => {
    const before = expandSeries(row({ seriesId: "s" }), "2026-10-19");
    expect(before).toHaveLength(8);
    const after = todoApplyRecurrenceChange(before, "head", { freq: "weekly" }, "2026-10-19").next;
    expect(after.map(day)).not.toEqual(before.map(day));
    const reverted = todosRevertChanges(after, before, after);
    expect(reverted.map((t) => t.id)).toEqual(before.map((t) => t.id));
    expect(reverted.map(day)).toEqual(before.map(day));
    expect(reverted.every((t) => t.recurrence!.freq === "daily")).toBe(true);
  });

  it("keeps later edits to other rows and doesn't duplicate a row that came back", () => {
    const before = [row({ id: "a", recurrence: undefined }), row({ id: "b", recurrence: undefined }), row({ id: "c", recurrence: undefined })];
    const after = [before[0], before[2]]; // "b" removed
    const prev = [before[0], { ...before[2], text: "edited later" }];
    const out = todosRevertChanges(prev, before, after);
    expect(out.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(out[2].text).toBe("edited later");
    expect(todosRevertChanges(before, before, after)).toBe(before);
  });
});

describe("4 — applyBulkRestore matches todoRestoreFromTrash", () => {
  it("clears Not Do, reopens done steps, ignores non-binned rows", () => {
    const skipped = row({
      id: "k", recurrence: undefined, trashed: true, trashedAt: 1, status: "notDo", completionDate: "2026-10-18",
    });
    const doneSteps = row({
      id: "d", recurrence: undefined, done: true, trashed: true, trashedAt: 1, completionDate: "2026-10-18",
      subtasks: [{ id: "x", text: "x", done: true, priority: "medium", dueDate: "", completionDate: "2026-10-18" }],
    });
    const active = row({
      id: "a", recurrence: undefined,
      subtasks: [{ id: "y", text: "y", done: true, priority: "medium", dueDate: "" }],
    });
    const todos = [skipped, doneSteps, active];
    const bulk = applyBulkRestore(todos, new Set(["k", "d", "a"]));
    let single = todos;
    for (const id of ["k", "d", "a"]) single = todoRestoreFromTrash(single, id);
    const strip = (ts: Todo[]) => ts.map(({ updatedAt: _u, ...r }) => r);
    expect(strip(bulk)).toEqual(strip(single));
    expect(bulk[0].status).toBeUndefined();
    expect(bulk[1].subtasks![0].done).toBe(false);
    expect(bulk[1].subtasks![0].completionDate).toBeUndefined();
    expect(bulk[2]).toBe(active);
  });
});

describe("5 — appends are clamped to today when today is passed", () => {
  const lapsed = () => [row({ id: "old", seriesId: "s", dueDate: "2026-09-01" })];

  it("appendNextSeriesInstance(…, today) resumes at today; omitted keeps one-period-past", () => {
    expect(day(appendNextSeriesInstance(lapsed(), "s").at(-1)!)).toBe("2026-09-02");
    expect(day(appendNextSeriesInstance(lapsed(), "s", "2026-10-19").at(-1)!)).toBe("2026-10-19");
  });

  it("completing / skipping the lapsed row with an explicit today", () => {
    expect(day(todoToggle(lapsed(), "old", "2026-10-19").at(-1)!)).toBe("2026-10-19");
    expect(day(todoSkip(lapsed(), "old", "2026-10-19").at(-1)!)).toBe("2026-10-19");
  });

  it("the appended row still respects endDate", () => {
    const ts = [row({ id: "old", seriesId: "s", dueDate: "2026-09-01", recurrence: { freq: "daily", endDate: "2026-10-01" } })];
    expect(appendNextSeriesInstance(ts, "s", "2026-10-19")).toBe(ts);
  });
});

describe("7 — Mochi: duplicate ops in one turn don't cancel out", () => {
  const snap: MochiSnapshot = {
    today: "2026-10-19",
    todos: [
      { id: "A", text: "A", done: false },
      { id: "D", text: "D", done: true, trashed: true },
      { id: "S", text: "S", done: false, subtasks: [{ id: "s1", text: "Book flight", done: false }] },
    ],
    categories: [],
    groceries: [{ id: "g", text: "Milk", checked: false }],
  };
  const plan = (ops: unknown[]) => planMochiOps(ops as never, snap, { genId: () => "id" });

  it("markDone twice → one toggle; markDone then markUndone → back again", () => {
    const md = { kind: "markDone", args: { todoId: "A" } };
    const mu = { kind: "markUndone", args: { todoId: "A" } };
    expect(plan([md, md])).toEqual([{ type: "toggle", todoId: "A" }]);
    expect(plan([md, mu, mu])).toHaveLength(2);
  });

  it("markUndone reopens a completed (binned) to-do once", () => {
    const mu = { kind: "markUndone", args: { todoId: "D" } };
    expect(plan([mu, mu])).toEqual([{ type: "toggle", todoId: "D" }]);
  });

  it("setGroceryChecked / step complete twice → one toggle each", () => {
    const g = { kind: "setGroceryChecked", args: { groceryId: "g", checked: true } };
    expect(plan([g, g])).toEqual([{ type: "toggleGroceryChecked", groceryId: "g" }]);
    const c = { kind: "subtaskAction", args: { todoId: "S", subtaskText: "Book flight", action: "complete" } };
    expect(plan([c, c])).toEqual([{ type: "toggleSubtask", todoId: "S", subtaskId: "s1" }]);
    // markDone on the parent already completed its steps.
    expect(plan([{ kind: "markDone", args: { todoId: "S" } }, c])).toEqual([{ type: "toggle", todoId: "S" }]);
  });
});

describe("8 — skip is a no-op on a done or binned row", () => {
  it("doesn't relabel a completed occurrence or append another", () => {
    const ts = expandSeries(row({ seriesId: "s" }), "2026-10-19");
    const done = todoToggle(ts, "head", "2026-10-19");
    expect(todoSkip(done, "head", "2026-10-19")).toBe(done);
    const binned = todoMoveToTrash(ts, "s_2026-10-20");
    expect(todoSkip(binned, "s_2026-10-20", "2026-10-19")).toBe(binned);
  });
});

describe("9 — labels exported for mobile", () => {
  const opts = { locale: "en-US", now: new Date(2026, 5, 1) };
  it("shortDate takes a Date or a local ISO string", () => {
    expect(shortDate("2026-06-07", opts)).toBe("Jun 7");
    expect(shortDate("2027-06-07T09:00", opts)).toBe("Jun 7, 2027");
    expect(shortDate(new Date(2026, 0, 2), opts)).toBe("Jan 2");
    expect(shortDate("nope", opts)).toBe("nope");
  });
  it("formatRepeatEnd", () => {
    expect(formatRepeatEnd(undefined, opts)).toBeUndefined();
    expect(formatRepeatEnd("bad", opts)).toBeUndefined();
    expect(formatRepeatEnd("2026-12-31", opts)).toBe("Dec 31");
    expect(recurrenceLabel({ freq: "daily", endDate: "2026-12-31" }, undefined, opts)).toBe("Daily · ends Dec 31");
  });
});

describe("mutation survivors", () => {
  it("rule change keeps rows before the target (cutoff clause)", () => {
    let ts = expandSeries(row({ seriesId: "s" }), "2026-10-19");
    ts = todoToggle(ts, "head", "2026-10-19");
    ts = todoApplyRecurrenceChange(ts, "s_2026-10-21", { freq: "weekly" }, "2026-10-19").next;
    expect(ts.some((t) => t.id === "head")).toBe(true);
    expect(ts.some((t) => t.id === "s_2026-10-20" && t.seriesId === "s")).toBe(true);
  });

  it("rule change with a binned occurrence mints unique ids", () => {
    let ts = expandSeries(row({ seriesId: "s" }), "2026-10-19");
    ts = todoMoveToTrash(ts, "s_2026-10-21");
    ts = todoApplyRecurrenceChange(ts, "head", { freq: "daily", interval: 2 }, "2026-10-19").next;
    expect(new Set(ts.map((t) => t.id)).size).toBe(ts.length);
  });

  it("defer: a done occurrence on the target day doesn't block", () => {
    const o = row({ id: "o", seriesId: "s", dueDate: "2026-10-17" });
    const d = row({ id: "d", seriesId: "s", dueDate: "2026-10-20", done: true });
    const r = todoDeferTo([o, d], ["o"], "2026-10-20", "2026-10-19");
    expect(r.next.find((t) => t.id === "o")!.dueDate).toBe("2026-10-20");
    expect(r.deferred).toBe(1);
  });

  it("seriesInstanceId 64-char cap: exactly 64 kept, 65 → UUID", () => {
    const sid53 = "x".repeat(53); // 53 + 1 + 10 = 64
    expect(seriesInstanceId(sid53, "2026-10-20")).toBe(`${sid53}_2026-10-20`);
    const sid54 = "x".repeat(54);
    expect(seriesInstanceId(sid54, "2026-10-20").startsWith(sid54)).toBe(false);
  });
});
