/**
 * Tests for the @my-todo/core package, hosted under web's Vitest setup so
 * we don't need a second test runner. All imports resolve via the same
 * relative path the apps use.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  migrateTodos,
  newTodo,
  todoMoveToTrash,
  todoToggle,
  todoSet,
  subtaskAdd,
  subtaskToggle,
  subtaskUpdateText,
  subtaskUpdatePriority,
  subtaskUpdateDueDate,
  subtaskRemove,
  TRASH_RETENTION_MS,
  MAX_TODO_TEXT_LEN,
  MAX_TODOS_PER_USER,
  MAX_SUBTASKS_PER_TODO,
} from "../../core/src/derive";
import { buildGroups } from "../../core/src/groups";
import {
  migrateCategories,
  migrateCategory,
  MAX_CATEGORY_LABEL_LEN,
  MAX_CATEGORIES_PER_USER,
} from "../../core/src/categories";
import {
  migrateProfile,
  SEED_PROFILE,
  MAX_PROFILE_NAME_LEN,
  MAX_AVATAR_URI_LEN,
} from "../../core/src/profile";

// ---- migrateTodos --------------------------------------------------------

describe("migrateTodos", () => {
  it("returns [] for non-array input", () => {
    expect(migrateTodos(null)).toEqual([]);
    expect(migrateTodos(undefined)).toEqual([]);
    expect(migrateTodos({})).toEqual([]);
    expect(migrateTodos("nope")).toEqual([]);
    expect(migrateTodos(42)).toEqual([]);
  });

  it("stringifies legacy numeric ids", () => {
    const out = migrateTodos([
      { id: 1714936800123, text: "old", priority: "low", dueDate: "" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("1714936800123");
    expect(typeof out[0].id).toBe("string");
  });

  it("preserves string UUIDs as-is", () => {
    const out = migrateTodos([
      { id: "abc-123", text: "x", priority: "low", dueDate: "" },
    ]);
    expect(out[0].id).toBe("abc-123");
  });

  it("generates a fresh UUID when id is missing or invalid", () => {
    const out = migrateTodos([
      { text: "no id", priority: "low", dueDate: "" },
      { id: null, text: "null id", priority: "low", dueDate: "" },
      { id: NaN, text: "NaN id", priority: "low", dueDate: "" },
    ]);
    expect(out).toHaveLength(3);
    out.forEach((td) => {
      expect(typeof td.id).toBe("string");
      expect(td.id.length).toBeGreaterThan(0);
    });
    // All three ids must be distinct.
    expect(new Set(out.map((td) => td.id)).size).toBe(3);
  });

  it("rejects non-object entries", () => {
    const out = migrateTodos([null, undefined, 42, "string", []]);
    expect(out).toEqual([]);
  });

  it("dedupes by id, keeping the higher updatedAt", () => {
    const out = migrateTodos([
      { id: "a", text: "old", priority: "low", dueDate: "", updatedAt: 100 },
      { id: "a", text: "new", priority: "low", dueDate: "", updatedAt: 200 },
      { id: "a", text: "older", priority: "low", dueDate: "", updatedAt: 50 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("new");
  });

  it("clamps text to MAX_TODO_TEXT_LEN", () => {
    const long = "x".repeat(MAX_TODO_TEXT_LEN + 100);
    const out = migrateTodos([
      { id: "a", text: long, priority: "low", dueDate: "" },
    ]);
    expect(out[0].text).toHaveLength(MAX_TODO_TEXT_LEN);
  });

  it("caps array at MAX_TODOS_PER_USER", () => {
    const huge = Array.from({ length: MAX_TODOS_PER_USER + 50 }, (_, i) => ({
      id: `t-${i}`,
      text: `t${i}`,
      priority: "low" as const,
      dueDate: "",
    }));
    const out = migrateTodos(huge);
    expect(out.length).toBeLessThanOrEqual(MAX_TODOS_PER_USER);
  });

  it("falls back to medium priority for invalid priorities", () => {
    const out = migrateTodos([
      { id: "a", text: "x", priority: "URGENT", dueDate: "" },
      { id: "b", text: "x", priority: undefined, dueDate: "" },
      { id: "c", text: "x", priority: 42, dueDate: "" },
    ]);
    out.forEach((td) => expect(td.priority).toBe("medium"));
  });

  it("filters out trashed todos older than TRASH_RETENTION_MS", () => {
    const now = Date.now();
    const old = now - TRASH_RETENTION_MS - 1000;
    const fresh = now - 1000;
    const out = migrateTodos([
      { id: "old", text: "x", priority: "low", dueDate: "", trashed: true, trashedAt: old },
      { id: "fresh", text: "x", priority: "low", dueDate: "", trashed: true, trashedAt: fresh },
      { id: "active", text: "x", priority: "low", dueDate: "", trashed: false },
    ]);
    expect(out.map((t) => t.id).sort()).toEqual(["active", "fresh"]);
  });

  it("validates category against the loaded category list when provided", () => {
    const cats = [{ id: "home", color: "#34C759", icon: "home" }];
    const out = migrateTodos(
      [
        { id: "a", text: "x", priority: "low", dueDate: "", category: "home" },
        { id: "b", text: "x", priority: "low", dueDate: "", category: "missing" },
      ],
      cats,
    );
    expect(out.find((t) => t.id === "a")?.category).toBe("home");
    expect(out.find((t) => t.id === "b")?.category).toBeUndefined();
  });
});

// ---- newTodo + mutations -------------------------------------------------

describe("newTodo + mutations", () => {
  it("newTodo returns a string id and sets updatedAt", () => {
    const t = newTodo({ text: "hi", priority: "high", dueDate: "2026-12-31" });
    expect(typeof t.id).toBe("string");
    expect(t.id.length).toBeGreaterThan(0);
    expect(t.done).toBe(false);
    expect(t.trashed).toBe(false);
    expect(t.updatedAt).toBeTypeOf("number");
  });

  it("newTodo trims text to MAX_TODO_TEXT_LEN", () => {
    const t = newTodo({
      text: "x".repeat(MAX_TODO_TEXT_LEN + 50),
      priority: "low",
      dueDate: "",
    });
    expect(t.text).toHaveLength(MAX_TODO_TEXT_LEN);
  });

  it("todoToggle flips done and bumps updatedAt", () => {
    const before = [
      { ...newTodo({ text: "a", priority: "low", dueDate: "" }), updatedAt: 100 },
    ];
    const after = todoToggle(before, before[0].id);
    expect(after[0].done).toBe(true);
    expect(after[0].updatedAt!).toBeGreaterThan(100);
  });

  it("todoMoveToTrash sets trashed/trashedAt/updatedAt", () => {
    const before = [newTodo({ text: "a", priority: "low", dueDate: "" })];
    const after = todoMoveToTrash(before, before[0].id);
    expect(after[0].trashed).toBe(true);
    expect(after[0].trashedAt).toBeTypeOf("number");
    expect(after[0].updatedAt).toBeTypeOf("number");
  });

  it("todoSet truncates text writes", () => {
    const before = [newTodo({ text: "a", priority: "low", dueDate: "" })];
    const after = todoSet(
      before,
      before[0].id,
      "text",
      "x".repeat(MAX_TODO_TEXT_LEN + 200),
    );
    expect(after[0].text).toHaveLength(MAX_TODO_TEXT_LEN);
  });
});

// ---- Subtasks: helpers + parent auto-complete --------------------------

describe("subtasks", () => {
  function makeTodo() {
    return newTodo({ text: "parent", priority: "low", dueDate: "" });
  }

  it("subtaskAdd appends an open subtask and keeps the parent open", () => {
    const before = [makeTodo()];
    const after = subtaskAdd(before, before[0].id, "step 1");
    expect(after[0].subtasks).toHaveLength(1);
    expect(after[0].subtasks![0].text).toBe("step 1");
    expect(after[0].subtasks![0].done).toBe(false);
    expect(after[0].done).toBe(false);
  });

  it("subtaskAdd trims and ignores empty input", () => {
    const before = [makeTodo()];
    expect(subtaskAdd(before, before[0].id, "   ")[0].subtasks).toBeUndefined();
    const after = subtaskAdd(before, before[0].id, "  trimmed  ");
    expect(after[0].subtasks![0].text).toBe("trimmed");
  });

  it("toggling all subtasks done auto-completes the parent", () => {
    let state = [makeTodo()];
    state = subtaskAdd(state, state[0].id, "a");
    state = subtaskAdd(state, state[0].id, "b");
    expect(state[0].done).toBe(false);
    const [s1, s2] = state[0].subtasks!;
    state = subtaskToggle(state, state[0].id, s1.id);
    expect(state[0].done).toBe(false);
    state = subtaskToggle(state, state[0].id, s2.id);
    expect(state[0].done).toBe(true);
    // Re-opening one subtask re-opens the parent.
    state = subtaskToggle(state, state[0].id, s2.id);
    expect(state[0].done).toBe(false);
  });

  it("todoToggle is a no-op when subs exist (parent done is derived)", () => {
    let state = [makeTodo()];
    state = subtaskAdd(state, state[0].id, "a");
    state = subtaskAdd(state, state[0].id, "b");
    const before = state[0];
    state = todoToggle(state, state[0].id);
    expect(state[0]).toBe(before); // same reference — no mutation
    expect(state[0].done).toBe(false);
    expect(state[0].subtasks!.every((s) => !s.done)).toBe(true);
  });

  it("subtaskAdd defaults priority=medium and dueDate=''", () => {
    let state = [makeTodo()];
    state = subtaskAdd(state, state[0].id, "with defaults");
    const sub = state[0].subtasks![0];
    expect(sub.priority).toBe("medium");
    expect(sub.dueDate).toBe("");
  });

  it("subtaskUpdatePriority and subtaskUpdateDueDate edit a single subtask", () => {
    let state = [makeTodo()];
    state = subtaskAdd(state, state[0].id, "a");
    state = subtaskAdd(state, state[0].id, "b");
    const [a, b] = state[0].subtasks!;
    state = subtaskUpdatePriority(state, state[0].id, a.id, "high");
    state = subtaskUpdateDueDate(state, state[0].id, b.id, "2026-12-31");
    expect(state[0].subtasks![0].priority).toBe("high");
    expect(state[0].subtasks![0].dueDate).toBe("");
    expect(state[0].subtasks![1].priority).toBe("medium");
    expect(state[0].subtasks![1].dueDate).toBe("2026-12-31");
  });

  it("adding an open subtask to a done parent re-opens the parent", () => {
    let state = [makeTodo()];
    state = todoToggle(state, state[0].id);
    expect(state[0].done).toBe(true);
    state = subtaskAdd(state, state[0].id, "new step");
    expect(state[0].done).toBe(false);
  });

  it("subtaskUpdateText edits a subtask and clamps length", () => {
    let state = [makeTodo()];
    state = subtaskAdd(state, state[0].id, "old");
    const subId = state[0].subtasks![0].id;
    state = subtaskUpdateText(state, state[0].id, subId, "new text");
    expect(state[0].subtasks![0].text).toBe("new text");
  });

  it("subtaskRemove drops a subtask and re-derives parent done if subs remain", () => {
    let state = [makeTodo()];
    state = subtaskAdd(state, state[0].id, "a");
    state = subtaskAdd(state, state[0].id, "b");
    const [a, b] = state[0].subtasks!;
    state = subtaskToggle(state, state[0].id, a.id);
    state = subtaskToggle(state, state[0].id, b.id);
    expect(state[0].done).toBe(true);
    // Remove the only-open subtask after adding a third
    state = subtaskAdd(state, state[0].id, "c");
    expect(state[0].done).toBe(false);
    const cId = state[0].subtasks![2].id;
    state = subtaskRemove(state, state[0].id, cId);
    // a and b were done, parent should be done again
    expect(state[0].done).toBe(true);
  });

  it("removing the last subtask preserves parent's manual done state", () => {
    let state = [makeTodo()];
    state = subtaskAdd(state, state[0].id, "only");
    const subId = state[0].subtasks![0].id;
    state = subtaskToggle(state, state[0].id, subId);
    expect(state[0].done).toBe(true);
    state = subtaskRemove(state, state[0].id, subId);
    expect(state[0].subtasks).toHaveLength(0);
    expect(state[0].done).toBe(true);
  });

  it("subtaskAdd pushes parent dueDate forward if the new sub is later", () => {
    let state = [
      { ...newTodo({ text: "trip", priority: "low", dueDate: "2026-06-01" }) },
    ];
    state = subtaskAdd(state, state[0].id, "book later flight", "medium", "2026-07-15");
    expect(state[0].dueDate).toBe("2026-07-15");
    expect(state[0].subtasks![0].dueDate).toBe("2026-07-15");
  });

  it("subtaskAdd leaves parent dueDate alone if the sub is earlier", () => {
    let state = [
      { ...newTodo({ text: "trip", priority: "low", dueDate: "2026-06-01" }) },
    ];
    state = subtaskAdd(state, state[0].id, "earlier", "medium", "2026-05-15");
    expect(state[0].dueDate).toBe("2026-06-01");
  });

  it("subtaskAdd does not push when parent has no dueDate", () => {
    let state = [
      { ...newTodo({ text: "no date", priority: "low", dueDate: "" }) },
    ];
    state = subtaskAdd(state, state[0].id, "future", "medium", "2026-07-01");
    expect(state[0].dueDate).toBe("");
  });

  it("subtaskUpdateDueDate pushes parent dueDate when changed to later", () => {
    let state = [
      { ...newTodo({ text: "trip", priority: "low", dueDate: "2026-06-01" }) },
    ];
    state = subtaskAdd(state, state[0].id, "step", "medium", "2026-05-20");
    const subId = state[0].subtasks![0].id;
    expect(state[0].dueDate).toBe("2026-06-01"); // unchanged so far
    state = subtaskUpdateDueDate(state, state[0].id, subId, "2026-07-10");
    expect(state[0].subtasks![0].dueDate).toBe("2026-07-10");
    expect(state[0].dueDate).toBe("2026-07-10"); // pushed
  });

  it("subtaskUpdateDueDate leaves parent dueDate alone when changed earlier", () => {
    let state = [
      { ...newTodo({ text: "trip", priority: "low", dueDate: "2026-06-01" }) },
    ];
    state = subtaskAdd(state, state[0].id, "step", "medium", "2026-05-20");
    const subId = state[0].subtasks![0].id;
    state = subtaskUpdateDueDate(state, state[0].id, subId, "2026-05-10");
    expect(state[0].dueDate).toBe("2026-06-01");
  });

  it("subtaskAdd respects MAX_SUBTASKS_PER_TODO cap", () => {
    let state = [makeTodo()];
    for (let i = 0; i < MAX_SUBTASKS_PER_TODO + 5; i++) {
      state = subtaskAdd(state, state[0].id, `s${i}`);
    }
    expect(state[0].subtasks!.length).toBe(MAX_SUBTASKS_PER_TODO);
  });

  it("migrateTodos sanitizes subtasks and re-derives parent done", () => {
    const out = migrateTodos([
      {
        id: "t1",
        text: "x",
        priority: "low",
        dueDate: "",
        done: false, // intentionally stale — all subs are done so should flip true
        subtasks: [
          { id: "s1", text: "one", done: true },
          { id: "s2", text: "two", done: true },
          { text: "missing id", done: false }, // gets a fresh id
          null, // dropped
          { id: "s3", text: 123, done: "yes" }, // text/done coerced
        ],
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].subtasks).toBeDefined();
    // Parent done re-derived from subs: not all done (one is open) → false
    expect(out[0].done).toBe(false);
    // Garbage entries dropped, but the "missing id" one kept with a fresh id
    expect(out[0].subtasks!.length).toBe(4);
  });
});

// ---- migrateCategories ---------------------------------------------------

describe("migrateCategories", () => {
  it("returns [] for non-array input", () => {
    expect(migrateCategories(null)).toEqual([]);
    expect(migrateCategories({})).toEqual([]);
  });

  it("rejects entries without a string id", () => {
    const out = migrateCategories([
      { id: "ok", color: "#34C759", icon: "home" },
      { color: "#FF3B30", icon: "x" },
      { id: 42, color: "#FF3B30", icon: "x" },
      null,
    ]);
    expect(out.map((c) => c.id)).toEqual(["ok"]);
  });

  it("dedupes by id, keeping first occurrence", () => {
    const out = migrateCategories([
      { id: "a", label: "first", color: "#34C759", icon: "home" },
      { id: "a", label: "second", color: "#FF3B30", icon: "x" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("first");
  });

  it("caps array length at MAX_CATEGORIES_PER_USER", () => {
    const huge = Array.from({ length: MAX_CATEGORIES_PER_USER + 10 }, (_, i) => ({
      id: `c${i}`,
      color: "#34C759",
      icon: "tag",
    }));
    expect(migrateCategories(huge).length).toBeLessThanOrEqual(
      MAX_CATEGORIES_PER_USER,
    );
  });

  it("clamps label to MAX_CATEGORY_LABEL_LEN", () => {
    const out = migrateCategories([
      {
        id: "x",
        label: "y".repeat(MAX_CATEGORY_LABEL_LEN + 50),
        color: "#34C759",
        icon: "tag",
      },
    ]);
    expect(out[0].label).toHaveLength(MAX_CATEGORY_LABEL_LEN);
  });

  it("falls back to gray for malformed colors", () => {
    expect(
      migrateCategory({ id: "x", color: "blue", icon: "tag" }).color,
    ).toBe("#8E8E93");
    expect(
      migrateCategory({ id: "x", color: "#XYZ", icon: "tag" }).color,
    ).toBe("#8E8E93");
  });

  it("rewrites legacy CSS-variable colors to hex", () => {
    expect(
      migrateCategory({ id: "x", color: "var(--green)", icon: "home" }).color,
    ).toBe("#34C759");
  });
});

// ---- migrateProfile ------------------------------------------------------

describe("migrateProfile", () => {
  it("returns SEED_PROFILE for invalid input", () => {
    expect(migrateProfile(null)).toEqual(SEED_PROFILE);
    expect(migrateProfile({})).toEqual(SEED_PROFILE);
    expect(migrateProfile([])).toEqual(SEED_PROFILE);
    expect(migrateProfile({ name: "x" })).toEqual(SEED_PROFILE);
  });

  it("clamps name to MAX_PROFILE_NAME_LEN", () => {
    const out = migrateProfile({
      name: "x".repeat(MAX_PROFILE_NAME_LEN + 50),
      avatar: { kind: "preset", key: "smile" },
    });
    expect(out.name).toHaveLength(MAX_PROFILE_NAME_LEN);
  });

  it("rejects oversized avatar uri", () => {
    const huge = "data:image/png;base64," + "A".repeat(MAX_AVATAR_URI_LEN);
    const out = migrateProfile({
      name: "X",
      avatar: { kind: "image", uri: huge },
    });
    expect(out).toEqual(SEED_PROFILE);
  });

  it("normalizes legacy `data:` field to `uri`", () => {
    const out = migrateProfile({
      name: "X",
      avatar: { kind: "image", data: "data:image/png;base64,abc" },
    });
    expect(out.avatar).toEqual({
      kind: "image",
      uri: "data:image/png;base64,abc",
    });
  });
});

// ---- buildGroups (date bucketing) ----------------------------------------

describe("buildGroups", () => {
  // Lock today for deterministic bucketing. todayLocal()/endOfWeekLocal()
  // both call `new Date()`, so vi.setSystemTime gives us full control.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T09:00:00")); // Wed
  });
  afterEach(() => vi.useRealTimers());

  function mk(id: string, dueDate: string, done = false) {
    return {
      id,
      text: id,
      done,
      priority: "medium" as const,
      dueDate,
      category: "home",
      trashed: false,
    };
  }

  it("groups overdue, today, week, upcoming correctly", () => {
    const groups = buildGroups([
      mk("yesterday", "2026-05-12"),
      mk("today", "2026-05-13"),
      mk("thursday", "2026-05-14"),
      mk("nextmonth", "2026-06-15"),
      mk("nodate", ""),
    ]);
    const by = Object.fromEntries(
      groups.map((g) => [g.key, g.todos.map((t) => t.id)]),
    );
    expect(by.overdue).toEqual(["yesterday"]);
    expect(by.today).toEqual(["today"]);
    expect(by.week).toEqual(["thursday"]);
    expect(by.upcoming?.sort()).toEqual(["nextmonth", "nodate"]);
  });

  it("done todos stay in their date bucket (no separate done group)", () => {
    // Per the calm-app model, every date bucket keeps + counts done items
    // alongside open ones. The dedicated Done filter view is the place to
    // see only completed items; the All-view never pulls done items out
    // of their date bucket.
    const groups = buildGroups([
      mk("a", "2026-05-13", true),
      mk("b", "2026-05-13", false),
    ]);
    expect(groups.find((g) => g.key === "today")?.todos.map((t) => t.id).sort()).toEqual(["a", "b"]);
    expect(groups.find((g) => g.key === "done")).toBeUndefined();
  });

  it("drops empty buckets", () => {
    const groups = buildGroups([mk("only", "2026-05-13")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("today");
  });

  it("sorts within bucket by priority then dueDate then id", () => {
    const groups = buildGroups([
      { ...mk("a", "2026-05-13"), priority: "low" },
      { ...mk("b", "2026-05-13"), priority: "high" },
      { ...mk("c", "2026-05-13"), priority: "medium" },
    ]);
    expect(groups[0].todos.map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  // Regression: prior endOfWeekLocal returned today on Sundays, so the
  // `week` bucket was always empty for Sun-rendered views. See core/utils.ts.
  it("week bucket includes Mon-Sat dates when today is Sunday", () => {
    vi.setSystemTime(new Date("2026-05-10T09:00:00")); // Sunday
    const groups = buildGroups([
      mk("mon", "2026-05-11"),
      mk("sat", "2026-05-16"),
      mk("nextweek", "2026-05-17"), // next Sunday → upcoming
    ]);
    const by = Object.fromEntries(
      groups.map((g) => [g.key, g.todos.map((t) => t.id)]),
    );
    expect(by.week?.sort()).toEqual(["mon", "sat"]);
    expect(by.upcoming).toEqual(["nextweek"]);
  });
});
