// "Delete series" moves the whole series to Done, wherever it's opened from
// (device report 2026-10-19: opened from a later occurrence, the earlier
// upcoming ones stayed behind).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { expandSeries, newTodo, todoMoveSeriesToTrash, topUpSeries } from "../src/logic/derive";
import type { Todo } from "../src/domain/types";

const daily = (): Todo[] => {
  const base = newTodo({ text: "Walk", priority: "none", dueDate: "2026-10-19", recurrence: { freq: "daily" } } as never);
  return expandSeries({ ...base, seriesId: base.seriesId ?? "s", recurrence: { freq: "daily" } } as Todo, "2026-10-19");
};

describe("todoMoveSeriesToTrash", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 19, 12));
  });
  afterEach(() => vi.useRealTimers());

  it("opened from a LATER occurrence, every open occurrence goes — and the series stops", () => {
    const ts = daily();
    const later = ts[4];
    const { next, affected } = todoMoveSeriesToTrash(ts, later.id);
    expect(affected).toBe(ts.length);
    expect(next.filter((t) => !t.trashed)).toEqual([]);
    expect(topUpSeries(next, ts[0].seriesId!, "2026-10-19").filter((t) => !t.trashed)).toEqual([]);
    expect(topUpSeries(next, ts[0].seriesId!, "2026-11-30").filter((t) => !t.trashed)).toEqual([]);
  });

  it("finished occurrences stay as history", () => {
    const ts = daily().map((t, i) => (i === 0 ? { ...t, done: true, trashed: true, completionDate: "2026-10-19" } : t));
    const { next, affected } = todoMoveSeriesToTrash(ts, ts[3].id);
    expect(affected).toBe(ts.length - 1);
    expect(next[0]).toMatchObject({ id: ts[0].id, done: true, trashed: true, completionDate: "2026-10-19" });
  });

  it("a one-off falls back to a single move", () => {
    const one = newTodo({ text: "Call", priority: "none", dueDate: "" } as never);
    const { next, affected } = todoMoveSeriesToTrash([one], one.id);
    expect(affected).toBe(1);
    expect(next[0].trashed).toBe(true);
  });
});
