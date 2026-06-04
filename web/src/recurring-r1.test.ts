/**
 * R1 of the recurring-todo redesign — pure helpers in core/src/derive.ts.
 * Verifies the window cutoff math, the seed-to-series expansion, the
 * idempotent top-up, and the series-future lookup.
 *
 * No callers consume these helpers yet; PR R2 (migration) and R3
 * (todoToggle rewire) wire them in.
 */
import { describe, expect, it } from "vitest";
import {
  windowCutoffFor,
  expandSeries,
  topUpSeries,
  seriesFutureFrom,
} from "../../core/src/logic/derive";
import type { Todo, Recurrence } from "../../core/src/domain/types";

function makeSeed(over: Partial<Todo> = {}): Todo {
  return {
    id: "seed-1",
    text: "Water plants",
    done: false,
    priority: "medium",
    dueDate: "2026-05-28",
    trashed: false,
    updatedAt: Date.now(),
    recurrence: { freq: "daily" },
    ...over,
  };
}

describe("windowCutoffFor", () => {
  it("daily → today + 7 days", () => {
    expect(windowCutoffFor("daily", "2026-05-28")).toBe("2026-06-04");
  });
  it("weekly → today + 1 month", () => {
    expect(windowCutoffFor("weekly", "2026-05-28")).toBe("2026-06-28");
  });
  it("monthly → today + 3 months", () => {
    expect(windowCutoffFor("monthly", "2026-05-28")).toBe("2026-08-28");
  });
  it("yearly → today + 3 years", () => {
    expect(windowCutoffFor("yearly", "2026-05-28")).toBe("2029-05-28");
  });
  it("strips time suffix on input", () => {
    expect(windowCutoffFor("daily", "2026-05-28T09:00")).toBe("2026-06-04");
  });
});

describe("expandSeries", () => {
  it("daily seed produces 8 instances (seed + 7 days)", () => {
    const seed = makeSeed();
    const out = expandSeries(seed, "2026-05-28");
    expect(out).toHaveLength(8);
    expect(out[0].id).toBe(seed.id);
    expect(out.map((t) => t.dueDate)).toEqual([
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

  it("every instance shares the same seriesId", () => {
    const seed = makeSeed();
    const out = expandSeries(seed, "2026-05-28");
    const sid = out[0].seriesId;
    expect(sid).toBeTruthy();
    expect(out.every((t) => t.seriesId === sid)).toBe(true);
  });

  it("non-seed instances have fresh UUIDs distinct from the seed", () => {
    const seed = makeSeed();
    const out = expandSeries(seed, "2026-05-28");
    const ids = out.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("preserves time-of-day on each instance", () => {
    const seed = makeSeed({ dueDate: "2026-05-28T15:30" });
    const out = expandSeries(seed, "2026-05-28");
    for (const t of out) {
      expect(t.dueDate.endsWith("T15:30")).toBe(true);
    }
  });

  it("caps at recurrence.endDate when sooner than the window", () => {
    const seed = makeSeed({
      recurrence: { freq: "daily", endDate: "2026-05-30" },
    });
    const out = expandSeries(seed, "2026-05-28");
    expect(out.map((t) => t.dueDate)).toEqual([
      "2026-05-28",
      "2026-05-29",
      "2026-05-30",
    ]);
  });

  it("weekly seed produces ~5 instances within 1-month window", () => {
    const seed = makeSeed({ recurrence: { freq: "weekly" } });
    const out = expandSeries(seed, "2026-05-28");
    expect(out.map((t) => t.dueDate)).toEqual([
      "2026-05-28",
      "2026-06-04",
      "2026-06-11",
      "2026-06-18",
      "2026-06-25",
    ]);
  });

  it("monthly seed produces 4 instances within 3-month window", () => {
    const seed = makeSeed({ recurrence: { freq: "monthly" } });
    const out = expandSeries(seed, "2026-05-28");
    expect(out.map((t) => t.dueDate)).toEqual([
      "2026-05-28",
      "2026-06-28",
      "2026-07-28",
      "2026-08-28",
    ]);
  });

  it("yearly seed produces 4 instances within 3-year window", () => {
    const seed = makeSeed({ recurrence: { freq: "yearly" } });
    const out = expandSeries(seed, "2026-05-28");
    expect(out.map((t) => t.dueDate)).toEqual([
      "2026-05-28",
      "2027-05-28",
      "2028-05-28",
      "2029-05-28",
    ]);
  });

  it("returns just the seed (with seriesId) when seed has no recurrence", () => {
    const seed = makeSeed({ recurrence: undefined });
    const out = expandSeries(seed, "2026-05-28");
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(seed.id);
  });

  it("subtasks are cloned fresh on non-seed instances (different ids, done:false)", () => {
    const seed = makeSeed({
      subtasks: [
        { id: "sub-a", text: "Fill jug", done: true, priority: "medium" },
      ],
    });
    const out = expandSeries(seed, "2026-05-28");
    expect(out[0].subtasks?.[0].id).toBe("sub-a");
    expect(out[1].subtasks?.[0].id).not.toBe("sub-a");
    expect(out[1].subtasks?.[0].done).toBe(false);
  });

  it("preserves an existing seriesId rather than overwriting", () => {
    const seed = makeSeed({ seriesId: "preset-series" });
    const out = expandSeries(seed, "2026-05-28");
    expect(out.every((t) => t.seriesId === "preset-series")).toBe(true);
  });
});

describe("topUpSeries", () => {
  it("idempotent — second call adds nothing when at horizon", () => {
    const seed = makeSeed();
    const first = expandSeries(seed, "2026-05-28");
    const second = topUpSeries(first, first[0].seriesId!, "2026-05-28");
    expect(second.length).toBe(first.length);
  });

  it("extends the tail when today moves forward", () => {
    const seed = makeSeed();
    const first = expandSeries(seed, "2026-05-28");
    // One day passes — horizon is now 2026-06-05.
    const next = topUpSeries(first, first[0].seriesId!, "2026-05-29");
    expect(next.length).toBe(first.length + 1);
    expect(next[next.length - 1].dueDate).toBe("2026-06-05");
  });

  it("does not extend past recurrence.endDate", () => {
    const seed = makeSeed({
      recurrence: { freq: "daily", endDate: "2026-05-30" },
    });
    const first = expandSeries(seed, "2026-05-28");
    const next = topUpSeries(first, first[0].seriesId!, "2027-01-01");
    expect(next.length).toBe(first.length); // capped — no new instances
    expect(next[next.length - 1].dueDate).toBe("2026-05-30");
  });

  it("inherits text/category from the latest non-detached instance", () => {
    const seed = makeSeed();
    const expanded = expandSeries(seed, "2026-05-28");
    const sid = expanded[0].seriesId!;
    // Detach the tail with a custom title — top-up should ignore it for
    // inheritance and fall back to a non-detached row.
    const detached = expanded.map((t, i) =>
      i === expanded.length - 1
        ? { ...t, text: "Water orchids only", detachedFromSeries: true }
        : t,
    );
    const next = topUpSeries(detached, sid, "2026-05-29");
    const added = next.slice(detached.length);
    expect(added).toHaveLength(1);
    expect(added[0].text).toBe("Water plants");
  });

  it("no-op when the seriesId has no members", () => {
    const seed = makeSeed();
    const first = expandSeries(seed, "2026-05-28");
    const next = topUpSeries(first, "no-such-series", "2026-06-30");
    expect(next).toBe(first);
  });

  it("falls back to a detached member's recurrence when no non-detached exists", () => {
    const seed = makeSeed({ detachedFromSeries: true });
    const first = expandSeries(seed, "2026-05-28").map((t) => ({
      ...t,
      detachedFromSeries: true,
    }));
    const next = topUpSeries(first, first[0].seriesId!, "2026-05-30");
    // Should still grow — just inheriting from the detached tail.
    expect(next.length).toBeGreaterThan(first.length);
  });
});

describe("seriesFutureFrom", () => {
  it("returns non-trashed members with dueDate >= anchor", () => {
    const seed = makeSeed();
    const expanded = expandSeries(seed, "2026-05-28");
    const sid = expanded[0].seriesId!;
    const future = seriesFutureFrom(expanded, sid, "2026-05-31");
    expect(future.map((t) => t.dueDate)).toEqual([
      "2026-05-31",
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
    ]);
  });

  it("skips trashed members even when their date matches", () => {
    const seed = makeSeed();
    const expanded = expandSeries(seed, "2026-05-28");
    const sid = expanded[0].seriesId!;
    const trashed = expanded.map((t, i) =>
      i === 3 ? { ...t, trashed: true, trashedAt: 1 } : t,
    );
    const future = seriesFutureFrom(trashed, sid, "2026-05-28");
    expect(future.find((t) => t.dueDate === "2026-05-31")).toBeUndefined();
    expect(future.length).toBe(expanded.length - 1);
  });

  it("returns [] when seriesId is unknown", () => {
    expect(seriesFutureFrom([], "missing", "2026-05-28")).toEqual([]);
  });
});

// Silence noUnusedLocals — Recurrence is documentation-only here.
void (null as unknown as Recurrence);
