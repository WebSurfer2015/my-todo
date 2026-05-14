import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Category,
  Filter,
  Priority,
  Todo,
  ViewMode,
  isCategoryFilter,
  categoryIdFromFilter,
} from "./types";
import {
  CategoryDef,
  SEED_CATEGORIES,
  migrateCategory,
  newCategoryId,
} from "./categories";
import { Profile, SEED_PROFILE, migrateProfile } from "./profile";
import { useLang } from "./LangContext";
import { useAuth } from "./AuthContext";
import { useNotify } from "./notify";
import {
  toggleSelection,
  applyBulkRestore,
  applyBulkDelete,
} from "../../core/src/selection";
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
  categoryAdd,
  categoryEdit,
  categoryDelete,
  categoryReorder,
  deriveState,
} from "../../core/src/derive";

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
 * Push local AsyncStorage data to cloud, per-key, only when that cloud key is
 * empty. Per-key gating (vs only checking `profile`) prevents stomping cloud
 * todos or categories on a device whose local copy is stale and whose cloud
 * profile happens to have been deleted or never written.
 */
async function migrateLocalToCloud(adapter: StorageAdapter): Promise<void> {
  for (const key of ["todos", "categories", "profile"] as const) {
    const cloudVal = await adapter.getItem(key);
    if (cloudVal != null) continue;
    const raw = await AsyncStorage.getItem(key);
    if (raw != null) await adapter.setItem(key, raw);
  }
}

export function useTodoStore() {
  const { t } = useLang();
  const { user } = useAuth();
  const notify = useNotify();

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
  const [view, setView] = useState<ViewMode>("category");
  const [selectedTrashIds, setSelectedTrashIds] = useState<Set<string>>(
    new Set(),
  );
  const todosRef = useRef(todos);
  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);

  // Auto-clear selection when leaving trash view
  useEffect(() => {
    if (filter !== "trash" && selectedTrashIds.size > 0) {
      setSelectedTrashIds(new Set());
    }
  }, [filter, selectedTrashIds.size]);

  const loaded = categoriesLoaded && todosLoaded && profileLoaded;

  // ---- Stable callbacks ----

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

  const addSubtask = useCallback(
    (id: string, text: string, priority?: Priority, dueDate?: string) => {
      setTodos((prev) => subtaskAdd(prev, id, text, priority, dueDate));
    },
    [setTodos],
  );

  const toggleSubtask = useCallback(
    (id: string, subId: string) => {
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

  // ---- Non-stable mutations ----

  function addTask(
    text: string,
    priority: Priority,
    dueDate: string,
    category?: Category,
  ) {
    setTodos((prev) => [
      newTodo({ text, priority, dueDate, category }),
      ...prev,
    ]);
  }

  function emptyTrash() {
    if (todosRef.current.filter((td) => td.trashed).length === 0) return;
    Alert.alert(t.emptyTrash, t.deletePermanentlyConfirm(t.filters.trash), [
      { text: t.cancel, style: "cancel" },
      {
        text: t.emptyTrash,
        style: "destructive",
        onPress: () => setTodos(todoEmptyTrash),
      },
    ]);
  }

  const toggleTrashSelection = useCallback((id: string) => {
    setSelectedTrashIds((prev) =>
      toggleSelection({
        prev,
        id,
        shiftKey: false,
        lastSelected: null,
        orderedIds: [],
      }),
    );
  }, []);

  function clearTrashSelection() {
    setSelectedTrashIds(new Set());
  }

  function bulkRestore() {
    if (selectedTrashIds.size === 0) return;
    setTodos((prev) => applyBulkRestore(prev, selectedTrashIds));
    clearTrashSelection();
  }

  function bulkPermanentDelete() {
    const ids = selectedTrashIds;
    if (ids.size === 0) return;
    Alert.alert(t.bulkDeletePermanently, t.bulkDeleteConfirm(ids.size), [
      { text: t.cancel, style: "cancel" },
      {
        text: t.bulkDeletePermanently,
        style: "destructive",
        onPress: () => {
          setTodos((prev) => applyBulkDelete(prev, ids));
          clearTrashSelection();
        },
      },
    ]);
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

  function deleteCategory(id: string) {
    if (categories.length <= 1) return;
    const next = categoryDelete(todos, categories, id);
    if (next.targetId == null) return;
    setTodos(next.todos);
    setCategories(next.categories);
    if (isCategoryFilter(filter) && categoryIdFromFilter(filter) === id)
      setFilter("all");
  }

  function changeView(v: ViewMode) {
    setView(v);
    setFilter(v === "category" ? "all" : "open");
  }

  function reorderCategories(fromIdx: number, toIdx: number) {
    setCategories((prev) => categoryReorder(prev, fromIdx, toIdx));
  }

  // ---- Derived state (memoized via core.deriveState) ----

  const derived = useMemo(
    () =>
      deriveState({
        todos,
        filter,
        categories,
        t,
        options: { separateDone: false },
      }),
    [todos, filter, categories, t],
  );

  const hour = new Date().getHours();
  const greetingKey: "morning" | "afternoon" | "evening" =
    hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const headerLine =
    profile.quote && profile.quote.trim()
      ? profile.quote
      : `${t.greeting[greetingKey]}, ${profile.name}`;
  // App title is derived from firstName ("Alex's todo"); falls back to legacy
  // profile.name for older accounts that have no firstName, then to t.title.
  const titleName =
    profile.firstName?.trim() || profile.name.trim();
  const appTitle = titleName ? t.ownerTitle(titleName) : t.title;

  return {
    todos,
    categories,
    profile,
    filter,
    view,
    loaded,
    ...derived,
    byCategory: derived.byCategoryOpen,
    taskCountsForSheet: derived.byCategoryTotal,
    activeCount: derived.active.length,
    headerLine,
    appTitle,
    setFilter,
    saveProfile: setProfile,
    changeView,
    toggle,
    moveToTrash,
    restoreFromTrash,
    permanentlyDelete,
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
    addTask,
    emptyTrash,
    selectedTrashIds,
    toggleTrashSelection,
    clearTrashSelection,
    bulkRestore,
    bulkPermanentDelete,
    clearDone,
    addCategory,
    editCategory,
    deleteCategory,
    reorderCategories,
  };
}
