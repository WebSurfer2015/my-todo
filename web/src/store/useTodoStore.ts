import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Category, Filter, Priority, Todo } from "../core-bindings/types";
import {
  CategoryDef,
  SEED_CATEGORIES,
  migrateCategory,
  categoryLabel,
} from "../core-bindings/categories";
import { Profile, SEED_PROFILE, migrateProfile } from "../core-bindings/profile";
import {
  toggleSelection,
  applyBulkRestore,
  applyBulkDelete,
} from "../core-bindings/selection";
import { useLang } from "../app/LangContext";
import { useNotify } from "../app/notify";
import { useAuth } from "../app/AuthContext";
import { storage as localAdapter } from "../adapters/persistence";
import { db } from "../adapters/firebase";
import { makeFirestoreAdapter } from "../adapters/firestoreAdapter";
import { useSyncedState } from "./useSyncedState";
import { StorageAdapter } from "../../../core/src/ports/persistence";
import {
  newTodo,
  todoToggle,
  todoMoveToTrash,
  todoRestoreFromTrash,
  todoPermanentlyDelete,
  todoEmptyTrash,
  todoClearDone,
  todoSet,
  migrateTodos,
  subtaskAdd,
  subtaskToggle,
  subtaskUpdateText,
  subtaskUpdatePriority,
  subtaskUpdateDueDate,
  subtaskRemove,
  subtaskClearAll,
  categoryAdd,
  categoryEdit,
  categoryReorder,
  deriveState,
} from "../../../core/src/logic/derive";
import { deleteCategoryCascade } from "../../../core/src/store";
import { newCategoryId } from "../../../core/src/data/categories";
import { vibrate } from "../../../core/src/logic/utils";

const SCHEMA_VERSION = 1;

function unwrap(raw: string | null): unknown {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "version" in parsed &&
      "data" in parsed
    ) {
      return (parsed as { data: unknown }).data;
    }
    return parsed;
  } catch {
    return null;
  }
}

function wrap(data: unknown): string {
  return JSON.stringify({ version: SCHEMA_VERSION, data });
}

const parseCategories = (raw: string | null): CategoryDef[] => {
  const data = unwrap(raw);
  if (!Array.isArray(data) || data.length === 0) return SEED_CATEGORIES;
  return (data as Array<Partial<CategoryDef> & { id: string }>).map(
    migrateCategory,
  );
};

const parseTodos = (raw: string | null): Todo[] => migrateTodos(unwrap(raw));

const parseProfile = (raw: string | null): Profile => {
  const data = unwrap(raw);
  return data ? migrateProfile(data) : SEED_PROFILE;
};

const serializeAny = (v: unknown): string => wrap(v);

import { migrateLocalToCloud as coreMigrateLocalToCloud } from "../../../core/src/store";

/**
 * Local→cloud migration on first sign-in. Delegates to the shared,
 * unit-tested core helper (core/src/store/migration.ts) so web + mobile
 * share ONE implementation of the per-key data-bleed guard. `localAdapter`
 * is web's localStorage-backed StorageAdapter; the helper only reads it.
 * Web migrates the shared three keys (the helper's default set).
 */
function migrateLocalToCloud(adapter: StorageAdapter): Promise<string[]> {
  return coreMigrateLocalToCloud(adapter, localAdapter);
}

export function useTodoStore() {
  const { t } = useLang();
  const notify = useNotify();
  const { user } = useAuth();

  // Memoize on uid (not the User object) so token refresh — which replaces
  // the User reference ~hourly — doesn't recreate the adapter, tear down
  // Firestore listeners, and re-fire migrateLocalToCloud.
  const uid = user?.uid ?? null;
  const adapter = useMemo<StorageAdapter>(
    () => (uid ? makeFirestoreAdapter(db, uid) : localAdapter),
    [uid],
  );

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    migrateLocalToCloud(adapter).catch((err) => {
      if (!cancelled) console.warn("Local→cloud migration failed:", err);
    });
    return () => {
      cancelled = true;
    };
  }, [uid, adapter]);

  // Track the most recent successful adapter.setItem across any synced key so
  // the UI can show "Saved · just now" — anxiety-friendly auto-save signal.
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const onSaved = useCallback((ts: number) => setLastSavedAt(ts), []);

  const [categories, setCategories, categoriesLoaded] = useSyncedState<
    CategoryDef[]
  >(adapter, "categories", SEED_CATEGORIES, parseCategories, serializeAny, onSaved);
  const [todos, setTodos, todosLoaded] = useSyncedState<Todo[]>(
    adapter,
    "todos",
    [],
    parseTodos,
    serializeAny,
    onSaved,
  );
  const [profile, setProfile, profileLoaded] = useSyncedState<Profile>(
    adapter,
    "profile",
    SEED_PROFILE,
    parseProfile,
    serializeAny,
    onSaved,
  );

  const [filter, setFilter] = useState<Filter>("all");
  const [selectedTrashIds, setSelectedTrashIds] = useState<Set<string>>(
    new Set(),
  );
  const lastSelectedRef = useRef<string | null>(null);
  const todosRef = useRef(todos);
  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);

  useEffect(() => {
    if (filter !== "trash" && selectedTrashIds.size > 0) {
      setSelectedTrashIds(new Set());
      lastSelectedRef.current = null;
    }
  }, [filter, selectedTrashIds.size]);

  const loaded = categoriesLoaded && todosLoaded && profileLoaded;

  // ---- Stable callbacks (passed to React.memo'd TaskItem) ----

  const toggle = useCallback(
    (id: string) => {
      vibrate();
      setTodos((prev) => todoToggle(prev, id));
    },
    [setTodos],
  );

  const restoreFromTrash = useCallback(
    (id: string) => {
      setTodos((prev) => todoRestoreFromTrash(prev, id));
    },
    [setTodos],
  );

  const moveToTrash = useCallback(
    (id: string) => {
      setTodos((prev) => todoMoveToTrash(prev, id));
      notify.showSnackbar({
        message: t.movedToTrash,
        actionLabel: t.undo,
        onAction: () => restoreFromTrash(id),
      });
    },
    [setTodos, notify, t, restoreFromTrash],
  );

  const permanentlyDelete = useCallback(
    (id: string) => {
      setTodos((prev) => todoPermanentlyDelete(prev, id));
    },
    [setTodos],
  );

  const updatePriority = useCallback(
    (id: string, priority: Priority) => {
      setTodos((prev) => todoSet(prev, id, "priority", priority));
    },
    [setTodos],
  );

  const updateDueDate = useCallback(
    (id: string, dueDate: string) => {
      setTodos((prev) => todoSet(prev, id, "dueDate", dueDate));
    },
    [setTodos],
  );

  const updateTaskCategory = useCallback(
    (id: string, category: Category) => {
      setTodos((prev) => todoSet(prev, id, "category", category));
    },
    [setTodos],
  );

  const updateText = useCallback(
    (id: string, text: string) => {
      setTodos((prev) => todoSet(prev, id, "text", text));
    },
    [setTodos],
  );

  const addSubtask = useCallback(
    (id: string, text: string, priority?: Priority, dueDate?: string) => {
      setTodos((prev) => subtaskAdd(prev, id, text, priority, dueDate));
    },
    [setTodos],
  );

  const toggleSubtask = useCallback(
    (id: string, subId: string) => {
      vibrate();
      setTodos((prev) => subtaskToggle(prev, id, subId));
    },
    [setTodos],
  );

  const updateSubtaskText = useCallback(
    (id: string, subId: string, text: string) => {
      setTodos((prev) => subtaskUpdateText(prev, id, subId, text));
    },
    [setTodos],
  );

  const updateSubtaskPriority = useCallback(
    (id: string, subId: string, priority: Priority) => {
      setTodos((prev) => subtaskUpdatePriority(prev, id, subId, priority));
    },
    [setTodos],
  );

  const updateSubtaskDueDate = useCallback(
    (id: string, subId: string, dueDate: string) => {
      setTodos((prev) => subtaskUpdateDueDate(prev, id, subId, dueDate));
    },
    [setTodos],
  );

  const removeSubtask = useCallback(
    (id: string, subId: string) => {
      setTodos((prev) => subtaskRemove(prev, id, subId));
    },
    [setTodos],
  );

  const clearSubtasks = useCallback(
    (id: string) => {
      setTodos((prev) => subtaskClearAll(prev, id));
    },
    [setTodos],
  );

  const toggleTrashSelection = useCallback((id: string, shiftKey: boolean) => {
    const orderedIds = todosRef.current
      .filter((td) => td.trashed)
      .map((td) => td.id);
    const lastSelected = lastSelectedRef.current;
    setSelectedTrashIds((prev) =>
      toggleSelection({ prev, id, shiftKey, lastSelected, orderedIds }),
    );
    lastSelectedRef.current = id;
  }, []);

  // ---- Non-stable mutations ----

  function addTask(
    text: string,
    priority: Priority,
    dueDate: string,
    category: Category,
  ) {
    setTodos((prev) => [
      newTodo({ text, priority, dueDate, category }),
      ...prev,
    ]);
  }

  function clearTrashSelection() {
    setSelectedTrashIds(new Set());
    lastSelectedRef.current = null;
  }

  async function emptyTrash() {
    const trashCount = todosRef.current.filter((td) => td.trashed).length;
    if (trashCount === 0) return;
    const ok = await notify.confirm({
      title: t.emptyTrash,
      message: t.emptyTrashConfirm(trashCount),
      confirmLabel: t.emptyTrash,
      cancelLabel: t.cancel,
      variant: "danger",
    });
    if (!ok) return;
    setTodos(todoEmptyTrash);
    clearTrashSelection();
  }

  function bulkRestore() {
    setTodos((prev) => applyBulkRestore(prev, selectedTrashIds));
    clearTrashSelection();
  }

  async function bulkPermanentDelete() {
    const ids = selectedTrashIds;
    if (ids.size === 0) return;
    const ok = await notify.confirm({
      title: t.bulkDeletePermanently,
      message: t.bulkDeleteConfirm(ids.size),
      confirmLabel: t.bulkDeletePermanently,
      cancelLabel: t.cancel,
      variant: "danger",
    });
    if (!ok) return;
    setTodos((prev) => applyBulkDelete(prev, ids));
    clearTrashSelection();
  }

  function clearDone() {
    setTodos((prev) => todoClearDone(prev).todos);
  }

  function addCategory(data: { label: string; color: string; icon: string }) {
    setCategories((prev) => categoryAdd(prev, newCategoryId(), data));
  }

  function editCategory(
    id: string,
    data: { label: string; color: string; icon: string },
  ) {
    setCategories((prev) => categoryEdit(prev, id, data));
  }

  async function deleteCategory(id: string) {
    if (categories.length <= 1) return;
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    const target = categories.find((c) => c.id !== id);
    if (!target) return;
    const taskCount = todos.filter(
      (td) => td.category === id && !td.trashed,
    ).length;
    const message =
      taskCount > 0
        ? t.deleteCategoryConfirm(
            categoryLabel(cat, t),
            categoryLabel(target, t),
            taskCount,
          )
        : t.deleteCategoryConfirmEmpty(categoryLabel(cat, t));
    const ok = await notify.confirm({
      title: t.deleteCategoryAction,
      message,
      confirmLabel: t.deleteCategoryAction,
      cancelLabel: t.cancel,
      variant: "danger",
    });
    if (!ok) return;
    // Route through the shared cascade so every slice the delete touches
    // stays consistent: it trashes the category's todos, resets the active
    // filter off the deleted id, AND strips the ghost `cat:<id>` from every
    // pinned filter set (the bit web's old inline path missed).
    const res = deleteCategoryCascade({
      todos,
      categories,
      id,
      filter,
      pinnedFilters: profile.pinnedFilters,
    });
    if (!res.changed) return;
    setTodos(res.todos);
    setCategories(res.categories);
    if (res.filter !== null) setFilter(res.filter);
    if (res.pinnedFilters !== profile.pinnedFilters) {
      setProfile((prev) => ({ ...prev, pinnedFilters: res.pinnedFilters }));
    }
  }

  function reorderCategories(fromIdx: number, toIdx: number) {
    setCategories((prev) => categoryReorder(prev, fromIdx, toIdx));
  }

  // ---- Derived state (memoized via core.deriveState) ----

  // Web hasn't migrated to multi-select yet — wrap the single filter
  // as a one-element array (or empty for 'all') to satisfy the new
  // DeriveInput shape. The multi-select UI lives on mobile first;
  // mirror here when web picks it up.
  const filters: Filter[] = filter === 'all' ? [] : [filter];
  const derived = useMemo(
    () => deriveState({ todos, filters, categories, t }),
    [todos, filters, categories, t],
  );

  const hour = new Date().getHours();
  const greetingKey: "morning" | "afternoon" | "evening" =
    hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  // App title is derived from firstName ("Alex's todo"); falls back to legacy
  // profile.name for older accounts that have no firstName, then to t.title.
  const titleName =
    profile.firstName?.trim() || profile.name.trim();
  const appTitle = titleName ? t.ownerTitle(titleName) : t.title;

  return {
    categories,
    todos,
    filter,
    profile,
    selectedTrashIds,
    loaded,
    lastSavedAt,
    ...derived,
    counts: {
      ...derived.systemCounts,
      byCategory: Object.fromEntries(
        categories.map((c) => [
          c.id,
          {
            open: derived.byCategoryOpen[c.id] ?? 0,
            total: derived.byCategoryTotal[c.id] ?? 0,
          },
        ]),
      ),
    },
    greetingKey,
    appTitle,
    setFilter,
    saveProfile: setProfile,
    addTask,
    toggle,
    moveToTrash,
    restoreFromTrash,
    permanentlyDelete,
    emptyTrash,
    toggleTrashSelection,
    clearTrashSelection,
    bulkRestore,
    bulkPermanentDelete,
    clearDone,
    updatePriority,
    updateDueDate,
    updateTaskCategory,
    updateText,
    addSubtask,
    toggleSubtask,
    updateSubtaskText,
    updateSubtaskPriority,
    updateSubtaskDueDate,
    removeSubtask,
    clearSubtasks,
    addCategory,
    editCategory,
    deleteCategory,
    reorderCategories,
  };
}
