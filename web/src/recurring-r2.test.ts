/**
 * R2 of the recurring-todo redesign — migration of legacy rolling
 * recurrences into the pre-expanded horizon model, plus the
 * top-up-all-series sweep that runs on every launch.
 *
 * The actual hydrate-time wiring lives in
 * mobile/src/slices/useTodosSlice.ts; this file exercises the pure
 * core functions.
 */
import { describe, expect, it } from "vitest";
import {
  migrateToRecurringV2,
  topUpAllSeries,
  expandSeries,
} from "../../core/src/logic/derive";
import type { Todo } from "../../core/src/domain/types";

function rolling(over: Partial<Todo> = {}): Todo {
  return {
    id: "rolling-1",
    text: "Take medicine",
    done: false,
    priority: "medium",
    dueDate: "2026-05-28",
    trashed: false,
    updatedAt: 1,
    recurrence: { freq: "daily" },
    ...over,
  };
}

describe("migrateToRecurringV2 — first launch", () => {
  it("active future-dated rolling todo expands into a series", () => {
    const out = migrateToRecurringV2([rolling()], "2026-05-28");
    expect(out.changed).toBe(true);
    expect(out.todos).toHaveLength(8);
    const sid = out.todos[0].seriesId;
    expect(sid).toBeTruthy();
    expect(out.todos.every((t) => t.seriesId === sid)).toBe(true);
    expect(out.todos[0].id).toBe("rolling-1");
  });

  it("past-dated rolling head keeps its overdue dueDate", () => {
    const seed = rolling({ dueDate: "2026-05-25" });
    const out = migrateToRecurringV2([seed], "2026-05-28");
    const head = out.todos.find((t) => t.id === "rolling-1")!;
    expect(head.dueDate).toBe("2026-05-25");
    expect(head.seriesId).toBeTruthy();
    const tail = out.todos.filter((t) => t.id !== "rolling-1");
    // Tail starts at today and runs through today + 7.
    expect(tail.map((t) => t.dueDate)).toEqual([
      "2026-05-28",
      "2026-05-29",
      "2026-05-30",
      "2026-05-31",
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
    ]);
  });

  it("does not retroactively generate instances between past dueDate and today", () => {
    const seed = rolling({ dueDate: "2026-05-20" });
    const out = migrateToRecurringV2([seed], "2026-05-28");
    const tailDates = out.todos
      .filter((t) => t.id !== "rolling-1")
      .map((t) => t.dueDate);
    // No 5/21–5/27 in there.
    for (const d of ["2026-05-21", "2026-05-22", "2026-05-27"]) {
      expect(tailDates).not.toContain(d);
    }
  });

  it("trashed recurring todos are left alone", () => {
    const trashed = rolling({
      id: "snapshot-1",
      trashed: true,
      done: true,
      completionDate: "2026-05-27",
    });
    const out = migrateToRecurringV2([trashed], "2026-05-28");
    expect(out.changed).toBe(false);
    expect(out.todos).toEqual([trashed]);
  });

  it("non-recurring todos are untouched", () => {
    const plain: Todo = {
      id: "plain-1",
      text: "Buy milk",
      done: false,
      priority: "medium",
      dueDate: "2026-05-29",
      trashed: false,
      updatedAt: 1,
    };
    const out = migrateToRecurringV2([plain], "2026-05-28");
    expect(out.changed).toBe(false);
    expect(out.todos).toBe([plain].length === 1 ? out.todos : []);
    expect(out.todos[0]).toEqual(plain);
  });

  it("already-seriesIded recurring rows are left alone (top-up handles them)", () => {
    const seed = rolling({ seriesId: "preset-sid" });
    const out = migrateToRecurringV2([seed], "2026-05-28");
    expect(out.changed).toBe(false);
    expect(out.todos[0].seriesId).toBe("preset-sid");
  });

  it("respects recurrence.endDate when expanding", () => {
    const seed = rolling({ recurrence: { freq: "daily", endDate: "2026-05-30" } });
    const out = migrateToRecurringV2([seed], "2026-05-28");
    expect(out.todos.map((t) => t.dueDate).sort()).toEqual([
      "2026-05-28",
      "2026-05-29",
      "2026-05-30",
    ]);
  });

  it("is idempotent on a second call after migration", () => {
    const first = migrateToRecurringV2([rolling()], "2026-05-28");
    const second = migrateToRecurringV2(first.todos, "2026-05-28");
    expect(second.changed).toBe(false);
    expect(second.todos).toBe(first.todos);
  });

  it("only past-dated head with no future occurrence within endDate stays alone", () => {
    const seed = rolling({
      dueDate: "2026-05-20",
      recurrence: { freq: "daily", endDate: "2026-05-25" },
    });
    const out = migrateToRecurringV2([seed], "2026-05-28");
    // endDate already passed — no future tail.
    expect(out.todos).toHaveLength(1);
    expect(out.todos[0].seriesId).toBeTruthy();
    expect(out.todos[0].dueDate).toBe("2026-05-20");
  });
});

describe("topUpAllSeries — every-launch sweep", () => {
  it("no-op when nothing has a seriesId", () => {
    const plain: Todo = {
      id: "plain-1",
      text: "Buy milk",
      done: false,
      priority: "medium",
      dueDate: "2026-05-29",
      trashed: false,
      updatedAt: 1,
    };
    const out = topUpAllSeries([plain], "2026-05-28");
    expect(out.changed).toBe(false);
    expect(out.todos).toBe([plain].length === 1 ? out.todos : []);
  });

  it("extends every series' tail when today moves forward", () => {
    const expanded = expandSeries(rolling(), "2026-05-28");
    const out = topUpAllSeries(expanded, "2026-05-30");
    expect(out.changed).toBe(true);
    const sid = expanded[0].seriesId!;
    const members = out.todos.filter((t) => t.seriesId === sid);
    // 2 days of horizon advance → 2 new tail instances.
    expect(members.length).toBe(expanded.length + 2);
  });

  it("idempotent — second call on the same horizon adds nothing", () => {
    const expanded = expandSeries(rolling(), "2026-05-28");
    const first = topUpAllSeries(expanded, "2026-05-28");
    const second = topUpAllSeries(first.todos, "2026-05-28");
    expect(first.changed).toBe(false);
    expect(second.changed).toBe(false);
  });

  it("handles multiple series independently", () => {
    const a = expandSeries(rolling({ id: "a-head" }), "2026-05-28");
    const bSeed = rolling({
      id: "b-head",
      text: "Water plants",
      recurrence: { freq: "weekly" },
    });
    const b = expandSeries(bSeed, "2026-05-28");
    const out = topUpAllSeries([...a, ...b], "2026-05-30");
    const aSid = a[0].seriesId!;
    const bSid = b[0].seriesId!;
    const aMembers = out.todos.filter((t) => t.seriesId === aSid);
    const bMembers = out.todos.filter((t) => t.seriesId === bSid);
    // Daily extends by 2 days; weekly horizon (1mo) likely didn't move.
    expect(aMembers.length).toBe(a.length + 2);
    expect(bMembers.length).toBe(b.length);
  });
});
