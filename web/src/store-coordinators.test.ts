/**
 * Tests for core/src/store/coordinators.ts — the cross-slice
 * orchestration extracted from mobile's useTodoStore composer (task #4,
 * phase 4a). Hosted under web's Vitest (web -> core, allowed direction).
 */
import { describe, expect, it } from "vitest";
import {
  deleteCategoryCascade,
  toggleOutcome,
} from "../../core/src/store";
import { newTodo } from "../../core/src/logic/derive";
import type { CategoryDef } from "../../core/src/data/categories";
import type { Todo } from "../../core/src/domain/types";

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
  it("completing an open todo records it as a reference", () => {
    const before = mk({ id: "a", done: false });
    const { after, referenceRow } = toggleOutcome(before);
    expect(after.done).toBe(true);
    expect(referenceRow?.id).toBe("a"); // fresh completion → recorded
  });

  it("un-completing a done todo records nothing", () => {
    const before = mk({ id: "a", done: true });
    const { after, referenceRow } = toggleOutcome(before);
    expect(after.done).toBe(false);
    expect(referenceRow).toBeNull();
  });
});
