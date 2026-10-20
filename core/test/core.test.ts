/**
 * Cross-cutting tests for core/ (migration, derive, utils), run by the
 * repo-root vitest. Imports use the same relative ring paths the app uses.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  migrateTodos,
  newTodo,
  todoMoveToTrash,
  todoRestoreFromTrash,
  todoToggle,
  todoRevert,
  todoSet,
  todoSetRecurrence,
  todoSkipSeriesFuture,
  todoPermanentlyDeleteSeriesFuture,
  subtaskAdd,
  subtaskToggle,
  subtaskUpdateText,
  subtaskUpdatePriority,
  subtaskUpdateDueDate,
  subtaskRemove,
  deriveState,
  inferDefaultCategory,
  categoryAdd,
  categoryEdit,
  categoryDelete,
  categoryReorder,
  todoApplySeriesFutureEdits,
  todoMoveToTrashFutureSeries,
  getReminders,
  dedupeReminders,
  recordTodoReference,
  migrateTodoReferences,
  MAX_TODO_REFERENCES,
  TRASH_RETENTION_MS,
  MAX_TODO_TEXT_LEN,
  MAX_TODOS_PER_USER,
  MAX_SUBTASKS_PER_TODO,
} from "../src/logic/derive";
import { buildGroups } from "../src/logic/groups";
import {
  migrateCategory,
  MAX_CATEGORY_LABEL_LEN,
} from "../src/data/categories";
import {
  migrateProfile,
  SEED_PROFILE,
  MAX_PROFILE_NAME_LEN,
  MAX_AVATAR_URI_LEN,
} from "../src/data/profile";
import {
  newGroceryItem,
  groceryToggleChecked,
  groceryEdit,
  groceryDelete,
  migrateGroceries,
  frequentGroceries,
  MAX_GROCERY_ITEMS,
  MAX_GROCERY_PURCHASES,
  FREQUENT_GROCERY_MIN_COUNT,
  FREQUENT_GROCERY_WINDOW_MS,
} from "../src/data/groceries";
import {
  nextOccurrence,
  expandRecurrence,
  MAX_RECURRENCE_INSTANCES,
  formatRecurrence,
} from "../src/logic/utils";
import { strings } from "../src/data/i18n";
import { normalizeSuggestedReminder } from "../src/logic/suggestFields";
import type { Todo, Filter } from "../src/domain/types";

// ---- migrateTodos --------------------------------------------------------

describe("migrateTodos", () => {
  it("returns [] for non-array input", () => {
    expect(migrateTodos(null)).toEqual([]);
    expect(migrateTodos(undefined)).toEqual([]);
    expect(migrateTodos({})).toEqual([]);
    expect(migrateTodos("nope")).toEqual([]);
    expect(migrateTodos(42)).toEqual([]);
  });

  it("assigns a fresh string id when the stored id is not a string", () => {
    const out = migrateTodos([
      { id: 1714936800123, text: "old", priority: "low", dueDate: "" },
    ]);
    expect(out).toHaveLength(1);
    expect(typeof out[0].id).toBe("string");
    expect(out[0].id).not.toBe("1714936800123");
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

  it("preserves notes on round-trip and caps at MAX_TODO_NOTES_LEN", () => {
    const longNote = "x".repeat(10_000);
    const out = migrateTodos([
      { id: "a", text: "with notes", priority: "low", dueDate: "", notes: "blocking: legal sign-off" },
      { id: "b", text: "very long", priority: "low", dueDate: "", notes: longNote },
      { id: "c", text: "no notes", priority: "low", dueDate: "" },
      { id: "d", text: "garbage notes", priority: "low", dueDate: "", notes: 42 },
    ]);
    expect(out.find((t) => t.id === "a")?.notes).toBe("blocking: legal sign-off");
    expect(out.find((t) => t.id === "b")?.notes?.length).toBe(8192);
    expect(out.find((t) => t.id === "c")?.notes).toBeUndefined();
    expect(out.find((t) => t.id === "d")?.notes).toBeUndefined();
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

  it("todoSet writes notes and caps at the notes-specific limit", () => {
    const before = [newTodo({ text: "a", priority: "low", dueDate: "" })];
    const after = todoSet(before, before[0].id, "notes", "what's blocking me");
    expect(after[0].notes).toBe("what's blocking me");
    const truncated = todoSet(after, before[0].id, "notes", "y".repeat(20_000));
    expect(truncated[0].notes?.length).toBe(8192);
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

  // Regression: completing a task by checking off its last subtask must cancel
  // its reminders, exactly as todoToggle does — otherwise the scheduler keeps
  // firing notifications for an already-done task.
  it("clears reminders when the last subtask completes the parent", () => {
    let state: Todo[] = [
      {
        ...makeTodo(),
        reminders: [{ id: "r1", at: "2026-07-10T09:00" }],
      },
    ];
    state = subtaskAdd(state, state[0].id, "only");
    const subId = state[0].subtasks![0].id;
    state = subtaskToggle(state, state[0].id, subId);
    expect(state[0].done).toBe(true);
    expect(state[0].reminders).toBeUndefined();
  });

  it("todoToggle on a recurring row without a seriesId just marks it done (no roll, no snapshot)", () => {
    const withRec = {
      ...makeTodo(),
      dueDate: "2026-05-10",
      recurrence: { freq: "weekly" as const },
    };
    const out = todoToggle([withRec], withRec.id);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(withRec.id);
    expect(out[0].done).toBe(true);
    expect(out[0].trashed).toBe(true);
    expect(out[0].dueDate).toBe("2026-05-10");
  });

  it("todoToggle on a to-do with steps completes every step, and reopens them", () => {
    let state = [makeTodo()];
    state = subtaskAdd(state, state[0].id, "a");
    state = subtaskAdd(state, state[0].id, "b");
    state = todoToggle(state, state[0].id, "2026-10-18");
    expect(state[0].done).toBe(true);
    expect(state[0].trashed).toBe(true);
    expect(state[0].subtasks!.every((s) => s.done && s.completionDate === "2026-10-18")).toBe(true);
    state = todoToggle(state, state[0].id, "2026-10-18");
    expect(state[0].done).toBe(false);
    expect(state[0].subtasks!.every((s) => !s.done && !s.completionDate)).toBe(true);
  });

  it("todoRevert restores the exact pre-completion snapshot (per-step state)", () => {
    let state = [makeTodo()];
    state = subtaskAdd(state, state[0].id, "a");
    state = subtaskAdd(state, state[0].id, "b");
    state = subtaskToggle(state, state[0].id, state[0].subtasks![0].id);
    const snapshot = state[0];
    state = todoToggle(state, state[0].id);
    state = todoRevert(state, snapshot);
    expect(state[0].done).toBe(false);
    expect(state[0].subtasks!.map((s) => s.done)).toEqual([true, false]);
    expect(todoRevert(state, { ...snapshot, id: "gone" })).toBe(state);
  });

  it("subtaskAdd defaults priority=medium and dueDate='' when parent has no date", () => {
    let state = [makeTodo()];
    state = subtaskAdd(state, state[0].id, "with defaults");
    const sub = state[0].subtasks![0];
    expect(sub.priority).toBe("medium");
    expect(sub.dueDate).toBe("");
  });

  it("subtaskAdd inherits parent's dueDate when caller doesn't supply one", () => {
    // Initial-only default: a fresh step takes the parent's date so the
    // user doesn't have to repeat it. The edit path (subtaskUpdateDueDate)
    // is not affected — clearing later stays cleared.
    const parent = newTodo({ text: "p", priority: "medium", dueDate: "2026-12-31" });
    let state = [parent];
    state = subtaskAdd(state, parent.id, "step a");
    expect(state[0].subtasks![0].dueDate).toBe("2026-12-31");
    // An explicitly-passed dueDate still wins over the parent's.
    state = subtaskAdd(state, parent.id, "step b", "high", "2026-11-15");
    expect(state[0].subtasks![1].dueDate).toBe("2026-11-15");
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

  it("subtaskUpdateDueDate tracks the latest sub date — parent drops when the latest sub moves earlier", () => {
    // Parent's date now follows max(all sub dates) on every sub-date
    // change. Even if the new sub date is earlier than parent's prior
    // date, parent moves to match the latest sub.
    let state = [
      { ...newTodo({ text: "trip", priority: "low", dueDate: "2026-06-01" }) },
    ];
    state = subtaskAdd(state, state[0].id, "step", "medium", "2026-05-20");
    const subId = state[0].subtasks![0].id;
    state = subtaskUpdateDueDate(state, state[0].id, subId, "2026-05-10");
    // Only one sub with date '2026-05-10' → parent matches.
    expect(state[0].dueDate).toBe("2026-05-10");
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
      avatar: { kind: "preset", key: "mochi" },
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

  it("rejects an image avatar with no `uri` (falls back to the seed)", () => {
    const out = migrateProfile({
      name: "X",
      avatar: { kind: "image", data: "data:image/png;base64,abc" },
    });
    expect(out).toEqual(SEED_PROFILE);
  });

  it("drops non-set `pinnedFilters` entries and invalid filters inside sets", () => {
    const out = migrateProfile({
      name: "X",
      avatar: { kind: "preset", key: "mochi" },
      pinnedFilters: ["open", ["cat:home", "not-a-filter", ""], 42, ["cat:work"], [""]],
    });
    expect(out.pinnedFilters).toEqual([["cat:home"], ["cat:work"]]);
  });

  it("caps `pinnedFilters` at 12 sets", () => {
    const many = Array.from({ length: 20 }, (_, i) => [`cat:c${i}`]);
    const out = migrateProfile({
      name: "X",
      avatar: { kind: "preset", key: "mochi" },
      pinnedFilters: many,
    });
    expect(out.pinnedFilters).toHaveLength(12);
  });

  it("preserves new-shape `pinnedFilters` (array of arrays) for composite pins", () => {
    const out = migrateProfile({
      name: "X",
      avatar: { kind: "preset", key: "mochi" },
      pinnedFilters: [["done", "cat:work"], ["open"], ["cat:home", "pri:high"]],
    });
    expect(out.pinnedFilters).toEqual([
      ["done", "cat:work"],
      ["open"],
      ["cat:home", "pri:high"],
    ]);
  });

  it("preserves a valid lastAddedGroceryStore string", () => {
    const out = migrateProfile({
      name: "X",
      avatar: { kind: "preset", key: "mochi" },
      lastAddedGroceryStore: "Costco",
    });
    expect(out.lastAddedGroceryStore).toBe("Costco");
  });

  it("drops a non-string or empty lastAddedGroceryStore", () => {
    for (const bad of [42, null, undefined, "", {}]) {
      const out = migrateProfile({
        name: "X",
        avatar: { kind: "preset", key: "mochi" },
        lastAddedGroceryStore: bad,
      });
      expect(out.lastAddedGroceryStore).toBeUndefined();
    }
  });

  it("caps lastAddedGroceryStore at 64 chars", () => {
    const out = migrateProfile({
      name: "X",
      avatar: { kind: "preset", key: "mochi" },
      lastAddedGroceryStore: "x".repeat(200),
    });
    expect(out.lastAddedGroceryStore!.length).toBe(64);
  });

  it("preserves the onboarding flag and daily check-in settings (regression: were dropped)", () => {
    const out = migrateProfile({
      name: "X",
      avatar: { kind: "preset", key: "mochi" },
      onboardingDone: true,
      dailyCheckinEnabled: true,
      dailyCheckinHour: 9,
    });
    expect(out.onboardingDone).toBe(true);
    expect(out.dailyCheckinEnabled).toBe(true);
    expect(out.dailyCheckinHour).toBe(9);
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
    expect(by.upcoming).toEqual(["nextmonth"]);
    expect(by.noDate).toEqual(["nodate"]);
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

  it("done todos sink to the bottom of their bucket even when high priority", () => {
    // A high-priority done item should sit below a low-priority open
    // item in the same bucket — completed work shouldn't crowd out
    // active work after a tap-to-complete.
    const groups = buildGroups([
      { ...mk("done-hi", "2026-05-13", true), priority: "high" },
      { ...mk("open-lo", "2026-05-13"), priority: "low" },
      { ...mk("open-med", "2026-05-13"), priority: "medium" },
    ]);
    expect(groups[0].todos.map((t) => t.id)).toEqual(["open-med", "open-lo", "done-hi"]);
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

// ---- deriveState (filter + count semantics) -----------------------------
// Locks in the calm-app filter rules: open/done/overdue/category, the
// completedToday grace period (just-done items linger in open views for
// the day), and the "all" filter is the union of open + the merged Done
// bin. systemCounts is the source of truth for filter pill badges.

describe("deriveState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T09:00:00")); // Wed
  });
  afterEach(() => vi.useRealTimers());

  const cats = [
    { id: "home", color: "#34C759", icon: "home" },
    { id: "work", color: "#007AFF", icon: "briefcase" },
  ];
  const t = strings.en;

  function mk(overrides: Partial<Todo> & { id?: string } = {}): Todo {
    return {
      id: overrides.id ?? Math.random().toString(36).slice(2),
      text: overrides.text ?? "x",
      done: overrides.done ?? false,
      priority: overrides.priority ?? "medium",
      dueDate: overrides.dueDate ?? "",
      category: "category" in overrides ? overrides.category : "home",
      trashed: overrides.trashed ?? false,
      ...overrides,
    };
  }

  it("all filter shows open rows only — done + binned rows live in the Done bin", () => {
    const todos = [
      mk({ id: "open" }),
      mk({ id: "done", done: true, trashed: true, completionDate: "2026-05-13" }),
      mk({ id: "trashed", trashed: true, trashedAt: Date.now() }),
    ];
    const state = deriveState({ todos, filters: [], categories: cats, t });
    expect(state.filtered.map((x) => x.id)).toEqual(["open"]);
    // ...so the open groups never carry a done / binned row.
    expect(state.groups.flatMap((g) => g.todos).every((x) => !x.done && !x.trashed)).toBe(true);
  });

  it("open filter is strict — hides done and Not-Do rows including grace items", () => {
    const todos = [
      mk({ id: "open" }),
      mk({ id: "doneOld", done: true, trashed: true, completionDate: "2026-05-12" }),
      mk({ id: "doneToday", done: true, trashed: true, completionDate: "2026-05-13" }),
      mk({ id: "notDo", done: false, trashed: true, trashedAt: Date.now() }),
    ];
    const state = deriveState({ todos, filters: ["open"], categories: cats, t });
    // Only the truly-open row remains. No completedToday grace.
    expect(state.filtered.map((x) => x.id)).toEqual(["open"]);
  });

  it("done filter merges done + trashed (one bin)", () => {
    const todos = [
      mk({ id: "open" }),
      mk({ id: "done", done: true, trashed: true }),
      mk({ id: "trashedOnly", trashed: true }),
    ];
    const state = deriveState({ todos, filters: ["done"], categories: cats, t });
    expect(state.filtered.map((x) => x.id).sort()).toEqual(["done", "trashedOnly"]);
  });

  it("overdue (Carried Over) shows and counts open past-due rows only", () => {
    const todos = [
      mk({ id: "overdue", dueDate: "2026-05-10" }),
      mk({
        id: "overdueDone",
        dueDate: "2026-05-10",
        done: true,
        trashed: true,
        completionDate: "2026-05-13",
      }),
      mk({ id: "today", dueDate: "2026-05-13" }),
      mk({ id: "future", dueDate: "2026-05-20" }),
    ];
    const state = deriveState({ todos, filters: ["overdue"], categories: cats, t });
    // A done past-due row (even one finished today) is in the Done bin.
    expect(state.filtered.map((x) => x.id)).toEqual(["overdue"]);
    expect(state.systemCounts.overdue).toBe(1);
  });

  it("category filter shows only that category's open rows", () => {
    const todos = [
      mk({ id: "h1", category: "home" }),
      mk({ id: "w1", category: "work" }),
      mk({
        id: "h2",
        category: "home",
        done: true,
        trashed: true,
        completionDate: "2026-05-13",
      }),
    ];
    const state = deriveState({
      todos,
      filters: ["cat:home" as Filter],
      categories: cats,
      t,
    });
    expect(state.filtered.map((x) => x.id)).toEqual(["h1"]);
  });

  it("systemCounts: all is open + merged Done bin", () => {
    const todos = [
      mk({ id: "a" }),
      mk({ id: "b", done: true, trashed: true }),
      mk({ id: "c", trashed: true }),
    ];
    const state = deriveState({ todos, filters: [], categories: cats, t });
    expect(state.systemCounts.open).toBe(1);
    expect(state.systemCounts.done).toBe(2);
    expect(state.systemCounts.all).toBe(3);
  });

  it("byCategoryOpen counts only active (non-trashed, non-done) items per category", () => {
    const todos = [
      mk({ id: "h1", category: "home" }),
      mk({ id: "h2", category: "home" }),
      mk({ id: "h3", category: "home", done: true, trashed: true }),
      mk({ id: "w1", category: "work" }),
    ];
    const state = deriveState({ todos, filters: [], categories: cats, t });
    expect(state.byCategoryOpen.home).toBe(2);
    expect(state.byCategoryOpen.work).toBe(1);
  });

  it("defaultCategory uses inferDefaultCategory: empty history falls back to home, else [0]", () => {
    // home > [0] > 'home' fallback. With no home in the list, [0] wins.
    const justOther = [{ id: "other", color: "#8E8E93", icon: "tag" }];
    const state = deriveState({
      todos: [],
      filters: [],
      categories: justOther,
      t,
    });
    expect(state.defaultCategory).toBe("other");
  });

  it("defaultCategory mirrors last active todo's category", () => {
    const cats = [
      { id: "home",   color: "#34C759", icon: "home" },
      { id: "work",   color: "#007AFF", icon: "briefcase" },
      { id: "school", color: "#FF9500", icon: "book" },
    ];
    const todos: Todo[] = [
      // Newest by updatedAt is the work one — that's the expected pick.
      { id: "1", text: "a", category: "school", priority: "medium", dueDate: "",
        done: false, trashed: false, updatedAt: 100 } as Todo,
      { id: "2", text: "b", category: "work",   priority: "medium", dueDate: "",
        done: false, trashed: false, updatedAt: 300 } as Todo,
      { id: "3", text: "c", category: "home",   priority: "medium", dueDate: "",
        done: false, trashed: false, updatedAt: 200 } as Todo,
    ];
    const state = deriveState({ todos, filters: [], categories: cats, t });
    expect(state.defaultCategory).toBe("work");
  });
});

describe("inferDefaultCategory", () => {
  const cats = [
    { id: "home",   color: "#34C759", icon: "home" },
    { id: "work",   color: "#007AFF", icon: "briefcase" },
    { id: "school", color: "#FF9500", icon: "book" },
  ];
  function mk(
    id: string, category: string, updatedAt: number, trashed = false,
  ): Todo {
    return { id, text: id, category, priority: "medium", dueDate: "",
      done: false, trashed, updatedAt } as Todo;
  }

  it("returns the newest non-trashed todo's category", () => {
    const todos = [mk("a", "home", 100), mk("b", "work", 200)];
    expect(inferDefaultCategory(todos, cats)).toBe("work");
  });

  it("ignores trashed todos when scanning for last", () => {
    const todos = [mk("a", "home", 100), mk("b", "work", 200, /*trashed*/ true)];
    expect(inferDefaultCategory(todos, cats)).toBe("home");
  });

  it("skips todos whose category was deleted from the list", () => {
    const todos = [mk("a", "home", 100), mk("b", "ghost", 200)];
    expect(inferDefaultCategory(todos, cats)).toBe("home");
  });

  it("falls back to 'home' when history is empty and home is in the list", () => {
    expect(inferDefaultCategory([], cats)).toBe("home");
  });

  it("falls back to categories[0] when home is missing", () => {
    expect(inferDefaultCategory([], [{ id: "other", color: "#888", icon: "tag" }])).toBe("other");
  });

  it("falls back to literal 'home' when categories list is empty", () => {
    expect(inferDefaultCategory([], [])).toBe("home");
  });
});

describe("deriveState — section labels (continued)", () => {
  const t = strings.en;
  it("section label resolves for system filters and category filters", () => {
    const cats2 = [{ id: "home", label: "House", color: "#34C759", icon: "home" }];
    const sOverdue = deriveState({
      todos: [],
      filters: ["overdue"],
      categories: cats2,
      t,
    });
    expect(sOverdue.sectionLabel).toBe(t.filters.overdue);
    const sCat = deriveState({
      todos: [],
      filters: ["cat:home" as Filter],
      categories: cats2,
      t,
    });
    expect(sCat.sectionLabel).toBe("House");
  });
});

// ---- Category mutations -------------------------------------------------

describe("migrateCategory", () => {
  it("keeps a valid hex color, icon and label", () => {
    expect(migrateCategory({ id: "c1", color: "#123ABC", icon: "tag", label: "Gym" })).toEqual({
      id: "c1", color: "#123ABC", icon: "tag", label: "Gym",
    });
  });
  it("falls back to gray for a non-hex color (incl. CSS-variable tokens)", () => {
    expect(migrateCategory({ id: "c1", color: "var(--red)", icon: "tag" }).color).toBe("#8E8E93");
    expect(migrateCategory({ id: "c1", icon: "tag" }).color).toBe("#8E8E93");
  });
  it("defaults a missing icon to the built-in's seed icon, else 'tag'", () => {
    expect(migrateCategory({ id: "work", color: "#007AFF" }).icon).toBe("briefcase");
    expect(migrateCategory({ id: "custom", color: "#007AFF" }).icon).toBe("tag");
  });
  it("caps the label and drops an empty one", () => {
    expect(migrateCategory({ id: "c", color: "#000000", icon: "tag", label: "x".repeat(500) }).label)
      .toHaveLength(MAX_CATEGORY_LABEL_LEN);
    expect(migrateCategory({ id: "c", color: "#000000", icon: "tag", label: "" }).label).toBeUndefined();
  });
});

describe("category mutations", () => {
  function mkCat(id: string, label?: string) {
    return label
      ? { id, label, color: "#34C759", icon: "tag" }
      : { id, color: "#34C759", icon: "tag" };
  }

  it("categoryAdd appends with the requested fields", () => {
    const next = categoryAdd([mkCat("a")], "b", {
      label: "B",
      color: "#FF3B30",
      icon: "x",
    });
    expect(next.map((c) => c.id)).toEqual(["a", "b"]);
    expect(next[1].label).toBe("B");
    expect(next[1].color).toBe("#FF3B30");
  });

  it("categoryEdit updates only the targeted entry", () => {
    const before = [mkCat("a"), mkCat("b")];
    const next = categoryEdit(before, "a", {
      label: "Alpha",
      color: "#FF3B30",
      icon: "y",
    });
    expect(next[0].label).toBe("Alpha");
    expect(next[0].color).toBe("#FF3B30");
    expect(next[1]).toBe(before[1]);
  });

  it("categoryReorder moves an item from->to", () => {
    const next = categoryReorder(
      [mkCat("a"), mkCat("b"), mkCat("c")],
      0,
      2,
    );
    expect(next.map((c) => c.id)).toEqual(["b", "c", "a"]);
  });

  it("categoryReorder is a no-op when from === to", () => {
    const before = [mkCat("a"), mkCat("b")];
    expect(categoryReorder(before, 1, 1)).toBe(before);
  });

  it("categoryDelete uncategorizes its todos (never bins them) and removes the category", () => {
    const cats = [mkCat("home"), mkCat("work")];
    const todos = [
      newTodo({ text: "h1", priority: "low", dueDate: "", category: "home" }),
      newTodo({ text: "w1", priority: "low", dueDate: "", category: "work" }),
    ];
    const result = categoryDelete(todos, cats, "home");
    expect(result.deleted).toBe(true);
    expect(result.categories.map((c) => c.id)).toEqual(["work"]);
    // h1 stays open, just without a category; w1 untouched.
    const h1 = result.todos.find((t) => t.text === "h1")!;
    expect(h1.trashed).toBe(false);
    expect(h1.done).toBe(false);
    expect(h1.category).toBeUndefined();
    expect(result.todos.find((t) => t.text === "w1")).toBe(todos[1]);
  });

  it("categoryDelete refuses to delete the last remaining category", () => {
    const cats = [mkCat("solo")];
    const result = categoryDelete([], cats, "solo");
    expect(result.deleted).toBe(false);
    expect(result.categories).toBe(cats);
  });
});

// ---- Series helpers (multi-instance recurrence) --------------------------

describe("series helpers", () => {
  function mkSeriesTodo(
    seriesId: string,
    dueDate: string,
    overrides: Partial<Todo> & { id: string },
  ): Todo {
    return {
      ...newTodo({ text: "weekly chore", priority: "low", dueDate }),
      seriesId,
      ...overrides,
    };
  }

  it("todoApplySeriesFutureEdits updates text+priority on future siblings only", () => {
    const todos = [
      mkSeriesTodo("s1", "2026-05-01", { id: "past" }),
      mkSeriesTodo("s1", "2026-05-15", { id: "target" }),
      mkSeriesTodo("s1", "2026-05-22", { id: "future" }),
      mkSeriesTodo("s2", "2026-05-15", { id: "other-series" }),
    ];
    const result = todoApplySeriesFutureEdits(todos, "target", {
      text: "renamed",
      priority: "high",
    });
    expect(result.affected).toBe(1); // future only
    expect(result.next.find((t) => t.id === "past")?.text).toBe("weekly chore");
    expect(result.next.find((t) => t.id === "target")?.text).toBe("weekly chore");
    expect(result.next.find((t) => t.id === "future")?.text).toBe("renamed");
    expect(result.next.find((t) => t.id === "future")?.priority).toBe("high");
    expect(result.next.find((t) => t.id === "other-series")?.text).toBe(
      "weekly chore",
    );
  });

  it("todoApplySeriesFutureEdits is a no-op when target has no seriesId", () => {
    const todos = [newTodo({ text: "lone", priority: "low", dueDate: "" })];
    const result = todoApplySeriesFutureEdits(todos, todos[0].id, {
      text: "renamed",
    });
    expect(result.affected).toBe(0);
    expect(result.next).toBe(todos);
  });

  it("todoMoveToTrashFutureSeries trashes target + future siblings, leaves past", () => {
    const todos = [
      mkSeriesTodo("s1", "2026-05-01", { id: "past" }),
      mkSeriesTodo("s1", "2026-05-15", { id: "target" }),
      mkSeriesTodo("s1", "2026-05-22", { id: "future" }),
    ];
    const result = todoMoveToTrashFutureSeries(todos, "target");
    expect(result.affected).toBe(2);
    expect(result.next.find((t) => t.id === "past")?.trashed).toBe(false);
    expect(result.next.find((t) => t.id === "target")?.trashed).toBe(true);
    expect(result.next.find((t) => t.id === "future")?.trashed).toBe(true);
  });

  it("todoMoveToTrashFutureSeries falls back to single-todo trash when no seriesId", () => {
    const todos = [newTodo({ text: "lone", priority: "low", dueDate: "" })];
    const result = todoMoveToTrashFutureSeries(todos, todos[0].id);
    expect(result.affected).toBe(1);
    expect(result.next[0].trashed).toBe(true);
  });
});

// ---- todoReferences (compose-sheet suggestion history) ------------------

describe("todoReferences", () => {
  it("recordTodoReference dedupes by lowercased text and prefers latest values", () => {
    const ref1 = recordTodoReference([], { text: "Buy milk", priority: "medium" });
    expect(ref1).toHaveLength(1);
    const ref2 = recordTodoReference(ref1, {
      text: "buy milk", // same textLower
      priority: "high",
      category: "home",
    });
    expect(ref2).toHaveLength(1);
    expect(ref2[0].priority).toBe("high");
    expect(ref2[0].category).toBe("home");
  });

  it("recordTodoReference puts the most-recent entry at the head", () => {
    let refs = recordTodoReference([], { text: "Milk", priority: "low" });
    refs = recordTodoReference(refs, { text: "Eggs", priority: "low" });
    expect(refs.map((r) => r.text)).toEqual(["Eggs", "Milk"]);
    refs = recordTodoReference(refs, { text: "Milk", priority: "low" });
    expect(refs.map((r) => r.text)).toEqual(["Milk", "Eggs"]);
  });

  it("recordTodoReference enforces MAX_TODO_REFERENCES via LRU eviction", () => {
    let refs: ReturnType<typeof recordTodoReference> = [];
    for (let i = 0; i < MAX_TODO_REFERENCES + 50; i++) {
      refs = recordTodoReference(refs, { text: `item-${i}`, priority: "low" });
    }
    expect(refs.length).toBe(MAX_TODO_REFERENCES);
    expect(refs[0].text).toBe(`item-${MAX_TODO_REFERENCES + 49}`);
  });

  it("recordTodoReference ignores empty / whitespace-only text", () => {
    expect(recordTodoReference([], { text: "", priority: "low" })).toEqual([]);
    expect(recordTodoReference([], { text: "   ", priority: "low" })).toEqual([]);
  });

  it("migrateTodoReferences drops malformed entries and sorts by recency desc", () => {
    const raw = [
      { text: "old", priority: "low", lastSeenAt: 100 },
      { text: "new", priority: "low", lastSeenAt: 300 },
      { text: "mid", priority: "low", lastSeenAt: 200 },
      null,
      { text: "" }, // empty text — dropped
      "garbage",
    ];
    const out = migrateTodoReferences(raw);
    expect(out.map((r) => r.text)).toEqual(["new", "mid", "old"]);
  });
});

// ---- Recurrence math edge cases ----------------------------------------

describe("recurrence math", () => {
  it("nextOccurrence: daily +N", () => {
    expect(nextOccurrence("2026-05-13", "daily", 1)).toBe("2026-05-14");
    expect(nextOccurrence("2026-05-13", "daily", 7)).toBe("2026-05-20");
  });

  it("nextOccurrence: weekly +N", () => {
    expect(nextOccurrence("2026-05-13", "weekly", 1)).toBe("2026-05-20");
    expect(nextOccurrence("2026-05-13", "weekly", 2)).toBe("2026-05-27");
  });

  it("nextOccurrence: monthly", () => {
    expect(nextOccurrence("2026-01-15", "monthly", 1)).toBe("2026-02-15");
  });

  it("nextOccurrence: yearly", () => {
    expect(nextOccurrence("2026-05-13", "yearly", 1)).toBe("2027-05-13");
  });

  it("nextOccurrence: monthly day-of-month CLAMPS to the target month's last day", () => {
    // Jan 31 + 1 month: the target month (Feb, 28 days in non-leap 2026) has no
    // 31st, so we clamp to Feb 28 — the conventional rrule behavior. Previously
    // JS Date.setMonth overflowed "Feb 31" to Mar 3 and then advanced from the
    // 3rd forever, permanently drifting a monthly-on-the-31st recurrence.
    expect(nextOccurrence("2026-01-31", "monthly", 1)).toBe("2026-02-28");
  });

  it("nextOccurrence: yearly Feb 29 clamps to Feb 28 in a non-leap year", () => {
    // Same clamp as the monthly case: 2025 is non-leap, so Feb 29 → Feb 28
    // (was Mar 1 under the old setFullYear overflow).
    expect(nextOccurrence("2024-02-29", "yearly", 1)).toBe("2025-02-28");
  });

  it("nextOccurrence: weekly with byWeekday picks the next matching weekday", () => {
    // 2026-05-13 is Wed (day 3). byWeekday=[5] (Friday).
    expect(nextOccurrence("2026-05-13", "weekly", 1, [5])).toBe("2026-05-15");
  });

  it("expandRecurrence: enumerates dates between dueDate and endDate inclusive", () => {
    const dates = expandRecurrence("2026-05-13", "2026-06-03", {
      freq: "weekly",
    });
    expect(dates).toEqual([
      "2026-05-13",
      "2026-05-20",
      "2026-05-27",
      "2026-06-03",
    ]);
  });

  it("expandRecurrence: caps at MAX_RECURRENCE_INSTANCES", () => {
    const dates = expandRecurrence("2026-01-01", "2999-01-01", {
      freq: "daily",
    });
    expect(dates.length).toBeLessThanOrEqual(MAX_RECURRENCE_INSTANCES);
  });
});

// ---- Grocery helpers ----------------------------------------------------

describe("grocery helpers", () => {
  function mkItem(text: string) {
    return newGroceryItem({ text });
  }

  it("newGroceryItem starts unchecked with addedAt", () => {
    const item = mkItem("Milk");
    expect(item.checked).toBe(false);
    expect(item.text).toBe("Milk");
    expect(item.addedAt).toBeTypeOf("number");
  });

  it("groceryToggleChecked flips checked and stamps checkedAt", () => {
    const items = [mkItem("Milk")];
    const after = groceryToggleChecked(items, items[0].id);
    expect(after[0].checked).toBe(true);
    expect(after[0].checkedAt).toBeTypeOf("number");
  });

  it("groceryToggleChecked back to unchecked clears checkedAt and refreshes addedAt", () => {
    const items = [mkItem("Milk")];
    const checked = groceryToggleChecked(items, items[0].id);
    const unchecked = groceryToggleChecked(checked, items[0].id);
    expect(unchecked[0].checked).toBe(false);
    expect(unchecked[0].checkedAt).toBeUndefined();
    expect(unchecked[0].addedAt).toBeGreaterThanOrEqual(items[0].addedAt);
    // Re-add must preserve the purchase log so frequency counting
    // survives across buy → re-add → buy cycles.
    expect(unchecked[0].purchases).toHaveLength(1);
  });

  it("groceryToggleChecked prepends a timestamp to purchases on each check-off", () => {
    let items: ReturnType<typeof mkItem>[] = [mkItem("Milk")];
    const id = items[0].id;
    for (let i = 0; i < 3; i++) {
      items = groceryToggleChecked(items, id);
      items = groceryToggleChecked(items, id);
    }
    items = groceryToggleChecked(items, id); // 4th check-off, leaves it checked
    expect(items[0].purchases).toHaveLength(4);
    // Newest first.
    const ts = items[0].purchases!;
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i - 1]).toBeGreaterThanOrEqual(ts[i]);
    }
  });

  it("groceryToggleChecked caps purchases at MAX_GROCERY_PURCHASES", () => {
    let items = [mkItem("Bread")];
    const id = items[0].id;
    for (let i = 0; i < MAX_GROCERY_PURCHASES + 5; i++) {
      items = groceryToggleChecked(items, id); // check
      if (items[0].checked) items = groceryToggleChecked(items, id); // re-add (except last)
    }
    expect(items[0].purchases!.length).toBeLessThanOrEqual(MAX_GROCERY_PURCHASES);
  });

  it("groceryEdit applies a partial patch", () => {
    const items = [mkItem("Milk")];
    const after = groceryEdit(items, items[0].id, { text: "Whole Milk" });
    expect(after[0].text).toBe("Whole Milk");
  });

  it("groceryDelete removes the matching item", () => {
    const items = [mkItem("a"), mkItem("b")];
    const after = groceryDelete(items, items[0].id);
    expect(after).toHaveLength(1);
    expect(after[0].text).toBe("b");
  });

  it("migrateGroceries rejects non-array input", () => {
    expect(migrateGroceries(null)).toEqual([]);
    expect(migrateGroceries({})).toEqual([]);
  });

  it("migrateGroceries caps at MAX_GROCERY_ITEMS", () => {
    const huge = Array.from({ length: MAX_GROCERY_ITEMS + 50 }, (_, i) => ({
      id: `g-${i}`,
      text: `item-${i}`,
      addedAt: Date.now(),
    }));
    expect(migrateGroceries(huge).length).toBeLessThanOrEqual(MAX_GROCERY_ITEMS);
  });

  it("migrateGroceries reads a valid purchases array, drops bad entries, caps and sorts desc", () => {
    const out = migrateGroceries([
      {
        id: "g-1",
        text: "Milk",
        groupId: "dairy",
        addedAt: 1000,
        purchases: [3, 1, "bogus", null, 2, -5, 0],
      },
    ]);
    expect(out[0].purchases).toEqual([3, 2, 1]);
  });

  it("migrateGroceries keeps checkedAt but does not invent a purchases log", () => {
    const out = migrateGroceries([
      {
        id: "g-1",
        text: "Milk",
        groupId: "dairy",
        addedAt: 1000,
        checked: true,
        checkedAt: 42,
      },
    ]);
    expect(out[0].checkedAt).toBe(42);
    expect(out[0].purchases).toBeUndefined();
  });

  it("migrateGroceries does not backfill when there's no checkedAt", () => {
    const out = migrateGroceries([
      { id: "g-1", text: "Milk", groupId: "dairy", addedAt: 1000 },
    ]);
    expect(out[0].purchases).toBeUndefined();
  });

  it("frequentGroceries returns items with ≥ threshold check-offs within the window", () => {
    const now = 10_000_000;
    const inWindow = now - 1000;
    const outsideWindow = now - FREQUENT_GROCERY_WINDOW_MS - 1000;
    const items = [
      // Qualifies: 5 in-window check-offs.
      { ...mkItem("Bananas"), purchases: Array(5).fill(inWindow) },
      // Doesn't qualify: 5 check-offs, all stale.
      { ...mkItem("Salt"), purchases: Array(5).fill(outsideWindow) },
      // Doesn't qualify: only 4 in-window.
      { ...mkItem("Olives"), purchases: Array(4).fill(inWindow) },
      // No log at all — should not qualify or throw.
      mkItem("Mystery"),
    ];
    const out = frequentGroceries(items, { now });
    expect(out.map((i) => i.text)).toEqual(["Bananas"]);
  });

  it("frequentGroceries ranks by in-window count desc, then by latest timestamp", () => {
    const now = 10_000_000;
    const t = (n: number) => now - n;
    const items = [
      { ...mkItem("Bread"), purchases: [t(1), t(2), t(3), t(4), t(5)] },          // count 5
      { ...mkItem("Eggs"),  purchases: [t(100), t(200), t(300), t(400), t(500), t(600)] }, // count 6
      { ...mkItem("Apples"), purchases: [t(50), t(60), t(70), t(80), t(90)] },    // count 5, older latest than Bread
    ];
    const out = frequentGroceries(items, { now, minCount: FREQUENT_GROCERY_MIN_COUNT });
    expect(out.map((i) => i.text)).toEqual(["Eggs", "Bread", "Apples"]);
  });
});

describe("formatRecurrence interval", () => {
  it("weekly with byWeekday honors interval > 1", () => {
    expect(formatRecurrence({ freq: "weekly", byWeekday: [2, 4] })).toBe("Weekly · Tue, Thu");
    expect(
      formatRecurrence({ freq: "weekly", interval: 2, byWeekday: [2, 4] }),
    ).toBe("Every 2 weeks · Tue, Thu");
  });
  it("monthly with byWeekday honors interval > 1", () => {
    expect(
      formatRecurrence({ freq: "monthly", interval: 3, byWeekday: [1], bySetPos: [1] }),
    ).toBe("Every 3 months · 1st Mon");
  });
  it("plain frequencies still honor interval", () => {
    expect(formatRecurrence({ freq: "daily", interval: 2 })).toBe("Every 2 days");
    expect(formatRecurrence({ freq: "weekly" })).toBe("Weekly");
  });
});

describe("migrateTodos preserves series + reminders (regression)", () => {
  it("keeps seriesId, detachedFromSeries, status, and reminders[] across migrate", () => {
    const raw = [{
      id: "t1",
      text: "walk dog",
      priority: "medium",
      dueDate: "2026-06-15",
      done: false,
      trashed: false,
      recurrence: { freq: "weekly", byWeekday: [1, 3, 5] },
      seriesId: "series-abc",
      detachedFromSeries: true,
      status: "notDo",
      reminders: [
        { id: "r1", at: "2026-06-15T09:00" },
        { id: "r2", at: "2026-06-15T08:45", offsetMinutes: 15 },
      ],
    }];
    const [out] = migrateTodos(raw);
    expect(out.seriesId).toBe("series-abc");
    expect(out.detachedFromSeries).toBe(true);
    expect(out.status).toBe("notDo");
    expect(out.reminders).toHaveLength(2);
    expect(out.reminders!.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
  });
  it("assigns a seriesId to a recurring todo that lacks one", () => {
    const raw = [{
      id: "t2", text: "x", priority: "low", dueDate: "2026-06-15", done: false, trashed: false,
      recurrence: { freq: "daily" },
    }];
    const [out] = migrateTodos(raw);
    expect(out.seriesId).toBeTruthy();
  });
  it("does not invent a seriesId for a non-recurring todo", () => {
    const raw = [{ id: "t3", text: "x", priority: "low", dueDate: "", done: false, trashed: false }];
    const [out] = migrateTodos(raw);
    expect(out.seriesId).toBeUndefined();
  });
});

describe("todoSkipSeriesFuture", () => {
  const mk = (id: string, seriesId: string, dueDate: string) => ({
    ...newTodo({ text: id, priority: "medium" as const, dueDate }),
    id,
    seriesId,
    recurrence: { freq: "daily" as const },
  });
  it("skips this + future siblings, leaves past ones", () => {
    const todos = [
      mk("a", "s1", "2026-06-01"), // past
      mk("b", "s1", "2026-06-10"), // target
      mk("c", "s1", "2026-06-11"), // future
      mk("d", "s2", "2026-06-11"), // other series
    ];
    const { next, affected } = todoSkipSeriesFuture(todos, "b");
    expect(affected).toBe(2);
    const byId = Object.fromEntries(next.map((t) => [t.id, t]));
    expect(byId.a.trashed).toBe(false); // past untouched
    expect(byId.b.status).toBe("notDo");
    expect(byId.b.trashed).toBe(true);
    expect(byId.c.status).toBe("notDo");
    expect(byId.d.trashed).toBe(false); // other series untouched
  });
  it("falls back to single skip for a one-off (no seriesId)", () => {
    const t = newTodo({ text: "x", priority: "low", dueDate: "2026-06-10" });
    const { next, affected } = todoSkipSeriesFuture([t], t.id);
    expect(affected).toBe(1);
    expect(next[0].status).toBe("notDo");
  });
});

describe("todoPermanentlyDeleteSeriesFuture", () => {
  const mk = (id: string, seriesId: string, dueDate: string) => ({
    ...newTodo({ text: id, priority: "medium" as const, dueDate }),
    id,
    seriesId,
  });
  it("hard-removes this + future siblings, keeps past + other series", () => {
    const todos = [
      mk("a", "s1", "2026-06-01"), // past — kept
      mk("b", "s1", "2026-06-10"), // target — removed
      mk("c", "s1", "2026-06-12"), // future — removed
      mk("d", "s2", "2026-06-12"), // other series — kept
    ];
    const out = todoPermanentlyDeleteSeriesFuture(todos, "b");
    expect(out.map((t) => t.id).sort()).toEqual(["a", "d"]);
  });
  it("falls back to single delete for a one-off", () => {
    const t = newTodo({ text: "x", priority: "low", dueDate: "" });
    expect(todoPermanentlyDeleteSeriesFuture([t], t.id)).toHaveLength(0);
  });
});

describe("todoSetRecurrence assigns seriesId", () => {
  it("adding a recurrence to a plain todo gives it a seriesId", () => {
    const td = newTodo({ text: "walk dog", priority: "medium", dueDate: "2026-06-15" });
    expect(td.seriesId).toBeUndefined();
    const [next] = todoSetRecurrence([td], td.id, { freq: "weekly", byWeekday: [1, 3, 5] });
    expect(next.recurrence).toBeTruthy();
    expect(next.seriesId).toBeTruthy();
  });
  it("preserves an existing seriesId", () => {
    const td = { ...newTodo({ text: "x", priority: "low", dueDate: "" }), seriesId: "keep-me" };
    const [next] = todoSetRecurrence([td], td.id, { freq: "daily" });
    expect(next.seriesId).toBe("keep-me");
  });
  it("removing a recurrence clears the recurrence field", () => {
    const td = { ...newTodo({ text: "x", priority: "low", dueDate: "" }), recurrence: { freq: "daily" as const }, seriesId: "s1" };
    const [next] = todoSetRecurrence([td], td.id, undefined);
    expect(next.recurrence).toBeUndefined();
  });
});

describe("normalizeSuggestedReminder", () => {
  it("drops a >=1-day interval when a recurrence is present", () => {
    const out = normalizeSuggestedReminder(
      { freq: "weekly" },
      { at: "2026-06-15T09:00", intervalMinutes: 10080, until: "2026-12-31T09:00" },
    );
    expect(out).toEqual({ at: "2026-06-15T09:00" });
  });
  it("keeps a sub-daily interval (legit within an occurrence)", () => {
    const r = { at: "2026-06-15T09:00", intervalMinutes: 120, until: "2026-06-15T17:00" };
    expect(normalizeSuggestedReminder({ freq: "daily" }, r)).toEqual(r);
  });
  it("leaves a fixed reminder untouched", () => {
    const r = { at: "2026-06-15T09:00" };
    expect(normalizeSuggestedReminder({ freq: "weekly" }, r)).toEqual(r);
  });
  it("no-op without a recurrence (keeps the interval)", () => {
    const r = { at: "2026-06-15T09:00", intervalMinutes: 10080 };
    expect(normalizeSuggestedReminder(null, r)).toEqual(r);
  });
  it("returns null for a null reminder", () => {
    expect(normalizeSuggestedReminder({ freq: "weekly" }, null)).toBeNull();
  });
});

describe("reminder dedup", () => {
  const r = (
    id: string,
    at: string,
    extra?: Partial<{ offsetMinutes: number; intervalMinutes: number }>,
  ) => ({ id, at, ...extra });
  it("dedupeReminders drops same at/offset/interval, keeps first", () => {
    const out = dedupeReminders([
      r("a", "2026-06-08T09:00"),
      r("b", "2026-06-08T09:00"), // dup of a
      r("c", "2026-06-08T08:45", { offsetMinutes: 15 }),
    ]);
    expect(out.map((x) => x.id)).toEqual(["a", "c"]);
  });
  it("keeps distinct cadences at the same time", () => {
    const out = dedupeReminders([
      r("a", "2026-06-08T09:00"),
      r("b", "2026-06-08T09:00", { intervalMinutes: 60 }),
    ]);
    expect(out).toHaveLength(2);
  });
  it("getReminders dedupes the stored array", () => {
    const td = newTodo({ text: "walk dog", priority: "medium", dueDate: "" });
    td.reminders = [r("a", "2026-06-08T09:00"), r("b", "2026-06-08T09:00")];
    expect(getReminders(td)).toHaveLength(1);
  });
});
