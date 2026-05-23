import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Category, Filter, Priority, Todo } from "./types";
import {
  CategoryDef,
  SEED_CATEGORIES,
  migrateCategory,
  categoryLabel,
} from "./categories";
import { Profile, SEED_PROFILE, migrateProfile } from "./profile";
import {
  toggleSelection,
  applyBulkRestore,
  applyBulkDelete,
} from "./selection";
import { useLang } from "./LangContext";
import { useNotify } from "./notify";
import { useAuth } from "./AuthContext";
import { storage as localAdapter } from "./persistence";
import { db } from "./firebase";
import { makeFirestoreAdapter } from "./firestoreAdapter";
import { useSyncedState } from "./useSyncedState";
import { StorageAdapter } from "../../core/src/persistence";
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
  categoryDelete,
  categoryReorder,
  deriveState,
} from "../../core/src/derive";
import { newCategoryId } from "../../core/src/categories";
import { vibrate } from "../../core/src/utils";

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

/**
 * Push local data to cloud, per-key, only when that cloud key is empty.
 * Gating per-key (vs only checking `profile`) prevents wiping cloud todos or
 * categories on a device whose local copy is stale and whose cloud profile
 * happens to have been deleted or never written.
 */
async function migrateLocalToCloud(adapter: StorageAdapter): Promise<void> {
  for (const key of ["todos", "categories", "profile"] as const) {
    const cloudVal = await adapter.getItem(key);
    if (cloudVal != null) continue;
    const raw = localStorage.getItem(key);
    if (raw != null) await adapter.setItem(key, raw);
  }
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
    const next = categoryDelete(todos, categories, id);
    setTodos(next.todos);
    setCategories(next.categories);
    if (filter === `cat:${id}`) setFilter("all");
  }

  function reorderCategories(fromIdx: number, toIdx: number) {
    setCategories((prev) => categoryReorder(prev, fromIdx, toIdx));
  }

  // ---- Derived state (memoized via core.deriveState) ----

  const derived = useMemo(
    () => deriveState({ todos, filter, categories, t }),
    [todos, filter, categories, t],
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
