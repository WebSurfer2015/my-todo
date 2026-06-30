/**
 * Tests for core/src/store/createTodoStore.ts — the orchestration factory
 * (task #4, phase 4c). Confirms the pure action surface + coordinators are
 * exposed and that derive produces derived state. Hosted under web's
 * Vitest (web -> core, allowed direction).
 */
import { describe, expect, it } from "vitest";
import { createTodoStore } from "../../core/src/store";
import { strings } from "../../core/src/data/i18n";
import { newTodo } from "../../core/src/logic/derive";
import type { StoreDeps } from "../../core/src/store";

const deps: StoreDeps = { now: () => 0, genId: () => "fixed-id", t: strings.en };
const store = createTodoStore(deps);

describe("createTodoStore", () => {
  it("exposes pure todo transforms that operate on passed-in state", () => {
    const todos = [newTodo({ text: "a", priority: "medium", dueDate: "" })];
    const toggled = store.actions.todoToggle(todos, todos[0].id);
    expect(toggled[0].done).toBe(true);
    // pure: original input untouched
    expect(todos[0].done).toBe(false);
  });

  it("exposes the cross-slice coordinators", () => {
    expect(typeof store.actions.deleteCategoryCascade).toBe("function");
    expect(typeof store.actions.toggleOutcome).toBe("function");
  });

  it("exposes helpers spread from every transform module", () => {
    expect(typeof store.actions.groceryGroupAdd).toBe("function"); // groceries
    expect(typeof store.actions.togglePinnedFilter).toBe("function"); // filters
    expect(typeof store.actions.statusRename).toBe("function"); // statuses
    expect(typeof store.actions.priorityReorder).toBe("function"); // priorities
    expect(typeof store.actions.applyBulkRestore).toBe("function"); // selection
  });

  it("derive returns platform-agnostic derived state", () => {
    const derived = store.derive({ todos: [], filters: [], categories: [], t: strings.en });
    expect(derived).toBeTruthy();
    expect(Array.isArray(derived.groups)).toBe(true);
  });

  it("carries the injected deps", () => {
    expect(store.deps.now()).toBe(0);
    expect(store.deps.genId()).toBe("fixed-id");
  });
});
