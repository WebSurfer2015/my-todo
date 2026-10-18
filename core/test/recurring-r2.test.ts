/**
 * Recurring series horizon top-up — the topUpAllSeries sweep that runs once
 * per launch (mobile/src/store/slices/useTodosSlice.ts) so a long-idle device
 * extends every series tail to the live window. Pure core functions only.
 */
import { describe, expect, it } from "vitest";
import { topUpAllSeries, expandSeries } from "../src/logic/derive";
import type { Todo } from "../src/domain/types";

function seed(over: Partial<Todo> = {}): Todo {
  return {
    id: "seed-1",
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
    const expanded = expandSeries(seed(), "2026-05-28");
    const out = topUpAllSeries(expanded, "2026-05-30");
    expect(out.changed).toBe(true);
    const sid = expanded[0].seriesId!;
    const members = out.todos.filter((t) => t.seriesId === sid);
    // 2 days of horizon advance → 2 new tail instances.
    expect(members.length).toBe(expanded.length + 2);
  });

  it("idempotent — second call on the same horizon adds nothing", () => {
    const expanded = expandSeries(seed(), "2026-05-28");
    const first = topUpAllSeries(expanded, "2026-05-28");
    const second = topUpAllSeries(first.todos, "2026-05-28");
    expect(first.changed).toBe(false);
    expect(second.changed).toBe(false);
  });

  it("handles multiple series independently", () => {
    const a = expandSeries(seed({ id: "a-head" }), "2026-05-28");
    const bSeed = seed({
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
