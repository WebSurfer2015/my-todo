/**
 * R3 of the recurring-todo redesign — todoToggle rewire for series
 * instances. Verifies the new "mark done in place + top-up tail"
 * path, the un-do behavior, and the preserved legacy rolling
 * fallback for orphaned recurrences without a seriesId.
 */
import { describe, expect, it } from "vitest";
import {
  todoToggle,
  expandSeries,
} from "../../core/src/logic/derive";
import type { Todo } from "../../core/src/domain/types";

function seed(over: Partial<Todo> = {}): Todo {
  return {
    id: "head-1",
    text: "Water plants",
    done: false,
    priority: "medium",
    dueDate: "2026-05-28",
    trashed: false,
    updatedAt: 1,
    recurrence: { freq: "daily" },
    ...over,
  };
}

describe("todoToggle — series instance completion (R3)", () => {
  it("marks done in place — no rolled-forward sibling, no separate snapshot", () => {
    const expanded = expandSeries(seed(), "2026-05-28");
    const out = todoToggle(expanded, expanded[0].id, "2026-05-28");
    const head = out.find((t) => t.id === expanded[0].id)!;
    expect(head.done).toBe(true);
    expect(head.trashed).toBe(true);
    expect(head.completionDate).toBe("2026-05-28");
    expect(head.dueDate).toBe("2026-05-28"); // unchanged
  });

  it("appends exactly one new tail instance", () => {
    const expanded = expandSeries(seed(), "2026-05-28");
    const out = todoToggle(expanded, expanded[0].id, "2026-05-28");
    expect(out.length).toBe(expanded.length + 1);
    const sid = expanded[0].seriesId!;
    const newTail = out.find(
      (t) => t.seriesId === sid && !expanded.some((e) => e.id === t.id),
    )!;
    expect(newTail).toBeDefined();
    expect(newTail.dueDate).toBe("2026-06-05"); // one daily step past the prev horizon
    expect(newTail.done).toBe(false);
    expect(newTail.trashed).toBe(false);
  });

  it("leaves other open series members untouched", () => {
    const expanded = expandSeries(seed(), "2026-05-28");
    const out = todoToggle(expanded, expanded[0].id, "2026-05-28");
    for (let i = 1; i < expanded.length; i++) {
      const orig = expanded[i];
      const after = out.find((t) => t.id === orig.id)!;
      expect(after).toEqual(orig);
    }
  });

  it("clears reminder on completion", () => {
    const withReminder = seed({
      reminder: { at: "2026-05-28T09:00" },
    });
    const expanded = expandSeries(withReminder, "2026-05-28");
    const out = todoToggle(expanded, expanded[0].id, "2026-05-28");
    const head = out.find((t) => t.id === expanded[0].id)!;
    expect(head.reminder).toBeUndefined();
  });

  it("does NOT append a new tail when recurrence.endDate caps the series", () => {
    const bounded = seed({
      recurrence: { freq: "daily", endDate: "2026-05-30" },
    });
    const expanded = expandSeries(bounded, "2026-05-28");
    // Complete the LAST materialized instance — top-up would cross endDate.
    const last = expanded[expanded.length - 1];
    const out = todoToggle(expanded, last.id, "2026-05-30");
    expect(out.length).toBe(expanded.length); // no new tail
    const after = out.find((t) => t.id === last.id)!;
    expect(after.done).toBe(true);
  });

  it("parent toggle is a no-op when subs exist", () => {
    const withSubs = seed({
      subtasks: [
        { id: "sub-a", text: "Fill jug", done: false, priority: "medium" },
      ],
    });
    const expanded = expandSeries(withSubs, "2026-05-28");
    const before = expanded[0];
    const out = todoToggle(expanded, before.id, "2026-05-28");
    expect(out).toBe(expanded); // same reference — no mutation
    expect(out.find((t) => t.id === before.id)).toBe(before);
  });
});

describe("todoToggle — series un-do (R3)", () => {
  it("clears done flags but does NOT generate any new instance", () => {
    const expanded = expandSeries(seed(), "2026-05-28");
    // First complete one.
    const completed = todoToggle(expanded, expanded[0].id, "2026-05-28");
    expect(completed.length).toBe(expanded.length + 1); // one tail added
    // Now un-do that same instance.
    const reopened = todoToggle(completed, expanded[0].id, "2026-05-28");
    expect(reopened.length).toBe(completed.length); // no change in count
    const head = reopened.find((t) => t.id === expanded[0].id)!;
    expect(head.done).toBe(false);
    expect(head.trashed).toBe(false);
    expect(head.completionDate).toBeUndefined();
    expect(head.trashedAt).toBeUndefined();
  });
});

describe("todoToggle — legacy rolling fallback (no seriesId)", () => {
  it("a recurring todo without seriesId still hits the snapshot+roll path", () => {
    const legacy: Todo = {
      id: "legacy-1",
      text: "Take medicine",
      done: false,
      priority: "medium",
      dueDate: "2026-05-10",
      trashed: false,
      updatedAt: 1,
      recurrence: { freq: "weekly" },
      // intentionally no seriesId
    };
    const out = todoToggle([legacy], legacy.id);
    expect(out).toHaveLength(2);
    const rolled = out.find((t) => t.id === legacy.id)!;
    const snapshot = out.find((t) => t.id !== legacy.id)!;
    expect(rolled.done).toBe(false);
    expect(rolled.dueDate).toBe("2026-05-17");
    expect(snapshot.done).toBe(true);
    expect(snapshot.trashed).toBe(true);
  });
});
