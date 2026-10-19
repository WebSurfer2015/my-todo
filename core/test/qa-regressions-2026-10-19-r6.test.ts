// Regressions found by the round-6 QA pass (2026-10-19): an exact Undo
// compares CONTENT (a row changed and put back is still "untouched"), a
// series' horizon is measured from occurrence days (a moved row no longer
// opens a gap), days held by former members aren't minted again, Mochi can
// resume a series ended on an overdue row — plus mutation-survivor killers.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendNextSeriesInstance,
  expandSeries,
  subtaskAdd,
  todoApplyRecurrenceChange,
  todoSet,
  todoSetReminders,
  todoSkipSeriesFuture,
  todoToggle,
  todosRevertChanges,
  todosRevertChangesWithReport,
  topUpSeries,
} from "../src/logic/derive";
import { mergeAgentRecurrence, planMochiOps, type MochiSnapshot } from "../src/logic/mochiOps";
import { weekdayTime } from "../src/logic/labels";
import type { Todo } from "../src/domain/types";

const TODAY = "2026-10-19";
function row(over: Partial<Todo> = {}): Todo {
  return {
    id: "head",
    text: "Water",
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
const onDay = (ts: Todo[], d: string) => ts.filter((t) => day(t) === d);
const strip = (ts: Todo[]) =>
  ts.map(({ updatedAt: _u, ...rest }) => rest).sort((a, b) => a.id.localeCompare(b.id));
const daily = () => expandSeries(row({ seriesId: "s" }), TODAY);

describe("1 — a row changed and put back still counts as untouched", () => {
  // Every action stamps a later updatedAt, as on a device.
  let clock = 1_000_000;
  beforeEach(() => {
    vi.spyOn(Date, "now").mockImplementation(() => (clock += 1000));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(a) capture → chip edit → chip undo → Undo removes the captured row", () => {
    const before: Todo[] = [];
    const after = [row({ id: "a", recurrence: undefined })];
    const edited = todoSet(after, "a", "category", "work");
    const putBack = todoSet(edited, "a", "category", undefined);
    expect(todosRevertChanges(putBack, before, after)).toEqual([]);
  });

  it("(b) two tracked step adds on one row → Undo both removes both", () => {
    const s0 = [row({ id: "a", recurrence: undefined })];
    const s1 = subtaskAdd(s0, "a", "flour");
    const s2 = subtaskAdd(s1, "a", "eggs");
    // Newest first, as combineUndos runs them.
    const u1 = todosRevertChanges(s2, s1, s2);
    const u2 = todosRevertChanges(u1, s0, s1);
    expect(u2.find((t) => t.id === "a")!.subtasks ?? []).toEqual([]);
  });

  it("(c) merged Undo all of two completions in one series (reminders moved between rows)", () => {
    const base = todoSetReminders(daily(), "head", [{ id: "r1", at: `${TODAY}T08:00` }]);
    const c1 = todoToggle(base, "head", TODAY);
    // The reminder rolled onto the next occurrence.
    expect(c1.find((t) => t.id === "s_2026-10-20")!.reminders?.length).toBe(1);
    const c2 = todoToggle(c1, "s_2026-10-20", TODAY);
    const u1 = todosRevertChanges(c2, c1, c2);
    const u2 = todosRevertChanges(u1, base, c1);
    expect(strip(u2)).toEqual(strip(base));
  });

  it("an empty optional array the parser dropped still matches", () => {
    const before = [row({ id: "a", recurrence: undefined })];
    const after = todoToggle(before, "a", TODAY).map((t) => ({ ...t, subtasks: [] }));
    const parsed = after.map(({ subtasks: _s, ...rest }) => rest as Todo);
    expect(todosRevertChanges(parsed, before, after).find((t) => t.id === "a")!.done).toBe(false);
  });
});

describe("6 — a partial Undo reports what it kept", () => {
  it("rule change → complete a new-rule row → Undo reports skipped rows", () => {
    const before = expandSeries(row({ seriesId: "s", recurrence: { freq: "weekly" } }), TODAY);
    const after = todoApplyRecurrenceChange(before, "head", { freq: "daily" }, TODAY).next;
    const d21 = onDay(after, "2026-10-21")[0];
    const completed = todoToggle(after, d21.id, TODAY);
    const res = todosRevertChangesWithReport(completed, before, after);
    expect(res.skipped).toBe(1);
    expect(res.todos.find((t) => t.id === d21.id)!.done).toBe(true);
  });

  it("an immediate Undo skips nothing; a no-op revert hands back prev", () => {
    const before = daily();
    const after = todoToggle(before, "head", TODAY);
    const res = todosRevertChangesWithReport(after, before, after);
    expect(res.skipped).toBe(0);
    expect(strip(res.todos)).toEqual(strip(before));
    const none = todosRevertChangesWithReport(before, before, before);
    expect(none).toEqual({ todos: before, skipped: 0 });
  });

  it("an edited row kept and nothing else to revert → prev, skipped 1", () => {
    const before = [row({ id: "a", recurrence: undefined })];
    const after = todoToggle(before, "a", TODAY);
    const later = todoSet(after, "a", "text", "renamed");
    const res = todosRevertChangesWithReport(later, before, after);
    expect(res.todos).toBe(later);
    expect(res.skipped).toBe(1);
  });
});

describe("3 — Mochi resumes a series ended on its overdue last row", () => {
  it("daily from 10-18, Skip all from 10-19 → 'repeat daily' plans and applies a resume", () => {
    const built = expandSeries(row({ id: "s0", seriesId: "s", dueDate: "2026-10-18" }), "2026-10-18");
    const skipped = todoSkipSeriesFuture(built, "s_2026-10-19", TODAY).next;
    const s0 = skipped.find((t) => t.id === "s0")!;
    expect(s0.recurrence!.endDate).toBe("2026-10-18");
    const snap: MochiSnapshot = { today: TODAY, todos: skipped, categories: [], groceries: [] };
    const ops = planMochiOps(
      [{ kind: "editTodo", args: { todoId: "s0", recurrence: { freq: "daily" } } }] as never,
      snap,
      { genId: () => "id" },
    );
    const rec = ops.find((o) => o.type === "updateRecurrence") as { recurrence: { freq: string; endDate?: string } };
    expect(rec).toBeDefined();
    expect(rec.recurrence).toEqual({ freq: "daily" });
    const applied = todoApplyRecurrenceChange(skipped, "s0", rec.recurrence as never, TODAY).next;
    const open = series(applied).filter((t) => !t.done && !t.trashed && day(t) > TODAY);
    expect(open.length).toBeGreaterThan(0);
  });

  it("an end on or after today is kept (an overdue row on an unexpired series)", () => {
    expect(mergeAgentRecurrence({ freq: "weekly" }, { freq: "daily", endDate: "2026-10-19" }, "2026-10-18", TODAY)).toEqual(
      { freq: "weekly", endDate: "2026-10-19" },
    );
    expect(mergeAgentRecurrence({ freq: "weekly" }, { freq: "daily", endDate: "2026-10-18" }, "2026-10-18", TODAY)).toEqual(
      { freq: "weekly" },
    );
    // A future row still compares against its own day.
    expect(mergeAgentRecurrence({ freq: "weekly" }, { freq: "daily", endDate: "2026-10-22" }, "2026-10-25", TODAY)).toEqual(
      { freq: "weekly" },
    );
  });
});

describe("4 — 'Keep my edits' doesn't mint a duplicate on a kept one-off's day", () => {
  const withDetached = () =>
    todoSet(daily(), "s_2026-10-22", "detachedFromSeries", true).map((t) =>
      t.id === "s_2026-10-22" ? { ...t, text: "my edit" } : t,
    );

  it("rule change with keepDetached", () => {
    const next = todoApplyRecurrenceChange(withDetached(), "head", { freq: "daily", interval: 3 }, TODAY, {
      keepDetached: true,
    }).next;
    expect(onDay(next, "2026-10-22")).toHaveLength(1);
    expect(onDay(next, "2026-10-22")[0].text).toBe("my edit");
    expect(onDay(next, "2026-10-25")).toHaveLength(1);
  });

  it("end shortened (keep edits) then cleared — topUp skips the kept day", () => {
    const shortened = todoApplyRecurrenceChange(withDetached(), "head", { freq: "daily", endDate: "2026-10-21" }, TODAY, {
      keepDetached: true,
    }).next;
    expect(shortened.find((t) => t.id === "s_2026-10-22")!.seriesId).toBeUndefined();
    const cleared = todoApplyRecurrenceChange(shortened, "head", { freq: "daily" }, TODAY, { keepDetached: true }).next;
    expect(onDay(cleared, "2026-10-22")).toHaveLength(1);
    expect(onDay(cleared, "2026-10-23")).toHaveLength(1);
  });

  it("appendNextSeriesInstance skips a day a former member holds", () => {
    const ts = daily()
      .filter((t) => day(t) <= "2026-10-22")
      .map((t) => {
        if (t.id !== "s_2026-10-22") return t;
        const { seriesId: _s, recurrence: _r, ...rest } = t;
        return rest as Todo;
      });
    const out = appendNextSeriesInstance(ts, "s", TODAY);
    const added = out.filter((t) => !ts.includes(t));
    expect(added.map(day)).toEqual(["2026-10-23"]);
  });

  it("a rule change doesn't re-mint a day settled by an EARLIER change's one-off", () => {
    const ts = daily()
      .filter((t) => day(t) <= "2026-10-22")
      .map((t) => {
        if (t.id !== "s_2026-10-22") return t;
        const { seriesId: _s, recurrence: _r, ...rest } = t;
        return { ...rest, done: true } as Todo;
      });
    const next = todoApplyRecurrenceChange(ts, "head", { freq: "daily", interval: 3 }, TODAY).next;
    expect(onDay(next, "2026-10-22")).toHaveLength(1);
    expect(next.some((t) => t.id === "s_2026-10-22_2")).toBe(false);
  });
});

describe("5 — an occurrence moved past the window leaves no gap", () => {
  it("move the 10-19 row to 10-29 → later top-ups fill 10-27 and 10-28", () => {
    const moved = todoSet(daily(), "head", "dueDate", "2026-10-29");
    const later = topUpSeries(moved, "s", "2026-10-21");
    expect(onDay(later, "2026-10-27")).toHaveLength(1);
    expect(onDay(later, "2026-10-28")).toHaveLength(1);
  });

  it("a moved generated row doesn't hold the tail either; its own day is never re-minted", () => {
    const moved = todoSet(daily(), "s_2026-10-26", "dueDate", "2026-10-24");
    const later = topUpSeries(moved, "s", "2026-10-20");
    expect(onDay(later, "2026-10-26")).toHaveLength(0);
    expect(onDay(later, "2026-10-27")).toHaveLength(1);
  });

  it("completing a row still appends a tail when another row was moved past the window", () => {
    const moved = todoSet(daily(), "s_2026-10-20", "dueDate", "2026-10-29");
    const done = todoToggle(moved, "s_2026-10-21", TODAY);
    expect(onDay(done, "2026-10-27")).toHaveLength(1);
  });

  it("a series of only its seed measures from the seed", () => {
    const ts = [row({ seriesId: "s", recurrence: { freq: "yearly" } })];
    const out = topUpSeries(ts, "s", TODAY);
    expect(series(out).map(day)).toContain("2027-10-19");
  });
});

describe("r6 killers", () => {
  it("d6: snapshot copy that dropped undefined keys still reverts", () => {
    const before = [row({ id: "a", recurrence: undefined })];
    const after = todoToggle(before, "a", TODAY).map((t) => ({ ...t, notes: undefined }));
    const cloned = after.map((t) => JSON.parse(JSON.stringify(t)) as Todo);
    const out = todosRevertChanges(cloned, before, after);
    expect(out.find((t) => t.id === "a")!.done).toBe(false);
  });
  it("d6b: a nested undefined key a snapshot dropped still matches", () => {
    const before = [row({ id: "a", recurrence: undefined, subtasks: [{ id: "s1", text: "one", done: false }] } as Partial<Todo>)];
    const after = todoToggle(before, "a", TODAY).map((t) => ({
      ...t,
      subtasks: (t.subtasks ?? []).map((s) => ({ ...s, dueDate: undefined })),
    }));
    const cloned = after.map((t) => JSON.parse(JSON.stringify(t)) as Todo);
    const out = todosRevertChanges(cloned, before, after);
    expect(out.find((t) => t.id === "a")!.done).toBe(false);
  });
  it("d8: a step added after the action keeps the row (no Undo rewind)", () => {
    const before = [row({ id: "a", recurrence: undefined, subtasks: [{ id: "s1", text: "one", done: false }] } as Partial<Todo>)];
    const after = todoToggle(before, "a", TODAY);
    const later = after.map((t) => ({ ...t, subtasks: [...(t.subtasks ?? []), { id: "s2", text: "two", done: false }] }));
    const out = todosRevertChanges(later, before, after);
    expect(out).toBe(later);
  });
  it("d11: a settled ex-member deferred off its id-day doesn't hold the day it moved to", () => {
    const ts = [row({ seriesId: "s" }), row({ id: "s_2026-10-22", dueDate: "2026-10-24", done: true, recurrence: undefined })];
    const out = topUpSeries(ts, "s", TODAY);
    expect(out.some((t) => t.seriesId === "s" && day(t) === "2026-10-24" && !t.done)).toBe(true);
    // …but its own occurrence day stays held.
    expect(out.some((t) => t.seriesId === "s" && day(t) === "2026-10-22")).toBe(false);
  });
  it("m3: same-edit dueDate past the old end drops it", () => {
    const snap: MochiSnapshot = {
      today: TODAY,
      todos: [{ id: "E", text: "x", done: false, seriesId: "e", dueDate: "2026-10-10", recurrence: { freq: "daily", endDate: "2026-10-25" } }],
      categories: [],
      groceries: [],
    } as never;
    const ops = planMochiOps([{ kind: "editTodo", args: { todoId: "E", dueDate: "2026-10-28", recurrence: { freq: "daily" } } }] as never, snap, { genId: () => "id" });
    const rec = ops.find((o: { type: string }) => o.type === "updateRecurrence") as { recurrence: { endDate?: string } } | undefined;
    expect(rec).toBeDefined();
    expect(rec!.recurrence.endDate).toBeUndefined();
  });
  it("m5: timed fromDay compares by day — end on the row's day is kept", () => {
    expect(mergeAgentRecurrence({ freq: "weekly" }, { freq: "daily", endDate: "2026-10-20" }, "2026-10-20T09:00")).toEqual({ freq: "weekly", endDate: "2026-10-20" });
    expect(mergeAgentRecurrence({ freq: "weekly" }, { freq: "daily", endDate: "2026-10-20" }, "2026-10-20T09:00", TODAY)).toEqual({ freq: "weekly", endDate: "2026-10-20" });
  });
});

describe("weekdayTime label (reminder presets)", () => {
  const EN = { locale: "en-US", now: new Date(2026, 9, 19, 12, 0) };
  it("another day: short weekday + time", () => {
    expect(weekdayTime("2026-10-21T09:00", EN)).toMatch(/^Wed,?\s9:00\sAM$/);
    expect(weekdayTime(new Date(2026, 9, 22, 18, 0), EN)).toMatch(/^Thu,?\s6:00\sPM$/);
    // A date-only string reads as local midnight, not UTC.
    expect(weekdayTime("2026-10-21", EN)).toMatch(/^Wed,?\s12:00\sAM$/);
  });
  it("same day as now: just the time", () => {
    expect(weekdayTime("2026-10-19T21:05", EN)).toMatch(/^9:05\sPM$/);
  });
  it("other ISO shapes parse via Date; unparseable gives ''", () => {
    expect(weekdayTime(new Date(2026, 9, 21, 9, 0).toISOString(), EN)).toMatch(/^Wed,?\s9:00\sAM$/);
    expect(weekdayTime("nope", EN)).toBe("");
    expect(weekdayTime(new Date(NaN), EN)).toBe("");
  });
});
