// Regressions found by the round-5 QA pass (2026-10-19): an exact Undo never
// rewinds rows changed after the tracked action, settled days aren't re-minted
// when a series end is shortened then extended, skip cycles don't grow a
// series, Mochi can resume an ended series — plus mutation-survivor gaps and
// the shared weekday-date / time-of-day labels.
import { describe, expect, it } from "vitest";
import {
  expandSeries,
  todoApplyRecurrenceChange,
  todoRestoreFromTrash,
  todoSkip,
  todoToggle,
  todosRevertChanges,
} from "../src/logic/derive";
import { mergeAgentRecurrence, planMochiOps, type MochiSnapshot } from "../src/logic/mochiOps";
import { timeOfDay, weekdayDate } from "../src/logic/labels";
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
const day = (t: Todo) => t.dueDate.slice(0, 10);
const series = (ts: Todo[], sid = "s") => ts.filter((t) => t.seriesId === sid);
const onDay = (ts: Todo[], d: string) => ts.filter((t) => day(t) === d);
const strip = (ts: Todo[]) =>
  ts.map(({ updatedAt: _u, ...rest }) => rest).sort((a, b) => a.id.localeCompare(b.id));
const TODAY = "2026-10-19";

describe("1 — todosRevertChanges leaves rows changed after the action alone", () => {
  const weekly = () =>
    expandSeries(row({ seriesId: "s", recurrence: { freq: "weekly" } }), TODAY);

  it("weekly → daily → complete 10-21 → Undo keeps the completed row and its tail", () => {
    const before = weekly();
    const after = todoApplyRecurrenceChange(before, "head", { freq: "daily" }, TODAY).next;
    const d21 = onDay(after, "2026-10-21")[0];
    expect(d21).toBeDefined();
    const completed = todoToggle(after, d21.id, TODAY);
    const tail = completed.find((t) => !after.some((a) => a.id === t.id))!;
    expect(day(tail)).toBe("2026-10-27");

    const undone = todosRevertChanges(completed, before, after);
    const kept = undone.find((t) => t.id === d21.id)!;
    expect(kept).toBeDefined();
    expect(kept.done).toBe(true);
    // A row a later action appended is never touched.
    expect(undone.some((t) => t.id === tail.id)).toBe(true);
    // Untouched daily rows are removed; the weekly rows come back.
    expect(onDay(undone, "2026-10-22")).toHaveLength(0);
    expect(series(undone).map(day)).toContain("2026-11-02");
  });

  it("endDate-only edit → complete → Undo doesn't silently reopen the row", () => {
    const before = expandSeries(row({ seriesId: "s" }), TODAY);
    const after = todoApplyRecurrenceChange(before, "head", { freq: "daily", endDate: "2026-10-23" }, TODAY).next;
    const d21 = onDay(after, "2026-10-21")[0];
    const completed = todoToggle(after, d21.id, TODAY);
    const undone = todosRevertChanges(completed, before, after);
    expect(undone.find((t) => t.id === d21.id)!.done).toBe(true);
    // Every other row the edit touched gets its end date back off.
    for (const t of series(undone)) {
      if (t.id !== d21.id) expect(t.recurrence!.endDate).toBeUndefined();
    }
    // The rows past the new end the edit removed come back.
    expect(series(undone).map(day)).toContain("2026-10-26");
  });

  it("an immediate Undo is still exact", () => {
    const before = weekly();
    const after = todoApplyRecurrenceChange(before, "head", { freq: "daily" }, TODAY).next;
    expect(strip(todosRevertChanges(after, before, after))).toEqual(strip(before));
    const ends = todoApplyRecurrenceChange(before, "head", { freq: "weekly", endDate: "2026-10-30" }, TODAY).next;
    expect(strip(todosRevertChanges(ends, before, ends))).toEqual(strip(before));
  });

  it("a structurally-equal copy of the action's row (merge / snapshot) still reverts", () => {
    const before = expandSeries(row({ seriesId: "s" }), TODAY);
    const after = todoToggle(before, "head", TODAY);
    const cloned = after.map((t) => JSON.parse(JSON.stringify(t)) as Todo);
    expect(strip(todosRevertChanges(cloned, before, after))).toEqual(strip(before));
  });

  it("nothing left to revert returns prev unchanged", () => {
    const before = [row({ id: "a", recurrence: undefined })];
    const after = todoToggle(before, "a", TODAY);
    const renamed = after.map((t) => ({ ...t, text: "Renamed" }));
    expect(todosRevertChanges(renamed, before, after)).toBe(renamed);
  });
});

describe("2 — shorten then clear a series end doesn't re-mint a settled day", () => {
  it("daily from 10-19, complete 10-22, end 10-20, clear end → one (done) 10-22 row", () => {
    let ts = expandSeries(row({ seriesId: "s" }), TODAY);
    const d22 = onDay(ts, "2026-10-22")[0];
    ts = todoToggle(ts, d22.id, TODAY);
    ts = todoApplyRecurrenceChange(ts, "head", { freq: "daily", endDate: "2026-10-20" }, TODAY).next;
    ts = todoApplyRecurrenceChange(ts, "head", { freq: "daily" }, TODAY).next;
    const rows = onDay(ts, "2026-10-22");
    expect(rows).toHaveLength(1);
    expect(rows[0].done).toBe(true);
    expect(ts.some((t) => t.id.endsWith("_2"))).toBe(false);
    // The other days are back.
    expect(series(ts).map(day)).toEqual(expect.arrayContaining(["2026-10-21", "2026-10-23", "2026-10-26"]));
  });

  it("a skipped day is held the same way", () => {
    let ts = expandSeries(row({ seriesId: "s" }), TODAY);
    const d22 = onDay(ts, "2026-10-22")[0];
    ts = todoSkip(ts, d22.id, TODAY);
    ts = todoApplyRecurrenceChange(ts, "head", { freq: "daily", endDate: "2026-10-20" }, TODAY).next;
    ts = todoApplyRecurrenceChange(ts, "head", { freq: "daily", endDate: "2026-10-25" }, TODAY).next;
    expect(onDay(ts, "2026-10-22")).toHaveLength(1);
    expect(onDay(ts, "2026-10-22")[0].status).toBe("notDo");
  });
});

describe("3 — skip cycles don't grow the series", () => {
  it("skip → restore → skip ×3 appends once", () => {
    let ts = expandSeries(row({ seriesId: "s" }), TODAY);
    const start = series(ts).length;
    const d20 = onDay(ts, "2026-10-20")[0].id;
    for (let i = 0; i < 3; i++) {
      ts = todoSkip(ts, d20, TODAY);
      expect(series(ts).length).toBe(start + 1);
      ts = todoRestoreFromTrash(ts, d20);
    }
  });

  it("complete → restore → skip appends once in total", () => {
    let ts = expandSeries(row({ seriesId: "s" }), TODAY);
    const start = series(ts).length;
    const d20 = onDay(ts, "2026-10-20")[0].id;
    ts = todoToggle(ts, d20, TODAY);
    ts = todoRestoreFromTrash(ts, d20);
    ts = todoSkip(ts, d20, TODAY);
    expect(series(ts).length).toBe(start + 1);
  });

  it("skipping different rows still appends one each", () => {
    let ts = expandSeries(row({ seriesId: "s" }), TODAY);
    expect(series(ts).length).toBe(8);
    ts = todoSkip(ts, onDay(ts, "2026-10-21")[0].id, TODAY);
    expect(series(ts).length).toBe(9);
    // A skipped future row still owes its tail when another row completes.
    ts = todoToggle(ts, "head", TODAY);
    expect(series(ts).length).toBe(10);
  });
});

describe("4 — Mochi can resume an ended series", () => {
  const ended = row({ id: "E", seriesId: "e", dueDate: "2026-10-15", recurrence: { freq: "daily", endDate: "2026-10-14" } });
  const snap: MochiSnapshot = {
    today: TODAY,
    todos: [
      { id: "E", text: "Stretch", done: false, seriesId: "e", dueDate: "2026-10-15", recurrence: { freq: "daily", endDate: "2026-10-14" } },
      { id: "K", text: "Pills", done: false, seriesId: "k", dueDate: "2026-10-15", recurrence: { freq: "daily", endDate: "2026-10-15" } },
      { id: "U", text: "Undated", done: false, seriesId: "u", recurrence: { freq: "daily", endDate: "2026-10-18" } },
    ],
    categories: [],
    groceries: [],
  };
  const plan = (ops: unknown[]) => planMochiOps(ops as never, snap, { genId: () => "id" });
  const edit = (todoId: string, recurrence: unknown) => ({ kind: "editTodo", args: { todoId, recurrence } });

  it("'repeat daily' on an ended overdue row applies a rule with no endDate", () => {
    expect(plan([edit("E", { freq: "daily" })])).toEqual([
      { type: "updateRecurrence", todoId: "E", recurrence: { freq: "daily" } },
    ]);
    // Undated: measured from today.
    expect(plan([edit("U", { freq: "daily" })])).toEqual([
      { type: "updateRecurrence", todoId: "U", recurrence: { freq: "daily" } },
    ]);
  });

  it("an end on/after the row's day is kept", () => {
    expect(plan([edit("K", { freq: "daily" })])).toEqual([]);
    expect(mergeAgentRecurrence({ freq: "weekly" }, { freq: "daily", endDate: "2026-10-15" }, "2026-10-15")).toEqual({
      freq: "weekly",
      endDate: "2026-10-15",
    });
  });

  it("weekly resumes with a tail", () => {
    const [op] = plan([edit("E", { freq: "weekly" })]);
    expect(op).toEqual({ type: "updateRecurrence", todoId: "E", recurrence: { freq: "weekly" } });
    const rec = (op as { recurrence: Todo["recurrence"] }).recurrence;
    const next = todoApplyRecurrenceChange([ended], "E", rec, TODAY).next;
    expect(series(next, "e").some((t) => day(t) > TODAY && !t.done)).toBe(true);
  });
});

describe("mutation survivors (round 5)", () => {
  it("an interval change is a change", () => {
    expect(mergeAgentRecurrence({ freq: "weekly", interval: 2 }, { freq: "weekly" })).toEqual({ freq: "weekly", interval: 2 });
  });

  it("monthly-by-date from a '2nd Thursday' rule drops the set-pos", () => {
    expect(mergeAgentRecurrence({ freq: "monthly" }, { freq: "monthly", byWeekday: [4], bySetPos: [2] })).toEqual({ freq: "monthly" });
  });

  const monthly31 = () =>
    expandSeries(row({ seriesId: "s", dueDate: "2026-10-31", recurrence: { freq: "monthly" } }), "2026-10-31");

  it("shortening the end keeps an open detached past-end row with keepDetached", () => {
    const ts = monthly31().map((t) => (day(t) === "2027-01-31" ? { ...t, detachedFromSeries: true } : t));
    const jan = ts.find((t) => day(t) === "2027-01-31")!;
    const nov = ts.find((t) => day(t) === "2026-11-30")!;
    const { next, trashedCount } = todoApplyRecurrenceChange(
      ts, nov.id, { freq: "monthly", endDate: "2026-12-31" }, "2026-11-30", { keepDetached: true },
    );
    const kept = next.find((t) => t.id === jan.id)!;
    expect(kept).toBeDefined();
    expect(kept.seriesId).toBeUndefined();
    expect(kept.detachedFromSeries).toBeUndefined();
    expect(trashedCount).toBe(0);
  });

  it("the edited row itself is kept even when it falls past the new end", () => {
    const ts = monthly31();
    const dec = ts.find((t) => day(t) === "2026-12-31")!;
    const { next } = todoApplyRecurrenceChange(ts, dec.id, { freq: "monthly", endDate: "2026-11-30" }, "2026-10-31");
    expect(next.some((t) => t.id === dec.id)).toBe(true);
  });
});

describe("weekdayDate / timeOfDay labels", () => {
  const EN = { locale: "en-US", now: new Date(2026, 9, 19, 12, 0) };
  it("weekdayDate: weekday + month + day, year only when not this year", () => {
    expect(weekdayDate(new Date(2026, 9, 21), EN)).toBe("Wed, Oct 21");
    expect(weekdayDate("2026-10-21", EN)).toBe("Wed, Oct 21");
    expect(weekdayDate("2026-10-21T09:30", EN)).toBe("Wed, Oct 21");
    expect(weekdayDate(new Date(2027, 9, 21), EN)).toBe("Thu, Oct 21, 2027");
    expect(weekdayDate("nope", EN)).toBe("nope");
    expect(weekdayDate(new Date(NaN), EN)).toBe("");
  });
  it("timeOfDay: hour + minute only", () => {
    expect(timeOfDay(new Date(2026, 9, 21, 9, 0), EN)).toMatch(/^9:00\sAM$/);
    expect(timeOfDay("2026-10-21T21:05", EN)).toMatch(/^9:05\sPM$/);
    expect(timeOfDay("nope", EN)).toBe("nope");
    expect(timeOfDay(new Date(NaN), EN)).toBe("");
  });
});
