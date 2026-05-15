import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Category,
  Filter,
  Priority,
  Recurrence,
  StatusFilter,
  Todo,
  ViewMode,
  isCategoryFilter,
  categoryIdFromFilter,
} from "./types";
import {
  getOrderedStatuses,
  getOrderedVisibleStatuses,
  statusRename,
  statusToggleHidden,
  statusReorder,
} from "../../core/src/statuses";
import {
  CategoryDef,
  SEED_CATEGORIES,
  migrateCategory,
  newCategoryId,
} from "./categories";
import { Profile, SEED_PROFILE, migrateProfile, getTodayPebbles, incrementPebble, decrementPebble } from "./profile";
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
  generateRecurringInstances,
  todoToggle,
  didEarnPebble,
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
import { todayLocal } from "../../core/src/utils";

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
  const view: ViewMode = profile.view ?? "status";
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
      // Detect transitions against the current todos via ref so setTodos +
      // setProfile sit at the same nesting level (React 18 batches them and
      // StrictMode's double-invoke can't double-bump the counter).
      const beforeTodo = todosRef.current.find((t) => t.id === id);
      setTodos((prev) => todoToggle(prev, id));
      if (!beforeTodo) return;
      const afterTodo = todoToggle([beforeTodo], id)[0];

      // Parent task transition.
      const wasDone = beforeTodo.done;
      const isDone = afterTodo.done;
      const recurringCompletion =
        didEarnPebble(beforeTodo, afterTodo) && !wasDone && !isDone;
      const taskDelta =
        !wasDone && (isDone || recurringCompletion)
          ? +1
          : wasDone && !isDone
            ? -1
            : 0;

      // Cascade: when a parent is toggled, all subtasks flip to the parent's
      // new done state. Each subtask transition counts as one pebble. We
      // batch every delta into a single setProfile so the UI sees one
      // coalesced update.
      const beforeSubs = beforeTodo.subtasks ?? [];
      const afterSubs = afterTodo.subtasks ?? [];
      let subtaskDelta = 0;
      for (let i = 0; i < beforeSubs.length; i++) {
        const b = beforeSubs[i];
        const a = afterSubs[i];
        if (!a) continue;
        if (!b.done && a.done) subtaskDelta += 1;
        else if (b.done && !a.done) subtaskDelta -= 1;
      }

      if (taskDelta === 0 && subtaskDelta === 0) return;
      setProfile((p) => {
        const today = todayLocal();
        let next = p;
        if (taskDelta > 0) next = incrementPebble(next, today, 'task');
        else if (taskDelta < 0) next = decrementPebble(next, today, 'task');
        for (let i = 0; i < subtaskDelta; i++) {
          next = incrementPebble(next, today, 'subtask');
        }
        for (let i = 0; i < -subtaskDelta; i++) {
          next = decrementPebble(next, today, 'subtask');
        }
        return next;
      });
    },
    [setTodos, setProfile],
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
        mergeKey: "trash",
        mergedMessage: (n) => t.movedToTrashMany(n),
        mergedActionLabel: t.undoAll,
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
      // Subtask transitions earn small pebbles. Done → +1, undone → -1.
      // The auto-cascade that marks the parent done when all subs are done
      // is a derived state, not a separate action — so it does not earn an
      // extra task pebble.
      const beforeSub = todosRef.current
        .find((t) => t.id === id)
        ?.subtasks?.find((s) => s.id === subId);
      setTodos((prev) => subtaskToggle(prev, id, subId));
      if (!beforeSub) return;
      if (!beforeSub.done) {
        setProfile((p) => incrementPebble(p, todayLocal(), 'subtask'));
      } else {
        setProfile((p) => decrementPebble(p, todayLocal(), 'subtask'));
      }
    },
    [setTodos, setProfile],
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
    recurrence?: Recurrence,
  ) {
    // When recurrence has an endDate, expand into one Todo per occurrence.
    // Otherwise create a single task (which may roll forward via the legacy
    // todoToggle path if recurrence is set without endDate).
    if (recurrence?.endDate) {
      const instances = generateRecurringInstances({
        text,
        priority,
        dueDate,
        category,
        recurrence,
      });
      if (instances.length === 0) return;
      setTodos((prev) => [...instances, ...prev]);
      return;
    }
    setTodos((prev) => [
      newTodo({ text, priority, dueDate, category, recurrence }),
      ...prev,
    ]);
  }

  const updateRecurrence = useCallback(
    (id: string, recurrence: Recurrence | undefined) => {
      setTodos((prev) =>
        prev.map((td) =>
          td.id === id
            ? recurrence
              ? { ...td, recurrence, updatedAt: Date.now() }
              : (() => {
                  const { recurrence: _, ...rest } = td;
                  return { ...rest, updatedAt: Date.now() };
                })()
            : td,
        ),
      );
    },
    [setTodos],
  );

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
    let trashedIds: string[] = [];
    setTodos((prev) => {
      const result = todoClearDone(prev);
      trashedIds = result.trashedIds;
      return result.todos;
    });
    if (trashedIds.length === 0) return;
    notify.showSnackbar({
      message: t.movedToTrashMany(trashedIds.length),
      actionLabel: t.undoAll,
      onAction: () => {
        setTodos((prev) => {
          const now = Date.now();
          const idSet = new Set(trashedIds);
          return prev.map((td) =>
            idSet.has(td.id)
              ? { ...td, trashed: false, trashedAt: undefined, updatedAt: now }
              : td,
          );
        });
      },
    });
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
    if (!next.deleted) return;
    setTodos(next.todos);
    setCategories(next.categories);
    if (isCategoryFilter(filter) && categoryIdFromFilter(filter) === id)
      setFilter("all");
  }

  function changeView(v: ViewMode) {
    setProfile((prev) => ({ ...prev, view: v }));
    setFilter(v === "category" ? "all" : "open");
  }

  function reorderCategories(fromIdx: number, toIdx: number) {
    setCategories((prev) => categoryReorder(prev, fromIdx, toIdx));
  }

  function renameStatus(id: StatusFilter, label: string) {
    setProfile((prev) => statusRename(prev, id, label));
  }

  function toggleStatusHidden(id: StatusFilter) {
    setProfile((prev) => statusToggleHidden(prev, id));
  }

  function reorderStatuses(newOrder: StatusFilter[]) {
    setProfile((prev) => statusReorder(prev, newOrder));
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
  const greetingName =
    profile.firstName?.trim() || profile.name.trim();
  const headerLine = `${t.greeting[greetingKey]}, ${greetingName}`;
  const quoteLine = profile.quote && profile.quote.trim() ? profile.quote : '';
  const todayDate = todayLocal();
  const todayCount = todos.filter(
    (td) => !td.trashed && td.dueDate === todayDate,
  ).length;
  const plateLine = t.todayPlate(todayCount);
  const orderedStatuses = getOrderedStatuses(profile, t);
  const orderedVisibleStatuses = getOrderedVisibleStatuses(profile, t);
  const todayPebbleCounts = getTodayPebbles(profile, todayDate);
  const todayTaskPebbles = todayPebbleCounts.task;
  const todaySubtaskPebbles = todayPebbleCounts.subtask;
  const todayPebbles = todayTaskPebbles + todaySubtaskPebbles;
  const lifetimePebbles = profile.lifetimePebbles ?? 0;

  return {
    todos,
    categories,
    profile,
    filter,
    view,
    loaded,
    lastSavedAt,
    ...derived,
    byCategory: derived.byCategoryOpen,
    taskCountsForSheet: derived.byCategoryTotal,
    activeCount: derived.active.length,
    headerLine,
    quoteLine,
    plateLine,
    todayPebbles,
    todayTaskPebbles,
    todaySubtaskPebbles,
    lifetimePebbles,
    orderedStatuses,
    orderedVisibleStatuses,
    setFilter,
    saveProfile: setProfile,
    changeView,
    renameStatus,
    toggleStatusHidden,
    reorderStatuses,
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
    updateRecurrence,
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
