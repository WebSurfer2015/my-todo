// Regressions found by the round-4 QA pass (2026-10-19): same-rule edits keep
// the stored anchor, rule changes don't re-mint settled days, Mochi keeps the
// series end / set-pos and never completes a row it closed this turn, skipped
// rows can't be completed, completion cycles don't grow the series — plus
// mutation-survivor gaps. (The DST fix lives in dst-reminders.test.ts.)
import { describe, expect, it } from "vitest";
import {
  expandSeries,
  isGeneratedSeriesRow,
  subtaskToggle,
  todoApplyRecurrenceChange,
  todoSkip,
  todoToggle,
  topUpSeries,
} from "../src/logic/derive";
import { mergeAgentRecurrence, planMochiOps, type MochiSnapshot } from "../src/logic/mochiOps";
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
const series = (ts: Todo[], sid = "s") => ts.filter((t) => t.seriesId === sid);

describe("2 — a same-rule edit patches endDate, keeping the stored anchor", () => {
  const monthly31 = () =>
    expandSeries(row({ seriesId: "s", dueDate: "2026-10-31", recurrence: { freq: "monthly" } }), "2026-10-31");

  it("an endDate-only edit on the Nov 30 row keeps anchorDay 31 and the 31st rows", () => {
    const ts = monthly31();
    const nov = ts.find((t) => day(t) === "2026-11-30")!;
    const next = todoApplyRecurrenceChange(ts, nov.id, { freq: "monthly", endDate: "2027-06-30" }, "2026-11-30").next;
    for (const t of series(next)) {
      expect(t.recurrence!.anchorDay).toBe(31);
      expect(t.recurrence!.endDate).toBe("2027-06-30");
    }
    // Dec 31 is still the 31st (a rebuild would have re-anchored to the 30th).
    expect(series(next).map(day)).toContain("2026-12-31");
    expect(series(next).map(day)).not.toContain("2026-12-30");
    // No sibling was rebuilt: every original id survives (the window top-up
    // may add a newer one).
    const ids = new Set(series(next).map((t) => t.id));
    expect(series(ts).every((t) => ids.has(t.id))).toBe(true);
  });

  it("shortening the end removes open rows past it and ends the series there", () => {
    const ts = monthly31();
    const nov = ts.find((t) => day(t) === "2026-11-30")!;
    const { next, trashedCount } = todoApplyRecurrenceChange(
      ts, nov.id, { freq: "monthly", endDate: "2026-12-31" }, "2026-11-30",
    );
    expect(series(next).map(day).sort()).toEqual(["2026-10-31", "2026-11-30", "2026-12-31"]);
    expect(trashedCount).toBe(1); // Jan 31
    // A later top-up doesn't regrow it.
    expect(series(topUpSeries(next, "s", "2027-02-01")).length).toBe(3);
  });

  it("a past-end row already in the bin becomes a one-off; a kept-detached one too", () => {
    let ts = monthly31();
    ts = ts.map((t) =>
      day(t) === "2027-01-31" ? { ...t, done: true, trashed: true } : t,
    );
    const nov = ts.find((t) => day(t) === "2026-11-30")!;
    const { next } = todoApplyRecurrenceChange(ts, nov.id, { freq: "monthly", endDate: "2026-12-31" }, "2026-11-30", { keepDetached: true });
    const jan = next.find((t) => day(t) === "2027-01-31")!;
    expect(jan.seriesId).toBeUndefined();
    expect(jan.recurrence).toBeUndefined();
  });

  it("extending / clearing the end tops the series up to its window", () => {
    let ts = expandSeries(row({ seriesId: "s", dueDate: "2026-10-19", recurrence: { freq: "daily", endDate: "2026-10-21" } }), "2026-10-19");
    expect(series(ts).length).toBe(3);
    ts = todoApplyRecurrenceChange(ts, "head", { freq: "daily" }, "2026-10-19").next;
    expect(series(ts).every((t) => t.recurrence!.endDate === undefined)).toBe(true);
    expect(series(ts).map(day)).toContain("2026-10-26");
  });

  it("an unchanged rule is a no-op on the rows' rules", () => {
    const ts = monthly31();
    const nov = ts.find((t) => day(t) === "2026-11-30")!;
    const next = todoApplyRecurrenceChange(ts, nov.id, { freq: "monthly" }, "2026-10-31").next;
    expect(next).toEqual(ts);
  });
});

describe("3 — a rule change never re-mints a day the user already settled", () => {
  it("done / skipped future days stay single rows", () => {
    let ts = expandSeries(row({ seriesId: "s" }), "2026-10-19");
    const d21 = ts.find((t) => day(t) === "2026-10-21")!;
    const d22 = ts.find((t) => day(t) === "2026-10-22")!;
    ts = todoToggle(ts, d21.id, "2026-10-19");
    ts = todoSkip(ts, d22.id, "2026-10-19");
    const next = todoApplyRecurrenceChange(ts, "head", { freq: "daily", interval: 1, byWeekday: [0, 1, 2, 3, 4, 5, 6] }, "2026-10-19").next;
    for (const d of ["2026-10-21", "2026-10-22"]) {
      expect(next.filter((t) => day(t) === d)).toHaveLength(1);
    }
    expect(next.some((t) => t.id.endsWith("_2"))).toBe(false);
    // Other days are still regenerated.
    expect(series(next).map(day)).toContain("2026-10-23");
  });
});

describe("4 — Mochi keeps the series end and set-pos", () => {
  const snap: MochiSnapshot = {
    today: "2026-10-19",
    todos: [
      { id: "M", text: "Book club", done: false, seriesId: "m", recurrence: { freq: "monthly", byWeekday: [4], bySetPos: [2], endDate: "2027-06-30", anchorDay: 8 } },
      { id: "D", text: "Pills", done: false, seriesId: "d", recurrence: { freq: "daily", endDate: "2026-12-31" } },
      { id: "O", text: "One-off", done: false },
    ],
    categories: [],
    groceries: [],
  };
  const plan = (ops: unknown[]) => planMochiOps(ops as never, snap, { genId: () => "id" });
  const edit = (todoId: string, recurrence: unknown) => ({ kind: "editTodo", args: { todoId, recurrence } });

  it("a weekday change keeps the 2nd-week position and the end date", () => {
    expect(plan([edit("M", { freq: "monthly", byWeekday: [5] })])).toEqual([
      { type: "updateRecurrence", todoId: "M", recurrence: { freq: "monthly", byWeekday: [5], bySetPos: [2], endDate: "2027-06-30" } },
    ]);
  });

  it("restating the current rule emits nothing", () => {
    expect(plan([edit("M", { freq: "monthly", byWeekday: [4] })])).toEqual([]);
    expect(plan([edit("D", { freq: "daily", interval: 1 })])).toEqual([]);
  });

  it("a frequency change keeps the end date, drops a set-pos that no longer applies", () => {
    expect(plan([edit("M", { freq: "weekly", byWeekday: [4] })])).toEqual([
      { type: "updateRecurrence", todoId: "M", recurrence: { freq: "weekly", byWeekday: [4], endDate: "2027-06-30" } },
    ]);
    expect(plan([edit("D", { freq: "weekly" })])[0]).toMatchObject({ recurrence: { freq: "weekly", endDate: "2026-12-31" } });
  });

  it("a one-off gets the agent's rule as-is", () => {
    expect(plan([edit("O", { freq: "daily" })])).toEqual([
      { type: "updateRecurrence", todoId: "O", recurrence: { freq: "daily" } },
    ]);
    expect(mergeAgentRecurrence({ freq: "weekly", interval: 2, byWeekday: [1] }, undefined)).toEqual({ freq: "weekly", interval: 2, byWeekday: [1] });
  });
});

describe("5 — closed this turn stays closed", () => {
  const snap: MochiSnapshot = {
    today: "2026-10-19",
    todos: [
      { id: "A", text: "A", done: false, subtasks: [{ id: "a1", text: "Step", done: false }] },
      { id: "S1", text: "S", done: false, seriesId: "s", dueDate: "2026-10-19" },
      { id: "S2", text: "S", done: false, seriesId: "s", dueDate: "2026-10-20" },
      { id: "S0", text: "S", done: false, seriesId: "s", dueDate: "2026-10-18" },
    ],
    categories: [],
    groceries: [],
  };
  const plan = (ops: unknown[]) => planMochiOps(ops as never, snap, { genId: () => "id" });
  const md = (todoId: string) => ({ kind: "markDone", args: { todoId } });

  it("skip then markDone / edit / step / delete on the same row → only the skip", () => {
    expect(plan([
      { kind: "skipTodo", args: { todoId: "A" } },
      md("A"),
      { kind: "editTodo", args: { todoId: "A", text: "x" } },
      { kind: "addSteps", args: { todoId: "A", steps: [{ text: "y" }] } },
      { kind: "subtaskAction", args: { todoId: "A", subtaskText: "Step", action: "complete" } },
      { kind: "deleteTodo", args: { todoId: "A" } },
      { kind: "skipTodo", args: { todoId: "A" } },
    ])).toEqual([{ type: "skipTodo", todoId: "A" }]);
  });

  it("delete then markDone → only the delete", () => {
    expect(plan([{ kind: "deleteTodo", args: { todoId: "A" } }, md("A")])).toEqual([{ type: "moveToTrash", todoId: "A" }]);
    expect(plan([{ kind: "deleteTodo", args: { todoId: "S1" } }, md("S1")])).toEqual([
      { type: "askDeleteScope", todoId: "S1", text: "S" },
    ]);
  });

  it("skip series-future closes this and later rows, not earlier ones", () => {
    expect(plan([{ kind: "skipTodo", args: { todoId: "S1", scope: "series" } }, md("S2"), md("S0")])).toEqual([
      { type: "skipSeriesFuture", todoId: "S1" },
      { type: "toggle", todoId: "S0" },
    ]);
  });

  it("todoToggle refuses to complete a skipped row", () => {
    const ts = [row({ id: "x", recurrence: undefined, status: "notDo", trashed: true })];
    expect(todoToggle(ts, "x", "2026-10-19")).toBe(ts);
    const s = [row({ id: "y", seriesId: "s", status: "notDo", trashed: true })];
    expect(todoToggle(s, "y", "2026-10-19")).toBe(s);
  });
});

describe("6 — complete / un-complete / re-complete doesn't grow the series", () => {
  it("one append for the first completion, none for the repeats", () => {
    let ts = expandSeries(row({ seriesId: "s" }), "2026-10-19");
    const start = series(ts).length;
    ts = todoToggle(ts, "head", "2026-10-19");
    expect(series(ts).length).toBe(start + 1);
    for (let i = 0; i < 3; i++) {
      ts = todoToggle(ts, "head", "2026-10-19"); // un-complete
      ts = todoToggle(ts, "head", "2026-10-19"); // re-complete
    }
    expect(series(ts).length).toBe(start + 1);
    expect(open(series(ts)).length).toBe(start);
  });

  it("completing a different row still appends one each", () => {
    let ts = expandSeries(row({ seriesId: "s" }), "2026-10-19");
    const start = series(ts).length;
    ts = todoToggle(ts, "head", "2026-10-19");
    ts = todoToggle(ts, "s_2026-10-20", "2026-10-19");
    expect(series(ts).length).toBe(start + 2);
    // Re-completing the second one doesn't add a third.
    ts = todoToggle(todoToggle(ts, "s_2026-10-20", "2026-10-19"), "s_2026-10-20", "2026-10-19");
    expect(series(ts).length).toBe(start + 2);
  });
});

describe("7 — mutation survivors", () => {
  it("finishing a lapsed row's last step appends on today (todayISO reaches the follow-up)", () => {
    const ts = [
      row({ id: "old", seriesId: "s", dueDate: "2026-10-10", subtasks: [{ id: "st", text: "Step", done: false }] }),
    ];
    const next = subtaskToggle(ts, "old", "st", "2026-10-19");
    const appended = next.filter((t) => t.id !== "old");
    expect(appended.map(day)).toEqual(["2026-10-19"]);
  });

  it("isGeneratedSeriesRow: `_2`…`_9` clash variants only", () => {
    const r = (id: string) => row({ id, seriesId: "s", dueDate: "2026-10-20" });
    expect(isGeneratedSeriesRow(r("s_2026-10-20_2"))).toBe(true);
    expect(isGeneratedSeriesRow(r("s_2026-10-20_10"))).toBe(false);
    expect(isGeneratedSeriesRow(r("s_2026-10-20_x"))).toBe(false);
    expect(isGeneratedSeriesRow(r("s_2026-10-20_1"))).toBe(false);
  });
});
