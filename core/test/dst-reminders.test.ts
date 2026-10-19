// DST: series / reschedule reminder rebasing must keep the LOCAL clock time
// and move by whole days. Pinned to America/New_York (fall-back 2026-11-01,
// spring-forward 2027-03-14). Setting TZ before any Date use in this file
// works under vitest's forks pool; the first test guards that it took effect.
// CI also runs the whole suite with TZ=America/New_York.
process.env.TZ = "America/New_York";

import { afterEach, describe, expect, it, vi } from "vitest";
import { expandSeries, setDueDates, todoToggle } from "../src/logic/derive";
import type { Todo } from "../src/domain/types";

function row(over: Partial<Todo> = {}): Todo {
  return { id: "s", text: "Night pills", done: false, priority: "medium", dueDate: "2026-10-30", trashed: false, updatedAt: 0, ...over };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("DST-safe reminder rebasing (America/New_York)", () => {
  it("the zone is in effect (fall-back day is 25h long)", () => {
    const ms = new Date("2026-11-02T00:00:00").valueOf() - new Date("2026-11-01T00:00:00").valueOf();
    expect(ms).toBe(25 * 3_600_000);
  });

  it("expandSeries keeps a 23:15 reminder on each row's own day across fall-back", () => {
    // Seeding from the fall-back day itself: its 23:15 is EST, so adding the
    // 25h midnight-to-midnight gap used to land on the day after.
    const seed = row({
      dueDate: "2026-11-01",
      seriesId: "s",
      recurrence: { freq: "daily" },
      reminders: [{ id: "r", at: "2026-11-01T23:15" }],
    });
    const rows = expandSeries(seed, "2026-11-01");
    for (const r of rows.slice(1)) {
      expect(r.reminders?.[0].at).toBe(`${r.dueDate}T23:15`);
    }
    expect(rows.find((r) => r.dueDate === "2026-11-02")?.reminders?.[0].at).toBe("2026-11-02T23:15");
  });

  it("expandSeries keeps an early-morning reminder on its day across spring-forward", () => {
    const seed = row({
      dueDate: "2027-03-14",
      seriesId: "s",
      recurrence: { freq: "daily" },
      reminders: [{ id: "r", at: "2027-03-14T00:30" }],
    });
    const rows = expandSeries(seed, "2027-03-14");
    expect(rows.find((r) => r.dueDate === "2027-03-15")?.reminders?.[0].at).toBe("2027-03-15T00:30");
    for (const r of rows.slice(1)) expect(r.reminders?.[0].at).toBe(`${r.dueDate}T00:30`);
  });

  it("completing the fall-back day's row transfers 23:15 onto the next day, not the day after", () => {
    const todos: Todo[] = [
      row({ id: "a", dueDate: "2026-11-01", seriesId: "s", recurrence: { freq: "daily" }, reminders: [{ id: "r", at: "2026-11-01T23:15" }] }),
      row({ id: "b", dueDate: "2026-11-02", seriesId: "s", recurrence: { freq: "daily" } }),
    ];
    const out = todoToggle(todos, "a", "2026-11-01");
    expect(out.find((t) => t.id === "b")?.reminders?.map((r) => r.at)).toEqual(["2026-11-02T23:15"]);
  });

  it("rescheduling across fall-back moves a 23:30 reminder by exactly the day delta", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00"));
    const todos = [row({ id: "a", dueDate: "2026-11-01", reminders: [{ id: "r", at: "2026-11-01T23:30" }] })];
    const out = setDueDates(todos, new Map([["a", "2026-11-03"]]));
    expect(out[0].reminders?.[0].at).toBe("2026-11-03T23:30");
  });
});
