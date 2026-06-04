/**
 * Tests for the todo store helpers lifted out of mobile's useTodosSlice
 * into core (task #2): todoSetReminders, todoSetRecurrence, selectOverdue,
 * setDueDates, plus addDaysISO. Hosted under web's Vitest (web -> core is
 * the allowed dependency direction, so no arch-gate violation).
 */
import { describe, expect, it } from "vitest";
import {
  newTodo,
  todoSetReminders,
  todoSetRecurrence,
  selectOverdue,
  setDueDates,
} from "../../core/src/logic/derive";
import { addDaysISO } from "../../core/src/logic/utils";
import type { Reminder, Recurrence, Todo } from "../../core/src/domain/types";

const mk = (over: Partial<Todo> = {}): Todo => ({
  ...newTodo({ text: over.text ?? "t", priority: "medium", dueDate: over.dueDate ?? "" }),
  ...over,
});

describe("addDaysISO", () => {
  it("adds days in local time from a fixed base", () => {
    const base = new Date(2026, 0, 30); // 30 Jan 2026 local
    expect(addDaysISO(2, base)).toBe("2026-02-01");
    expect(addDaysISO(0, base)).toBe("2026-01-30");
    expect(addDaysISO(-1, base)).toBe("2026-01-29");
  });
});

describe("todoSetReminders", () => {
  const r = (id: string): Reminder => ({ id, at: "2026-06-03T09:00" });

  it("sets the reminders array and drops the legacy single reminder", () => {
    const todos = [mk({ id: "a", reminder: { at: "2026-01-01T08:00" } as Todo["reminder"] })];
    const out = todoSetReminders(todos, "a", [r("r1")]);
    expect(out[0].reminders).toEqual([r("r1")]);
    expect(out[0].reminder).toBeUndefined();
    expect("reminder" in out[0]).toBe(false);
    expect(out[0].updatedAt).toBeGreaterThan(0);
  });

  it("clears reminders entirely on an empty array (no leftover key)", () => {
    const todos = [mk({ id: "a", reminders: [r("r1")] })];
    const out = todoSetReminders(todos, "a", []);
    expect("reminders" in out[0]).toBe(false);
  });

  it("leaves other todos untouched (same ref)", () => {
    const todos = [mk({ id: "a" }), mk({ id: "b" })];
    const out = todoSetReminders(todos, "a", [r("r1")]);
    expect(out[1]).toBe(todos[1]);
  });
});

describe("todoSetRecurrence", () => {
  const rec: Recurrence = { freq: "weekly" };

  it("sets the recurrence", () => {
    const out = todoSetRecurrence([mk({ id: "a" })], "a", rec);
    expect(out[0].recurrence).toEqual(rec);
  });

  it("removes the recurrence key entirely when cleared", () => {
    const out = todoSetRecurrence([mk({ id: "a", recurrence: rec })], "a", undefined);
    expect("recurrence" in out[0]).toBe(false);
  });
});

describe("selectOverdue", () => {
  const today = "2026-06-03";
  it("returns only active todos due strictly before today", () => {
    const todos = [
      mk({ id: "overdue", dueDate: "2026-06-01" }),
      mk({ id: "today", dueDate: today }),
      mk({ id: "future", dueDate: "2026-06-10" }),
      mk({ id: "nodate", dueDate: "" }),
      mk({ id: "done", dueDate: "2026-05-01", done: true }),
      mk({ id: "trashed", dueDate: "2026-05-01", trashed: true }),
    ];
    expect(selectOverdue(todos, today).map((t) => t.id)).toEqual(["overdue"]);
  });
});

describe("setDueDates", () => {
  it("reschedules mapped ids and leaves others untouched", () => {
    const todos = [mk({ id: "a", dueDate: "2026-01-01" }), mk({ id: "b", dueDate: "2026-01-02" })];
    const out = setDueDates(todos, new Map([["a", "2026-12-31"]]));
    expect(out[0].dueDate).toBe("2026-12-31");
    expect(out[1]).toBe(todos[1]); // untouched → same ref
  });

  it("clears a dueDate via the empty-string sentinel (undo to no-date)", () => {
    const todos = [mk({ id: "a", dueDate: "2026-01-01" })];
    const out = setDueDates(todos, new Map([["a", ""]]));
    expect(out[0].dueDate).toBe("");
  });

  it("is a no-op (same ref) for an empty map", () => {
    const todos = [mk({ id: "a" })];
    expect(setDueDates(todos, new Map())).toBe(todos);
  });
});
