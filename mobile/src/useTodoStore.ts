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
  TodoReference,
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
import {
  GroceryItem,
  GroceryGroup,
  SEED_GROCERY_GROUPS,
  SEED_GROCERY_STORES,
  migrateGroceries,
  migrateGroceryGroups,
  newGroceryItem,
  groceryToggleChecked,
  groceryEdit,
  groceryDelete,
  MAX_GROCERY_ITEMS,
} from "./groceries";
import { useLang } from "./LangContext";
import { useAuth } from "./AuthContext";
import { useNotify } from "./notify";
import { useReduceMotion } from "./useReduceMotion";
import { PEBBLE_DEFERRAL_MS } from "./components/PebbleFlight";
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
  pebbleDelta,
  PebbleDelta,
  todoMoveToTrash,
  todoMoveToTrashFutureSeries,
  todoApplySeriesFutureEdits,
  todoRestoreFromTrash,
  todoPermanentlyDelete,
  todoEmptyTrash,
  todoClearDone,
  todoSet,
  migrateTodos,
  migrateTodoReferences,
  recordTodoReference,
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
import { todayLocal, isoDate } from "../../core/src/utils";

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
const parseTodoReferences = (raw: string | null): TodoReference[] =>
  migrateTodoReferences(unwrap(raw));

// Soft cap on pinned filters in the FilterBar quick-access row. Also
// enforced by migratePinnedFilters in core, so the persisted profile
// stays bounded even if the limit drifts between platforms.
const PIN_LIMIT = 12;

const parseProfile = (raw: string | null): Profile => {
  const data = unwrap(raw);
  return data ? migrateProfile(data) : SEED_PROFILE;
};

const parseGroceries = (raw: string | null): GroceryItem[] =>
  migrateGroceries(unwrap(raw));

const parseGroceryGroups = (raw: string | null): GroceryGroup[] =>
  migrateGroceryGroups(unwrap(raw));

const serializeAny = (v: unknown): string => wrap(v);

/**
 * Push local AsyncStorage data to cloud, per-key, only when that cloud key is
 * empty. Per-key gating (vs only checking `profile`) prevents stomping cloud
 * todos or categories on a device whose local copy is stale and whose cloud
 * profile happens to have been deleted or never written.
 */
async function migrateLocalToCloud(adapter: StorageAdapter): Promise<void> {
  for (const key of [
    "todos",
    "categories",
    "profile",
    "groceries",
    "groceryGroups",
  ] as const) {
    const cloudVal = await adapter.getItem(key);
    if (cloudVal != null) continue;
    const raw = await AsyncStorage.getItem(key);
    if (raw != null) await adapter.setItem(key, raw);
  }
}

import { pickMascotLine, dateSeed } from "./mascotLines";

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
  const [groceries, setGroceries, groceriesLoaded] = useSyncedState<GroceryItem[]>(
    adapter,
    "groceries",
    [],
    parseGroceries,
    serializeAny,
    onSaved,
  );
  const [groceryGroups, setGroceryGroups, groceryGroupsLoaded] = useSyncedState<GroceryGroup[]>(
    adapter,
    "groceryGroups",
    SEED_GROCERY_GROUPS,
    parseGroceryGroups,
    serializeAny,
    onSaved,
  );
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
  // Long-lived compose-suggestion history. Stored separately from
  // `todos` so it survives the 30-day done-bin purge — items the user
  // checked off months ago can still surface as auto-fill suggestions
  // when they type a familiar title.
  const [todoReferences, setTodoReferences] = useSyncedState<TodoReference[]>(
    adapter,
    "todoReferences",
    [],
    parseTodoReferences,
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

  // Post-hydrate pebble reconciliation. The stored today*Pebbles counters
  // drive the cairn slot math during in-session animations (they're
  // deferred so Mochi lands before the slot fills), but they can fall out
  // of sync after sign-out → sign-in, a fresh install, or a midnight
  // rollover — the user would see 0 pebbles even though today's todos
  // clearly show several DONE items. Once per uid swap, after both
  // profile + todos have loaded, walk today's `completionDate` timestamps
  // on the live todos and bump the stored counter up if it's lagging.
  // Subtasks don't carry a per-sub completion date so we leave their
  // count alone here.
  const reconciledForUidRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!profileLoaded || !todosLoaded) return;
    const k = uid ?? "(local)";
    if (reconciledForUidRef.current === k) return;
    reconciledForUidRef.current = k;
    const today = todayLocal();
    const derivedTask = todos.filter(
      (t) => !t.trashed && t.done && t.completionDate === today,
    ).length;
    const isToday = profile.pebblesDate === today;
    const storedTask = isToday ? profile.todayTaskPebbles ?? 0 : 0;
    const storedSub = isToday ? profile.todaySubtaskPebbles ?? 0 : 0;
    if (!isToday || derivedTask > storedTask) {
      setProfile((p) => ({
        ...p,
        pebblesDate: today,
        todayTaskPebbles: Math.max(storedTask, derivedTask),
        todaySubtaskPebbles: storedSub,
      }));
    }
  }, [
    profileLoaded,
    todosLoaded,
    uid,
    todos,
    profile.pebblesDate,
    profile.todayTaskPebbles,
    profile.todaySubtaskPebbles,
    setProfile,
  ]);

  // Auto-clear selection when leaving trash view
  useEffect(() => {
    if (filter !== "trash" && selectedTrashIds.size > 0) {
      setSelectedTrashIds(new Set());
    }
  }, [filter, selectedTrashIds.size]);

  // Toggle a filter's pin in the FilterBar quick-access row. Adding
  // appends to the end so newest pins are last; removing splices it out.
  // Capped at PIN_LIMIT (also enforced in migratePinnedFilters); when the
  // cap is reached on an add, surface a snackbar so the user isn't left
  // with a silent no-op.
  const pinFilter = useCallback(
    (f: Filter) => {
      setProfile((prev) => {
        const current = prev.pinnedFilters ?? [];
        if (current.includes(f)) {
          const next = current.filter((x) => x !== f);
          return { ...prev, pinnedFilters: next.length > 0 ? next : undefined };
        }
        if (current.length >= PIN_LIMIT) {
          notify.showSnackbar({ message: t.pinCapReached(PIN_LIMIT) });
          return prev;
        }
        return { ...prev, pinnedFilters: [...current, f] };
      });
    },
    [setProfile, notify, t],
  );

  const loaded =
    categoriesLoaded &&
    todosLoaded &&
    profileLoaded &&
    groceriesLoaded &&
    groceryGroupsLoaded;

  // ---- Stable callbacks ----

  // Single chokepoint for pebble accounting. Every mutation that can
  // earn or refund pebbles (toggle / moveToTrash / restoreFromTrash)
  // computes a PebbleDelta in core and applies it here — so the math
  // can't drift between paths the way it did pre-B3.
  const applyPebbleDelta = useCallback(
    (delta: PebbleDelta) => {
      if (delta.task === 0 && delta.subtask === 0) return;
      setProfile((p) => {
        const today = todayLocal();
        let next = p;
        if (delta.task > 0) next = incrementPebble(next, today, "task");
        else if (delta.task < 0) next = decrementPebble(next, today, "task");
        for (let i = 0; i < delta.subtask; i++)
          next = incrementPebble(next, today, "subtask");
        for (let i = 0; i < -delta.subtask; i++)
          next = decrementPebble(next, today, "subtask");
        return next;
      });
    },
    [setProfile],
  );

  // Positive pebble deltas (a fresh completion) are deferred so the cairn
  // updates in sync with Mochi landing on it. Negative deltas (undoing a
  // completion) fire immediately — the visible strikethrough comes off
  // and the cairn should reflect that without a delay. The delay is
  // skipped entirely when the user has reduce-motion on or has turned
  // off completion animations in Profile — there's no Mochi to wait for
  // and the 940ms gap between chime and pebble would just feel laggy.
  const reduceMotion = useReduceMotion();
  const animationOn = profile.completionAnimation !== false;
  const applyPebbleDeltaTimed = useCallback(
    (delta: PebbleDelta) => {
      if (delta.task === 0 && delta.subtask === 0) return;
      const shouldDefer =
        (delta.task > 0 || delta.subtask > 0) && animationOn && !reduceMotion;
      if (shouldDefer) {
        setTimeout(() => applyPebbleDelta(delta), PEBBLE_DEFERRAL_MS);
      } else {
        applyPebbleDelta(delta);
      }
    },
    [applyPebbleDelta, animationOn, reduceMotion],
  );

  const toggle = useCallback(
    (id: string) => {
      // Detect transitions against the current todos via ref so setTodos +
      // setProfile sit at the same nesting level (React 18 batches them and
      // StrictMode's double-invoke can't double-bump the counter).
      const beforeTodo = todosRef.current.find((t) => t.id === id);
      setTodos((prev) => todoToggle(prev, id));
      if (!beforeTodo) return;
      const afterTodo = todoToggle([beforeTodo], id)[0];
      applyPebbleDeltaTimed(pebbleDelta(beforeTodo, afterTodo));
      // Record a suggestion-history entry on the open→done transition so
      // ComposeSheet can auto-fill category / priority / recurrence when
      // the user types the same title again later. Un-checking (done→open)
      // doesn't update the history.
      if (afterTodo && afterTodo.done && !beforeTodo.done) {
        setTodoReferences((prev) => recordTodoReference(prev, afterTodo));
      }
    },
    [setTodos, setTodoReferences, applyPebbleDeltaTimed],
  );

  const restoreFromTrash = useCallback(
    (id: string) => {
      const beforeTodo = todosRef.current.find((t) => t.id === id);
      setTodos((prev) => todoRestoreFromTrash(prev, id));
      if (!beforeTodo) return;
      const afterTodo = todoRestoreFromTrash([beforeTodo], id)[0];
      // Restore is a refund (negative delta) — apply immediately so the
      // cairn count drops in sync with the visible un-strike.
      applyPebbleDelta(pebbleDelta(beforeTodo, afterTodo));
    },
    [setTodos, applyPebbleDelta],
  );

  const moveToTrash = useCallback(
    (id: string) => {
      const beforeTodo = todosRef.current.find((t) => t.id === id);
      setTodos((prev) => todoMoveToTrash(prev, id));
      if (beforeTodo) {
        const afterTodo = todoMoveToTrash([beforeTodo], id)[0];
        applyPebbleDeltaTimed(pebbleDelta(beforeTodo, afterTodo));
      }
      notify.showSnackbar({
        message: t.movedToTrash,
        actionLabel: t.undo,
        onAction: () => restoreFromTrash(id),
        mergeKey: "trash",
        mergedMessage: (n) => t.movedToTrashMany(n),
        mergedActionLabel: t.undoAll,
      });
    },
    [setTodos, applyPebbleDeltaTimed, notify, t, restoreFromTrash],
  );

  const applySeriesFutureEdits = useCallback(
    (
      id: string,
      fields: { text?: string; priority?: Priority; category?: Category | undefined },
    ) => {
      let affected = 0;
      setTodos((prev) => {
        const result = todoApplySeriesFutureEdits(prev, id, fields);
        affected = result.affected;
        return result.next;
      });
      notify.showSnackbar({
        message:
          affected > 0
            ? t.series.editsApplied(affected)
            : t.series.editsNothing,
      });
    },
    [setTodos, notify],
  );

  const moveSeriesFutureToTrash = useCallback(
    (id: string) => {
      let affected = 0;
      setTodos((prev) => {
        const result = todoMoveToTrashFutureSeries(prev, id);
        affected = result.affected;
        return result.next;
      });
      // Snackbar copy reflects how many were tucked away; falls back to
      // single-task copy when the target wasn't part of a series.
      notify.showSnackbar({
        message: affected > 1 ? t.series.trashedMany(affected) : t.movedToTrash,
      });
    },
    [setTodos, notify, t],
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

  // Overwhelm-mode escape hatch. Shifts every open overdue item's
  // dueDate forward by `daysFromToday` and shows an undo snackbar that
  // captures each original date so the action is fully reversible.
  // Skips done items (they don't need deferral) and trashed items.
  const deferOverdue = useCallback(
    (daysFromToday: number) => {
      const today = todayLocal();
      const d = new Date();
      d.setDate(d.getDate() + daysFromToday);
      const newDate = isoDate(d);
      const overdue = todosRef.current.filter(
        (td) => !td.trashed && !td.done && td.dueDate && td.dueDate < today,
      );
      if (overdue.length === 0) return;
      const originals = new Map(overdue.map((td) => [td.id, td.dueDate]));
      const now = Date.now();
      setTodos((prev) =>
        prev.map((td) =>
          originals.has(td.id)
            ? { ...td, dueDate: newDate, updatedAt: now }
            : td,
        ),
      );
      notify.showSnackbar({
        message: t.defer.done(overdue.length),
        actionLabel: t.undoAll,
        onAction: () => {
          const undoNow = Date.now();
          setTodos((prev) =>
            prev.map((td) => {
              const orig = originals.get(td.id);
              return orig !== undefined
                ? { ...td, dueDate: orig, updatedAt: undoNow }
                : td;
            }),
          );
        },
      });
    },
    [setTodos, notify, t],
  );

  // Bulk-defer a specific set of open todos to an absolute target
  // date (ISO yyyy-mm-dd). Used by the group-header "Defer to" action
  // so the user can move an entire bucket (Today / Week / Upcoming /
  // Carried Over / …) forward in one tap. Same undo + skip semantics
  // as `deferOverdue` — done + trashed items are excluded.
  const bulkDeferTodos = useCallback(
    (ids: string[], targetISO: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetISO)) return;
      const want = new Set(ids);
      const candidates = todosRef.current.filter(
        (td) => want.has(td.id) && !td.trashed && !td.done,
      );
      if (candidates.length === 0) return;
      const originals = new Map(candidates.map((td) => [td.id, td.dueDate]));
      const now = Date.now();
      setTodos((prev) =>
        prev.map((td) =>
          originals.has(td.id)
            ? { ...td, dueDate: targetISO, updatedAt: now }
            : td,
        ),
      );
      notify.showSnackbar({
        message:
          candidates.length === 1
            ? '1 to-do deferred.'
            : `${candidates.length} to-dos deferred.`,
        actionLabel: t.undoAll,
        onAction: () => {
          const undoNow = Date.now();
          setTodos((prev) =>
            prev.map((td) => {
              const orig = originals.get(td.id);
              return orig !== undefined
                ? { ...td, dueDate: orig, updatedAt: undoNow }
                : td;
            }),
          );
        },
      });
    },
    [setTodos, notify, t],
  );

  // Quick "I can't face this today" affordance. Shifts the dueDate
  // forward by `daysFromToday` (1 = tomorrow, 7 = next week) and shows
  // an undo snackbar capturing the original date.
  const snooze = useCallback(
    (id: string, daysFromToday: number) => {
      const beforeTodo = todosRef.current.find((t) => t.id === id);
      if (!beforeTodo) return;
      const originalDate = beforeTodo.dueDate;
      const d = new Date();
      d.setDate(d.getDate() + daysFromToday);
      const newDate = isoDate(d);
      setTodos((prev) => todoSet(prev, id, "dueDate", newDate));
      const label =
        daysFromToday === 1
          ? t.snooze.toTomorrow
          : daysFromToday === 7
            ? t.snooze.toNextWeek
            : t.snooze.toDays(daysFromToday);
      notify.showSnackbar({
        message: label,
        actionLabel: t.undo,
        onAction: () => {
          setTodos((prev) => todoSet(prev, id, "dueDate", originalDate));
        },
      });
    },
    [setTodos, notify, t],
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

  const updateNotes = useCallback(
    (id: string, notes: string) => {
      setTodos((prev) => todoSet(prev, id, "notes", notes));
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
    // Permanently delete every item in the bin (anything done OR
    // trashed). Irreversible — undo via snackbar isn't possible because
    // todoClearDone removes the items from the array entirely. Confirm
    // the user really means it.
    const count = todosRef.current.filter((td) => td.done || td.trashed).length;
    if (count === 0) return;
    Alert.alert(
      t.clearAllCompleted,
      t.emptyTrashConfirm(count),
      [
        { text: t.cancel, style: "cancel" },
        {
          text: t.deletePermanently,
          style: "destructive",
          onPress: () => {
            setTodos((prev) => todoClearDone(prev).todos);
          },
        },
      ],
    );
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
    // Strip any pinned filter that pointed at this category so the persisted
    // profile doesn't accumulate stale `cat:<deleted-id>` entries that would
    // show up as ghost pills if the category is later re-created with the
    // same id (or just clutter the profile doc).
    const ghostFilter = `cat:${id}`;
    setProfile((prev) => {
      const pinned = prev.pinnedFilters;
      if (!pinned || !pinned.includes(ghostFilter)) return prev;
      const cleaned = pinned.filter((f) => f !== ghostFilter);
      return { ...prev, pinnedFilters: cleaned.length > 0 ? cleaned : undefined };
    });
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
    setProfile((prev) => {
      const next = statusToggleHidden(prev, id);
      // If the status was just hidden and is currently pinned, strip the
      // pin so it doesn't sit invisibly in the profile (the FilterBar
      // already filters hidden statuses out of its pinned-pill list).
      const overrides = next.statuses ?? [];
      const isNowHidden = overrides.find((s) => s.id === id)?.hidden === true;
      if (
        isNowHidden &&
        next.pinnedFilters &&
        next.pinnedFilters.includes(id)
      ) {
        const cleaned = next.pinnedFilters.filter((f) => f !== id);
        return {
          ...next,
          pinnedFilters: cleaned.length > 0 ? cleaned : undefined,
        };
      }
      return next;
    });
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
      }),
    [todos, filter, categories, t],
  );

  const hour = new Date().getHours();
  const greetingKey: "morning" | "afternoon" | "evening" =
    hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const greetingName =
    profile.firstName?.trim() || profile.name.trim();
  const headerLine = `${t.greeting[greetingKey]}, ${greetingName}`;
  const trimmedQuote =
    profile.quote && profile.quote.trim() ? profile.quote.trim() : '';
  const todayDate = todayLocal();
  const todayCount = todos.filter(
    (td) => !td.trashed && td.dueDate === todayDate,
  ).length;
  const plateLine = t.todayPlate(todayCount);
  const mascotLine = pickMascotLine(greetingKey, todayCount, todayDate);
  // When the user has set a personal quote, alternate it with Mochi's
  // line by day-stable seed so neither one permanently silences the
  // other. Same seed mechanism as pickMascotLine — predictable rotation
  // across days, steady within a session.
  const identityLineIsQuote = !!trimmedQuote && dateSeed(todayDate) % 2 === 0;
  const identityLine = identityLineIsQuote ? trimmedQuote : mascotLine;
  // Legacy: still expose quoteLine for any caller that wants the raw
  // value, but App.tsx now reads identityLine + identityLineIsQuote.
  const quoteLine = trimmedQuote;
  const orderedStatuses = getOrderedStatuses(profile, t);
  const orderedVisibleStatuses = getOrderedVisibleStatuses(profile, t);
  const todayPebbleCounts = getTodayPebbles(profile, todayDate);
  const todayTaskPebbles = todayPebbleCounts.task;
  const todaySubtaskPebbles = todayPebbleCounts.subtask;
  const todayPebbles = todayTaskPebbles + todaySubtaskPebbles;
  const lifetimePebbles = profile.lifetimePebbles ?? 0;

  // ---- Grocery mutations (stable callbacks) ------------------------
  const addGrocery = useCallback(
    (args: { text: string; groupId?: string; store?: string }) => {
      const text = args.text.trim();
      if (!text) return;
      setGroceries((prev) => {
        if (prev.length >= MAX_GROCERY_ITEMS) return prev;
        return [newGroceryItem({ ...args, text }), ...prev];
      });
      // Auto-register the store on first use so the Configure Filter
      // sheet shows it in the STORES section even before the user goes
      // there to add it explicitly.
      const store = args.store?.trim();
      if (store) {
        setProfile((p) => {
          const list = p.groceryStores ?? SEED_GROCERY_STORES;
          if (list.includes(store)) return p;
          return { ...p, groceryStores: [...list, store] };
        });
      }
    },
    [setGroceries, setProfile],
  );

  const renameGroceryStore = useCallback(
    (oldName: string, newName: string) => {
      const next = newName.trim();
      if (!next || next === oldName) return;
      // Replace in profile list (preserve position; dedupe).
      setProfile((p) => {
        const list = p.groceryStores ?? SEED_GROCERY_STORES;
        const updated: string[] = [];
        for (const s of list) {
          const replaced = s === oldName ? next : s;
          if (!updated.includes(replaced)) updated.push(replaced);
        }
        const activeUpdated =
          p.activeGroceryStore === oldName ? next : p.activeGroceryStore;
        return { ...p, groceryStores: updated, activeGroceryStore: activeUpdated };
      });
      // Batch-update items that carried the old store name.
      setGroceries((prev) =>
        prev.map((it) => (it.store === oldName ? { ...it, store: next } : it)),
      );
    },
    [setProfile, setGroceries],
  );

  const deleteGroceryStore = useCallback(
    (name: string) => {
      setProfile((p) => {
        const list = (p.groceryStores ?? SEED_GROCERY_STORES).filter((s) => s !== name);
        const active =
          p.activeGroceryStore === name ? undefined : p.activeGroceryStore;
        return { ...p, groceryStores: list, activeGroceryStore: active };
      });
      setGroceries((prev) =>
        prev.map((it) => (it.store === name ? { ...it, store: undefined } : it)),
      );
    },
    [setProfile, setGroceries],
  );

  const reorderGroceryStores = useCallback(
    (next: string[]) => {
      setProfile((p) => ({ ...p, groceryStores: next.filter((s) => s.trim().length > 0) }));
    },
    [setProfile],
  );

  const addGroceryStore = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setProfile((p) => {
        const list = p.groceryStores ?? SEED_GROCERY_STORES;
        if (list.includes(trimmed)) return p;
        return { ...p, groceryStores: [...list, trimmed] };
      });
    },
    [setProfile],
  );

  const toggleGroceryStoreHidden = useCallback(
    (name: string) => {
      setProfile((p) => {
        const hidden = p.hiddenGroceryStores ?? [];
        const next = hidden.includes(name)
          ? hidden.filter((s) => s !== name)
          : [...hidden, name];
        return { ...p, hiddenGroceryStores: next };
      });
    },
    [setProfile],
  );

  const pinGroceryStore = useCallback(
    (name: string) => {
      setProfile((p) => {
        const pinned = p.pinnedGroceryStores ?? [];
        const next = pinned.includes(name)
          ? pinned.filter((s) => s !== name)
          : [...pinned, name];
        return { ...p, pinnedGroceryStores: next };
      });
    },
    [setProfile],
  );

  const toggleGroceryChecked = useCallback(
    (id: string) => {
      setGroceries((prev) => groceryToggleChecked(prev, id));
    },
    [setGroceries],
  );

  const editGrocery = useCallback(
    (id: string, patch: { text?: string; groupId?: string; store?: string | null }) => {
      setGroceries((prev) => groceryEdit(prev, id, patch));
    },
    [setGroceries],
  );

  const deleteGrocery = useCallback(
    (id: string) => {
      setGroceries((prev) => groceryDelete(prev, id));
    },
    [setGroceries],
  );

  const setActiveGroceryStore = useCallback(
    (store: string | undefined) => {
      setProfile((p) => ({ ...p, activeGroceryStore: store || undefined }));
    },
    [setProfile],
  );

  const setActiveGroceryDept = useCallback(
    (deptId: string | undefined) => {
      setProfile((p) => ({ ...p, activeGroceryDept: deptId || undefined }));
    },
    [setProfile],
  );

  const pinGroceryDept = useCallback(
    (deptId: string) => {
      setProfile((p) => {
        const pinned = p.pinnedGroceryDepts ?? [];
        const next = pinned.includes(deptId)
          ? pinned.filter((d) => d !== deptId)
          : [...pinned, deptId];
        return { ...p, pinnedGroceryDepts: next };
      });
    },
    [setProfile],
  );

  return {
    todos,
    todoReferences,
    categories,
    groceries,
    setGroceries,
    addGrocery,
    toggleGroceryChecked,
    editGrocery,
    deleteGrocery,
    setActiveGroceryStore,
    setActiveGroceryDept,
    pinGroceryDept,
    addGroceryStore,
    renameGroceryStore,
    deleteGroceryStore,
    reorderGroceryStores,
    toggleGroceryStoreHidden,
    pinGroceryStore,
    groceryGroups,
    setGroceryGroups,
    profile,
    filter,
    view,
    loaded,
    lastSavedAt,
    ...derived,
    // FilterBar + CategorySheet both want the full per-category count
    // (open + done, excludes trashed) — matches the user mental model
    // of "this category has N things in it, regardless of state".
    byCategory: derived.byCategoryTotal,
    taskCountsForSheet: derived.byCategoryTotal,
    activeCount: derived.active.length,
    headerLine,
    quoteLine,
    plateLine,
    mascotLine,
    identityLine,
    identityLineIsQuote,
    todayPebbles,
    todayTaskPebbles,
    todaySubtaskPebbles,
    lifetimePebbles,
    orderedStatuses,
    orderedVisibleStatuses,
    setFilter,
    pinFilter,
    saveProfile: setProfile,
    changeView,
    renameStatus,
    toggleStatusHidden,
    reorderStatuses,
    toggle,
    moveToTrash,
    moveSeriesFutureToTrash,
    applySeriesFutureEdits,
    restoreFromTrash,
    permanentlyDelete,
    updatePriority,
    updateDueDate,
    bulkDeferTodos,
    snooze,
    deferOverdue,
    updateTaskCategory,
    updateText,
    updateNotes,
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
