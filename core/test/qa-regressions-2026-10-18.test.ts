// Regressions found by the 2026-10-18 full QA pass (series lifecycle,
// "Repeat ends", reminder transfer, restore).
import { describe, expect, it } from "vitest";
import {
  expandSeries,
  migrateTodos,
  todoMoveToTrashFutureSeries,
  todoPermanentlyDeleteSeriesFuture,
  todoRestoreFromTrash,
  todoSkip,
  todoToggle,
  topUpSeries,
  subtaskAdd,
} from "../src/logic/derive";
import type { Todo } from "../src/domain/types";

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
const open = (ts: Todo[]) => ts.filter((t) => !t.trashed && !t.done);
const LATER = "2026-06-20";

describe("ended series never regrow on top-up", () => {
  it("Delete series (this + future) stays deleted", () => {
    let ts = expandSeries(seed(), "2026-05-28");
    ts = todoToggle(ts, ts[0].id, "2026-05-28"); // one done in the past
    const next = open(ts)[0];
    ts = todoPermanentlyDeleteSeriesFuture(ts, next.id);
    const sid = ts[0].seriesId!;
    expect(open(topUpSeries(ts, sid, LATER))).toHaveLength(0);
  });

  it("Mark all done stays done", () => {
    let ts = expandSeries(seed(), "2026-05-28");
    ts = todoMoveToTrashFutureSeries(ts, ts[0].id).next;
    expect(open(topUpSeries(ts, ts[0].seriesId!, LATER))).toHaveLength(0);
  });

  it("an OLDER open occurrence can't revive a series ended later (all four ends)", () => {
    const base = () => expandSeries(seed(), "2026-05-28"); // [0] = 5/28 stays open
    const later = (ts: Todo[]) => ts[2];
    const ends: Array<(ts: Todo[]) => Todo[]> = [
      (ts) => todoPermanentlyDeleteSeriesFuture(ts, later(ts).id),
      (ts) => todoMoveToTrashFutureSeries(ts, later(ts).id).next,
    ];
    for (const end of ends) {
      const ts = end(base());
      const before = open(ts).length;
      expect(open(topUpSeries(ts, ts[0].seriesId!, LATER)).length).toBe(before);
      // Completing the old open one doesn't append past the end either.
      const done = todoToggle(ts, ts[0].id, "2026-05-28");
      expect(open(done).length).toBe(before - 1);
    }
  });

  it("a live series still tops up", () => {
    const ts = expandSeries(seed(), "2026-05-28");
    expect(topUpSeries(ts, ts[0].seriesId!, LATER).length).toBeGreaterThan(ts.length);
  });
});

describe("Repeat ends survives a reload", () => {
  it("migrateTodos keeps recurrence.endDate", () => {
    const [t] = migrateTodos([seed({ seriesId: "s1", recurrence: { freq: "daily", endDate: "2026-06-30" } })]);
    expect(t.recurrence).toEqual({ freq: "daily", endDate: "2026-06-30" });
  });
});

describe("completing a series instance doesn't duplicate reminders", () => {
  it("next instance keeps exactly one reminder per time", () => {
    let ts = expandSeries(seed({ dueDate: "2026-05-28T09:00", reminders: [{ id: "r1", at: "2026-05-28T08:00" }] }), "2026-05-28");
    ts = todoToggle(ts, ts[0].id, "2026-05-28");
    const live = open(ts);
    // Not vacuous: the series still has open rows, each carrying reminders.
    expect(live.length).toBeGreaterThan(0);
    for (const t of live) {
      const ats = (t.reminders ?? []).map((r) => r.at);
      expect(ats.length).toBeGreaterThan(0);
      expect(new Set(ats).size).toBe(ats.length);
    }
    // The next open instance carries exactly its own 08:00 reminder — the
    // transferred one merged with (not stacked on) the rebased one.
    const next = [...live].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    expect(next.dueDate).toBe("2026-05-29T09:00");
    expect(next.reminders!.map((r) => r.at)).toEqual(["2026-05-29T08:00"]);
  });
});

describe("restore from the bin", () => {
  it("clears a Not Do mark", () => {
    let ts = [seed({ recurrence: undefined, id: "a" })];
    ts = todoSkip(ts, "a", "2026-05-28");
    ts = todoRestoreFromTrash(ts, "a");
    expect(ts[0].status).toBeUndefined();
    expect(ts[0].trashed).toBe(false);
  });

  it("reopens steps so it isn't re-completed on reload", () => {
    let ts = [seed({ recurrence: undefined, id: "a" })];
    ts = subtaskAdd(ts, "a", "step");
    ts = todoToggle(ts, "a", "2026-05-28");
    ts = todoRestoreFromTrash(ts, "a");
    const [reloaded] = migrateTodos(ts);
    expect(reloaded.done).toBe(false);
    expect(reloaded.subtasks!.every((s) => !s.done)).toBe(true);
  });
});
