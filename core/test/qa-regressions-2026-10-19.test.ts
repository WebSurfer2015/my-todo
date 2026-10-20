// Regressions found by the 2026-10-19 (round-2) QA pass: series rule
// changes, lapsed-series top-up, multi-device top-up duplicates, step-driven
// parent dates, category delete, defer stacking — plus the test gaps the
// pass flagged (mutation-proven).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  categoryDelete,
  expandSeries,
  seriesInstanceId,
  subtaskAdd,
  subtaskToggle,
  subtaskUpdateDueDate,
  todoApplyRecurrenceChange,
  todoDeferTo,
  todoRestoreFromTrash,
  todoSetRecurrence,
  todoToggle,
  topUpSeries,
} from "../src/logic/derive";
import { mergeTodos } from "../src/store/mergeTodos";
import { toggleOutcome } from "../src/store";
import { effectiveTier, tierAtLeast, FREE_ENTITLEMENT } from "../src/domain/entitlements";
import { buildExportPayload, serializeExport, isExportEmpty } from "../src/data/exporter";
import { migrateProfile } from "../src/data/profile";
import type { Todo } from "../src/domain/types";
import type { CategoryDef } from "../src/data/categories";

function seed(over: Partial<Todo> = {}): Todo {
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
const open = (ts: Todo[]) => ts.filter((t) => !t.trashed && !t.done);
const openDays = (ts: Todo[], sid: string) =>
  open(ts)
    .filter((t) => t.seriesId === sid)
    .map((t) => t.dueDate.slice(0, 10))
    .sort();

describe("1 — changing a series' rule leaves no gap", () => {
  const weeklyThenDaily = () => {
    const weekly = expandSeries(seed({ recurrence: { freq: "weekly" } }), "2026-10-19");
    expect(weekly.map((t) => t.dueDate)).toEqual([
      "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16",
    ]);
    return todoApplyRecurrenceChange(weekly, "head", { freq: "daily" }, "2026-10-19").next;
  };

  it("completing the target appends the next DAILY day, not one past the old weekly tail", () => {
    const ts = weeklyThenDaily();
    const sid = ts[0].seriesId!;
    expect(openDays(ts, sid)).toEqual([
      "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22",
      "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26",
    ]);
    const done = todoToggle(ts, "head", "2026-10-19");
    expect(openDays(done, sid).at(-1)).toBe("2026-10-27");
  });

  it("top-up keeps extending the daily tail", () => {
    const ts = weeklyThenDaily();
    const sid = ts[0].seriesId!;
    const days = openDays(topUpSeries(ts, sid, "2026-10-22"), sid);
    expect(days.slice(-3)).toEqual(["2026-10-27", "2026-10-28", "2026-10-29"]);
  });

  it("a binned future sibling leaves the series too", () => {
    const weekly = expandSeries(seed({ recurrence: { freq: "weekly" } }), "2026-10-19");
    const binned = weekly.map((t) =>
      t.dueDate === "2026-11-16" ? { ...t, trashed: true, trashedAt: 1 } : t,
    );
    const ts = todoApplyRecurrenceChange(binned, "head", { freq: "daily" }, "2026-10-19").next;
    const old = ts.find((t) => t.trashed && t.dueDate === "2026-11-16")!;
    expect(old.seriesId).toBeUndefined();
    expect(old.recurrence).toBeUndefined();
    expect(openDays(todoToggle(ts, "head", "2026-10-19"), ts[0].seriesId!).at(-1)).toBe("2026-10-27");
  });
});

describe("2 — step dates move the parent's DAY, keep its time + reminders", () => {
  // Only reminders still ahead move — pin the clock so the 2030 fixtures
  // stay "ahead" forever.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 19, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  const parent = () =>
    seed({
      id: "p",
      recurrence: undefined,
      dueDate: "2030-01-03T09:00",
      reminders: [{ id: "r", at: "2030-01-03T08:30" }],
    });

  it("subtaskAdd with a later step date", () => {
    const [p] = subtaskAdd([parent()], "p", "step", "medium", "2030-01-05");
    expect(p.dueDate).toBe("2030-01-05T09:00");
    expect(p.reminders?.map((r) => r.at)).toEqual(["2030-01-05T08:30"]);
  });

  it("subtaskUpdateDueDate moves it (both ways) and is a no-op on the same day", () => {
    let ts = subtaskAdd([parent()], "p", "step"); // defaults to the parent's date
    expect(ts[0].dueDate).toBe("2030-01-03T09:00");
    const subId = ts[0].subtasks![0].id;
    ts = subtaskUpdateDueDate(ts, "p", subId, "2030-01-07");
    expect(ts[0].dueDate).toBe("2030-01-07T09:00");
    expect(ts[0].reminders?.map((r) => r.at)).toEqual(["2030-01-07T08:30"]);
    ts = subtaskUpdateDueDate(ts, "p", subId, "2030-01-04");
    expect(ts[0].dueDate).toBe("2030-01-04T09:00");
    expect(ts[0].reminders?.map((r) => r.at)).toEqual(["2030-01-04T08:30"]);
    ts = subtaskUpdateDueDate(ts, "p", subId, "2030-01-04T15:00");
    expect(ts[0].dueDate).toBe("2030-01-04T09:00");
  });
});

describe("3 — a lapsed series resumes at today, no back-fill flood", () => {
  it("top-up after a break adds nothing before today", () => {
    const ts = [seed({ id: "old", seriesId: "s", dueDate: "2026-09-08" })];
    const after = topUpSeries(ts, "s", "2026-10-19");
    const overdue = open(after).filter((t) => t.dueDate < "2026-10-19");
    expect(overdue.map((t) => t.id)).toEqual(["old"]); // just the one carried over
    expect(openDays(after, "s")).toEqual([
      "2026-09-08", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22",
      "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26",
    ]);
  });

  it("weekly: resumes on the first rule day on/after today", () => {
    const ts = [seed({ id: "old", seriesId: "s", dueDate: "2026-08-03", recurrence: { freq: "weekly" } })];
    expect(openDays(topUpSeries(ts, "s", "2026-10-21"), "s").slice(0, 2)).toEqual(["2026-08-03", "2026-10-26"]);
  });

  it("expandSeries from a past seed generates no past occurrences", () => {
    const out = expandSeries(seed({ dueDate: "2026-10-10" }), "2026-10-19");
    expect(out[0].dueDate).toBe("2026-10-10");
    expect(out.slice(1).every((t) => t.dueDate >= "2026-10-19")).toBe(true);
    expect(out[1].dueDate).toBe("2026-10-19");
  });

  it("the updateRecurrence path (set recurrence on a past one-off, then top up)", () => {
    let ts = [seed({ id: "a", recurrence: undefined, dueDate: "2026-09-08" })];
    ts = todoSetRecurrence(ts, "a", { freq: "daily" });
    const after = topUpSeries(ts, ts[0].seriesId!, "2026-10-19");
    expect(open(after).filter((t) => t.dueDate < "2026-10-19")).toHaveLength(1);
  });
});

describe("4 — generated occurrence ids are deterministic", () => {
  it("expandSeries / topUpSeries / append mint `${seriesId}_${day}`", () => {
    const ts = expandSeries(seed({ seriesId: "s1" }), "2026-10-19");
    expect(ts[0].id).toBe("head");
    expect(ts[1].id).toBe("s1_2026-10-20");
    const topped = topUpSeries(ts, "s1", "2026-10-21");
    expect(topped.at(-1)!.id).toBe("s1_2026-10-28");
    const appended = todoToggle(ts, "head", "2026-10-19");
    expect(appended.at(-1)!.id).toBe("s1_2026-10-27");
  });

  it("time suffix doesn't leak into the id; taken / over-long ids fall back to a UUID", () => {
    expect(seriesInstanceId("s1", "2026-10-20T09:00")).toBe("s1_2026-10-20");
    expect(seriesInstanceId("s1", "2026-10-20", new Set(["s1_2026-10-20"]))).not.toBe("s1_2026-10-20");
    const long = "x".repeat(60);
    expect(seriesInstanceId(long, "2026-10-20").startsWith(long)).toBe(false);
    expect(seriesInstanceId(long, "2026-10-20").length).toBeLessThanOrEqual(64);
  });

  it("two devices topping up the same days merge without duplicates", () => {
    const base = expandSeries(seed({ seriesId: "s1" }), "2026-10-19");
    const a = topUpSeries(base, "s1", "2026-10-22");
    const b = topUpSeries(base, "s1", "2026-10-22");
    expect(a.length).toBeGreaterThan(base.length);
    const merged = mergeTodos(base, a, b);
    const days = openDays(merged, "s1");
    expect(new Set(days).size).toBe(days.length);
    expect(merged).toHaveLength(a.length);
  });

  it("mergeTodos dedupes open rows by (series, day), keeping the remote / base copy", () => {
    const row = (id: string, day: string, over: Partial<Todo> = {}): Todo =>
      seed({ id, seriesId: "s", dueDate: day, ...over });
    // Generated copies (id names the row's own day, not in base): a clash
    // variant on a day the base already has, and two copies of one new day.
    const base = [row("shared", "2026-10-20")];
    const local = [...base, row("s_2026-10-25", "2026-10-25"), row("s_2026-10-20", "2026-10-20T09:00")];
    const remote = [...base, row("s_2026-10-25_2", "2026-10-25")];
    const merged = mergeTodos(base, local, remote);
    expect(merged.map((t) => t.id).sort()).toEqual(["s_2026-10-25_2", "shared"]);
    // Closed (done / binned) rows and different days are never collapsed.
    const closed = [row("d1", "2026-10-20", { done: true, trashed: true }), row("d2", "2026-10-20", { trashed: true })];
    const merged2 = mergeTodos([], [...closed, row("o1", "2026-10-21")], [row("o2", "2026-10-22")]);
    expect(merged2.map((t) => t.id)).toEqual(["d1", "d2", "o1", "o2"]);
  });
});

describe("5 — a rule change anchors on the target's own day", () => {
  it("daily from Oct 31 changed to monthly on Nov 30 → Dec 30, Jan 30, … Mar 30", () => {
    let ts = expandSeries(seed({ dueDate: "2026-10-31", seriesId: "s" }), "2026-10-31");
    ts = topUpSeries(ts, "s", "2026-11-30");
    const nov30 = ts.find((t) => t.dueDate === "2026-11-30")!;
    ts = todoApplyRecurrenceChange(ts, nov30.id, { freq: "monthly" }, "2026-11-30").next;
    const monthly = open(ts)
      .filter((t) => t.recurrence?.freq === "monthly")
      .map((t) => t.dueDate)
      .sort();
    expect(monthly.slice(0, 3)).toEqual(["2026-11-30", "2026-12-30", "2027-01-30"]);
    // Later appends keep the new anchor too (not the old daily 31st).
    const done = todoToggle(ts, nov30.id, "2026-11-30");
    const last = open(done).map((t) => t.dueDate).sort().at(-1)!;
    expect(last.slice(8, 10)).toBe("30");
  });
});

describe("6 — deleting a category leaves its series running, uncategorized", () => {
  const cats: CategoryDef[] = [
    { id: "home", label: "Home", color: "#111", icon: "home" },
    { id: "gym", label: "Gym", color: "#222", icon: "dumbbell" },
  ];

  // Was: "restoring one binned occurrence doesn't re-grow the series" —
  // a category delete used to bin the series and end it. It now only clears
  // the category, so nothing is binned and the series keeps its recurrence.
  it("bins nothing and ends no series — every occurrence just loses the category", () => {
    const ts = expandSeries(seed({ seriesId: "s", category: "gym" }), "2026-10-19");
    const del = categoryDelete(ts, cats, "gym").todos;
    expect(del.some((t) => t.trashed)).toBe(false);
    expect(del.some((t) => t.recurrence?.endDate)).toBe(false);
    expect(del.every((t) => t.category === undefined)).toBe(true);
    // The series still tops up normally afterward.
    expect(topUpSeries(del, "s", "2026-10-30").length).toBeGreaterThanOrEqual(del.length);
  });

  it("a series with an open member elsewhere keeps going", () => {
    const ts = expandSeries(seed({ seriesId: "s", category: "gym" }), "2026-10-19").map((t) =>
      t.dueDate === "2026-10-26" ? { ...t, category: "home" } : t,
    );
    const del = categoryDelete(ts, cats, "gym").todos;
    expect(del.some((t) => t.recurrence?.endDate)).toBe(false);
  });
});

describe("7 — defer never stacks two occurrences of a series on one day", () => {
  it("an occurrence deferred onto a day the series already has is skipped", () => {
    const ts = expandSeries(seed({ seriesId: "s", dueDate: "2026-10-15" }), "2026-10-15");
    const ids = ["head", "s_2026-10-16", "s_2026-10-17", "s_2026-10-18"];
    const r = todoDeferTo(ts, ids, "2026-10-20", "2026-10-19");
    expect(r.deferred).toBe(0);
    expect(r.skipped).toBe(4);
    for (const id of ids) {
      const t = r.next.find((x) => x.id === id)!;
      expect(t.status).toBe("notDo");
      expect(t.trashed).toBe(true);
    }
    const days = openDays(r.next, "s");
    expect(new Set(days).size).toBe(days.length);
  });

  it("two chosen occurrences landing on one free day: only the first moves", () => {
    const ts = [
      seed({ id: "a", seriesId: "s", dueDate: "2026-10-18" }),
      seed({ id: "b", seriesId: "s", dueDate: "2026-10-21" }),
    ];
    const r = todoDeferTo(ts, ["a", "b"], "2026-10-23", "2026-10-19");
    expect(r).toMatchObject({ deferred: 1, skipped: 1 });
    expect(r.next.find((t) => t.id === "a")!.dueDate).toBe("2026-10-23");
    expect(r.next.find((t) => t.id === "b")!.status).toBe("notDo");
  });

  it("a free target day still defers normally", () => {
    const ts = expandSeries(seed({ seriesId: "s", dueDate: "2026-10-15" }), "2026-10-15");
    const r = todoDeferTo(ts, ["s_2026-10-18"], "2026-10-30", "2026-10-19");
    expect(r).toMatchObject({ deferred: 1, skipped: 0 });
  });
});

describe("8a — finishing the last step of a one-off drops its reminders", () => {
  it("subtaskToggle → reminders undefined", () => {
    let ts = [seed({ id: "p", recurrence: undefined, dueDate: "2030-01-03", reminders: [{ id: "r", at: "2030-01-03T08:00" }] })];
    ts = subtaskAdd(ts, "p", "only step");
    expect(ts[0].reminders).toHaveLength(1);
    ts = subtaskToggle(ts, "p", ts[0].subtasks![0].id, "2026-10-19");
    expect(ts[0].done).toBe(true);
    expect(ts[0].reminders).toBeUndefined();
  });
});

describe("8d — effectiveTier / tierAtLeast", () => {
  const NOW = "2026-10-19T12:00:00.000Z";
  it.each([
    ["free stays free", FREE_ENTITLEMENT, "free"],
    ["premium with null validUntil → free", { tier: "premium", validUntil: null }, "free"],
    ["premium lapsed → free", { tier: "premium", validUntil: "2026-10-19T11:59:59.000Z" }, "free"],
    ["premium valid → premium", { tier: "premium", validUntil: "2026-10-19T12:00:01.000Z" }, "premium"],
    ["premium garbage date → free", { tier: "premium", validUntil: "not a date" }, "free"],
    ["premium expiring exactly now → free", { tier: "premium", validUntil: NOW }, "free"],
  ] as const)("%s", (_name, ent, want) => {
    expect(effectiveTier(ent, NOW)).toBe(want);
  });
  it("tierAtLeast orders free < premium", () => {
    expect(tierAtLeast("free", "free")).toBe(true);
    expect(tierAtLeast("premium", "free")).toBe(true);
    expect(tierAtLeast("premium", "premium")).toBe(true);
    expect(tierAtLeast("free", "premium")).toBe(false);
  });
});

describe("8e — export payload round-trips every entity", () => {
  it("todoReferences, groceries, groceryGroups survive serialize → parse", () => {
    const input = {
      todos: [seed({ id: "t1", recurrence: undefined })],
      categories: [{ id: "home", label: "Home", color: "#111", icon: "home" }],
      todoReferences: [{ textLower: "water plants", text: "Water plants", priority: "medium" as const, lastSeenAt: 5 }],
      groceries: [{ id: "g1", text: "Milk", groupId: "dairy", stores: ["Costco"], checked: false, addedAt: 3 }],
      groceryGroups: [{ id: "dairy", label: "Dairy" }],
      appVersion: "2.0.0",
      now: 1700000000000,
    };
    const payload = buildExportPayload(input);
    const back = JSON.parse(serializeExport(payload));
    expect(back).toEqual(payload);
    expect(back.data.todoReferences).toEqual(input.todoReferences);
    expect(back.data.groceries).toEqual(input.groceries);
    expect(back.data.groceryGroups).toEqual(input.groceryGroups);
    expect(back.app.appVersion).toBe("2.0.0");
    for (const only of ["todoReferences", "groceries", "groceryGroups"] as const) {
      expect(isExportEmpty(buildExportPayload({ [only]: input[only], now: 0 }))).toBe(false);
    }
  });
});

describe("8f — status overrides migration", () => {
  it("skips duplicate ids (first wins), caps labels at 40 chars, drops the retired hidden flag", () => {
    const p = migrateProfile({
      name: "Me",
      avatar: { kind: "preset", key: "mochi" },
      statuses: [
        { id: "open", label: "x".repeat(100) },
        { id: "open", label: "second", hidden: true },
        { id: "done", hidden: true },
      ],
    });
    expect(p.statuses).toEqual([
      { id: "open", label: "x".repeat(40) },
      { id: "done", label: undefined },
    ]);
  });
});

describe("8h — toggleOutcome on a series instance", () => {
  it("the reference row is the done snapshot, not the appended tail", () => {
    const [before] = expandSeries(seed({ seriesId: "s" }), "2026-10-19");
    const { after, referenceRow } = toggleOutcome(before);
    expect(after.id).toBe("head");
    expect(after.done).toBe(true);
    expect(referenceRow).toBe(after);
    expect(referenceRow!.done).toBe(true);
    expect(referenceRow!.trashed).toBe(true);
  });
});
