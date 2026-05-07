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
  TRASH_RETENTION_MS,
  MAX_TODO_TEXT_LEN,
  MAX_TODOS_PER_USER,
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
    const groups = buildGroups(
      [
        mk("yesterday", "2026-05-12"),
        mk("today", "2026-05-13"),
        mk("thursday", "2026-05-14"),
        mk("nextmonth", "2026-06-15"),
        mk("nodate", ""),
      ],
      { separateDone: true },
    );
    const by = Object.fromEntries(
      groups.map((g) => [g.key, g.todos.map((t) => t.id)]),
    );
    expect(by.overdue).toEqual(["yesterday"]);
    expect(by.today).toEqual(["today"]);
    expect(by.week).toEqual(["thursday"]);
    expect(by.upcoming?.sort()).toEqual(["nextmonth", "nodate"]);
  });

  it("done todos go to the done bucket when separateDone=true", () => {
    const groups = buildGroups(
      [
        mk("a", "2026-05-13", true),
        mk("b", "2026-05-13", false),
      ],
      { separateDone: true },
    );
    expect(groups.find((g) => g.key === "today")?.todos.map((t) => t.id)).toEqual(["b"]);
    expect(groups.find((g) => g.key === "done")?.todos.map((t) => t.id)).toEqual(["a"]);
  });

  it("done todos stay in their date bucket when separateDone=false", () => {
    const groups = buildGroups(
      [mk("a", "2026-05-13", true), mk("b", "2026-05-13", false)],
      { separateDone: false },
    );
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
});
