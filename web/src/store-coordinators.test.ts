/**
 * Tests for core/src/store/coordinators.ts — the cross-slice
 * orchestration extracted from mobile's useTodoStore composer (task #4,
 * phase 4a). Hosted under web's Vitest (web -> core, allowed direction).
 */
import { describe, expect, it } from "vitest";
import {
  deleteCategoryCascade,
  toggleOutcome,
  reconcileTodayPebbles,
} from "../../core/src/store";
import { newTodo } from "../../core/src/derive";
import { SEED_PROFILE } from "../../core/src/profile";
import type { CategoryDef } from "../../core/src/categories";
import type { Profile } from "../../core/src/profile";
import type { Todo } from "../../core/src/types";

const cat = (id: string): CategoryDef => ({
  id,
  label: id,
  color: "#34C759",
  icon: "home",
});
const todoIn = (id: string, category: string): Todo => ({
  ...newTodo({ text: id, priority: "medium", dueDate: "" }),
  id,
  category,
});

describe("deleteCategoryCascade", () => {
  const categories = [cat("home"), cat("work")];

  it("refuses to delete the last remaining category", () => {
    const res = deleteCategoryCascade({
      todos: [],
      categories: [cat("home")],
      id: "home",
      filter: "all",
      pinnedFilters: undefined,
    });
    expect(res.changed).toBe(false);
  });

  it("drops the category and trashes its todos", () => {
    const todos = [todoIn("1", "home"), todoIn("2", "work")];
    const res = deleteCategoryCascade({
      todos,
      categories,
      id: "home",
      filter: "all",
      pinnedFilters: undefined,
    });
    expect(res.changed).toBe(true);
    expect(res.categories.map((c) => c.id)).toEqual(["work"]);
    expect(res.todos.find((t) => t.id === "1")!.trashed).toBe(true);
    expect(res.todos.find((t) => t.id === "2")!.trashed).toBe(false);
  });

  it("resets the active filter only when it targets the deleted category", () => {
    const onDeleted = deleteCategoryCascade({
      todos: [],
      categories,
      id: "home",
      filter: "cat:home",
      pinnedFilters: undefined,
    });
    expect(onDeleted.filter).toBe("all");

    const onOther = deleteCategoryCascade({
      todos: [],
      categories,
      id: "home",
      filter: "cat:work",
      pinnedFilters: undefined,
    });
    expect(onOther.filter).toBeNull(); // unrelated filter → no change
  });

  it("strips the ghost cat:<id> from pinned sets and drops emptied sets", () => {
    const res = deleteCategoryCascade({
      todos: [],
      categories,
      id: "home",
      filter: "all",
      pinnedFilters: [["cat:home", "done"], ["cat:home"], ["open"]],
    });
    expect(res.pinnedFilters).toEqual([["done"], ["open"]]);
  });

  it("leaves pinnedFilters as the same ref when none referenced the category", () => {
    const pinnedFilters = [["open"], ["done"]];
    const res = deleteCategoryCascade({
      todos: [],
      categories,
      id: "home",
      filter: "all",
      pinnedFilters,
    });
    expect(res.pinnedFilters).toBe(pinnedFilters);
  });
});

const mk = (over: Partial<Todo> = {}): Todo => ({
  ...newTodo({ text: over.text ?? "t", priority: "medium", dueDate: "" }),
  ...over,
});

describe("toggleOutcome", () => {
  it("completing an open todo earns +1 and records it as a reference", () => {
    const before = mk({ id: "a", done: false });
    const { after, delta, referenceRow } = toggleOutcome(before);
    expect(after.done).toBe(true);
    expect(delta.task).toBe(1);
    expect(referenceRow?.id).toBe("a"); // fresh completion → recorded
  });

  it("un-completing a done todo refunds -1 and records nothing", () => {
    const before = mk({ id: "a", done: true });
    const { after, delta, referenceRow } = toggleOutcome(before);
    expect(after.done).toBe(false);
    expect(delta.task).toBe(-1);
    expect(referenceRow).toBeNull();
  });
});

describe("reconcileTodayPebbles", () => {
  const today = "2026-06-03";
  const profile = (over: Partial<Profile> = {}): Profile => ({
    ...SEED_PROFILE,
    ...over,
  });

  it("bumps the stored counter up to the completed-today count when lagging", () => {
    const todos = [
      mk({ id: "1", done: true, completionDate: today }),
      mk({ id: "2", done: true, completionDate: today }),
      mk({ id: "3", done: true, completionDate: today }),
    ];
    const patch = reconcileTodayPebbles(
      profile({ pebblesDate: today, todayTaskPebbles: 1, todaySubtaskPebbles: 2 }),
      todos,
      today,
    );
    expect(patch).toEqual({
      pebblesDate: today,
      todayTaskPebbles: 3,
      todaySubtaskPebbles: 2, // subtask count preserved
    });
  });

  it("returns null when the stored counter already covers today", () => {
    const todos = [mk({ id: "1", done: true, completionDate: today })];
    const patch = reconcileTodayPebbles(
      profile({ pebblesDate: today, todayTaskPebbles: 5 }),
      todos,
      today,
    );
    expect(patch).toBeNull();
  });

  it("resets a stale day to today's derived count (subtasks zeroed)", () => {
    const todos = [mk({ id: "1", done: true, completionDate: today })];
    const patch = reconcileTodayPebbles(
      profile({ pebblesDate: "2026-06-01", todayTaskPebbles: 9, todaySubtaskPebbles: 4 }),
      todos,
      today,
    );
    expect(patch).toEqual({
      pebblesDate: today,
      todayTaskPebbles: 1,
      todaySubtaskPebbles: 0,
    });
  });

  it("ignores trashed and not-today completions", () => {
    const todos = [
      mk({ id: "1", done: true, completionDate: today, trashed: true }),
      mk({ id: "2", done: true, completionDate: "2026-06-01" }),
    ];
    const patch = reconcileTodayPebbles(
      profile({ pebblesDate: today, todayTaskPebbles: 0 }),
      todos,
      today,
    );
    expect(patch).toBeNull(); // 0 qualifying → stored 0 already correct
  });
});
