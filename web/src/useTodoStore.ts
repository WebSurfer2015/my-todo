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
  categoryAdd,
  categoryEdit,
  categoryDelete,
  categoryReorder,
  deriveState,
} from "../../core/src/derive";
import { newCategoryId } from "../../core/src/categories";

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

/** Push local data to cloud once if cloud is empty (first-ever sign-in). */
async function migrateLocalToCloud(adapter: StorageAdapter): Promise<void> {
  const cloudProfile = await adapter.getItem("profile");
  if (cloudProfile != null) return;
  for (const key of ["todos", "categories", "profile"] as const) {
    const raw = localStorage.getItem(key);
    if (raw != null) await adapter.setItem(key, raw);
  }
}

export function useTodoStore() {
  const { t } = useLang();
  const notify = useNotify();
  const { user } = useAuth();

  const adapter = useMemo<StorageAdapter>(
    () => (user ? makeFirestoreAdapter(db, user.uid) : localAdapter),
    [user],
  );

  // Run migration once per cloud session (no-op if cloud already has data)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    migrateLocalToCloud(adapter).catch((err) => {
      if (!cancelled) console.warn("Local→cloud migration failed:", err);
    });
    return () => {
      cancelled = true;
    };
  }, [user, adapter]);

  const [categories, setCategories, categoriesLoaded] = useSyncedState<
    CategoryDef[]
  >(adapter, "categories", SEED_CATEGORIES, parseCategories, serializeAny);
  const [todos, setTodos, todosLoaded] = useSyncedState<Todo[]>(
    adapter,
    "todos",
    [],
    parseTodos,
    serializeAny,
  );
  const [profile, setProfile, profileLoaded] = useSyncedState<Profile>(
    adapter,
    "profile",
    SEED_PROFILE,
    parseProfile,
    serializeAny,
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
    setTodos(todoClearDone);
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
  const appTitle = (profile.title && profile.title.trim()) || t.title;

  return {
    categories,
    todos,
    filter,
    profile,
    selectedTrashIds,
    loaded,
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
    addCategory,
    editCategory,
    deleteCategory,
    reorderCategories,
  };
}
