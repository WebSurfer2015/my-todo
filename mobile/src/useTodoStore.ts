import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Category,
  Filter,
  Priority,
  Recurrence,
  StatusFilter,
  Subtask,
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
  getOrderedPriorities,
  priorityToggleHidden,
  priorityReorder,
} from "../../core/src/priorities";
import { useCategoriesSlice } from "./slices/useCategoriesSlice";
import { useProfileSlice } from "./slices/useProfileSlice";
import { useGroceriesSlice } from "./slices/useGroceriesSlice";
import { useTodosSlice } from "./slices/useTodosSlice";
import { useLang } from "./LangContext";
import { useAuth } from "./AuthContext";
import { useNotify } from "./notify";
import { storage as localAdapter } from "./persistence";
import { db } from "./firebase";
import { makeFirestoreAdapter } from "./firestoreAdapter";
import { StorageAdapter } from "../../core/src/persistence";
import { categoryDelete, deriveState } from "../../core/src/derive";
import { todayLocal } from "../../core/src/utils";
import { getTodayPebbles, collectedNounKeyFor } from "./profile";

// Soft cap on pinned filters in the FilterBar quick-access row. Also
// enforced by migratePinnedFilters in core, so the persisted profile
// stays bounded even if the limit drifts between platforms.
const PIN_LIMIT = 12;

// Default trio when the user hasn't picked any Home stat tiles. Resolved
// at render so the Home screen + Manage Filter sheet stay in sync, and
// so a user renaming or deleting a category falls through to whatever
// is still valid here without us writing dead pins to disk.
const DEFAULT_HOME_STAT_TILES: string[] = ["cat:home", "cat:work", "done"];

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
import { Analytics } from "./analytics";

export function useTodoStore() {
  const { lang, t } = useLang();
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

  const {
    profile,
    setProfile,
    profileLoaded,
    lastSavedAt,
    onSaved,
  } = useProfileSlice(adapter);

  const {
    categories,
    setCategories,
    categoriesLoaded,
    addCategory,
    editCategory,
    reorderCategories,
  } = useCategoriesSlice(adapter, onSaved);
  // Multi-faceted filter selection. Empty array = "all" (no constraint).
  // Filters within the same type group are OR'd (e.g., Home + Work =
  // either); across type groups they're AND'd ((open OR done) AND
  // (Home OR Work)). See core/derive.ts for the matching predicate.
  const [filters, setFiltersState] = useState<Filter[]>([]);
  // Legacy single-filter API. setFilter replaces the multi-array with
  // a single pick; reading `filter` returns the lone selection if
  // exactly one is active, else 'all'. Keeps every existing
  // `store.filter === '...'` comparison working in the simple case.
  const filter: Filter = filters.length === 1 ? filters[0] : 'all';
  const setFilter = useCallback((f: Filter) => {
    if (f === 'all') setFiltersState([]);
    else setFiltersState([f]);
  }, []);
  // Multi-select toggle: tapping a filter row in the Select Filter
  // sheet adds it to the selection (or removes it if it was already
  // there). The sheet stays open so the user can build up a multi-
  // filter set in one pass; the FilterBar collapses 2+ active filters
  // into a single composite pill ("Done + Work") so the strip itself
  // still reads as one active pill at a time.
  const toggleFilter = useCallback((f: Filter) => {
    if (f === 'all') {
      setFiltersState([]);
      return;
    }
    setFiltersState((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
    );
  }, []);
  const clearFilters = useCallback(() => setFiltersState([]), []);
  const setFilters = useCallback((f: Filter[]) => setFiltersState(f), []);
  const view: ViewMode = profile.view ?? "status";
  // Derived bool re-exposed in the store return so screens can hide
  // motion-bound chrome (PebbleStrip etc.) when the user has opted
  // out. Same expression the todos slice uses internally to decide
  // whether to defer pebble flights.
  const animationOn =
    profile.completionAnimation !== false && profile.reduceMotion !== true;
  // Mirror `filter` into a ref so TaskItem-bound callbacks (now in
  // useTodosSlice) can read it without re-firing on every filter
  // change (which would break the React.memo on TaskItem — see the
  // store-stability rules).
  const filterRef = useRef<Filter>(filter);
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);
  // Mirror profile so async paths (AI flows, debounced writes) can
  // read the latest agentEnabled / groceryStores / pinnedFilters
  // without taking the live `profile` as a useCallback dep — that
  // would break callback identity every render and bust TaskItem's
  // React.memo. The grocery slice owns its own groceryGroupsRef.
  const profileRef = useRef(profile);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // Toggle a filter's pin in the FilterBar quick-access row. Adding
  // appends to the end so newest pins are last; removing splices it out.
  // Capped at PIN_LIMIT (also enforced in migratePinnedFilters); when the
  // cap is reached on an add, surface a snackbar so the user isn't left
  // with a silent no-op.
  // Set-aware pin: each pinned entry is a Filter[] (single-element
  // for legacy single-filter pins, multi-element for composite pills).
  // Toggling pins the set if absent, unpins if present. Order-
  // insensitive equality so ['done','cat:work'] and ['cat:work','done']
  // are the same pin.
  const setKey = (set: Filter[]) => [...set].sort().join(' ');
  const pinFilter = useCallback(
    (set: Filter[]) => {
      if (set.length === 0) return;
      const key = setKey(set);
      setProfile((prev) => {
        const current = prev.pinnedFilters ?? [];
        const idx = current.findIndex(
          (existing) => setKey(existing as Filter[]) === key,
        );
        if (idx >= 0) {
          const next = current.filter((_, i) => i !== idx);
          return {
            ...prev,
            pinnedFilters: next.length > 0 ? next : undefined,
          };
        }
        if (current.length >= PIN_LIMIT) {
          notify.showSnackbar({ message: t.pinCapReached(PIN_LIMIT) });
          return prev;
        }
        return { ...prev, pinnedFilters: [...current, set] };
      });
    },
    [setProfile, notify, t],
  );

  // Atomic "stash the current selection as a pinned shortcut then
  // clear it" used by FilterBar when the user taps an active pill.
  // Calling pinFilter + clearFilters separately from the component
  // depended on a closure check (`isSetPinned`) against possibly-
  // stale props — this version reads the live profile in a functional
  // setProfile and so always pins-if-missing exactly once.
  const keepAndClearFilter = useCallback(
    (set: Filter[]) => {
      if (set.length > 0) {
        const key = setKey(set);
        setProfile((prev) => {
          const current = prev.pinnedFilters ?? [];
          const exists = current.some(
            (existing) => setKey(existing as Filter[]) === key,
          );
          if (exists) return prev;
          if (current.length >= PIN_LIMIT) {
            notify.showSnackbar({ message: t.pinCapReached(PIN_LIMIT) });
            return prev;
          }
          return { ...prev, pinnedFilters: [...current, set] };
        });
      }
      setFiltersState([]);
    },
    [setProfile, notify, t],
  );

  // Explicit clear-all from the Manage Dashboard Tiles sheet header.
  // Writes an empty array (NOT undefined) so the Dashboard hides the
  // tile row entirely — undefined would re-trigger the defaults.
  const clearHomeStatTiles = useCallback(() => {
    setProfile((prev) => ({ ...prev, homeStatTiles: [] }));
  }, [setProfile]);

  // Pick a Filter as a Dashboard stat tile. Toggling a picked tile
  // removes it; no max-count cap — the Dashboard row scrolls
  // horizontally when picks exceed the visible width. First
  // interaction (homeStatTiles === undefined) materializes the defaults
  // so tapping "1" on a default actually removes it. Removing every
  // tile leaves the array empty (Dashboard hides the row); we never
  // auto-revert to defaults.
  const toggleHomeStatTile = useCallback(
    (f: Filter) => {
      setProfile((prev) => {
        const current: string[] =
          prev.homeStatTiles === undefined
            ? DEFAULT_HOME_STAT_TILES
            : prev.homeStatTiles;
        if (current.includes(f)) {
          return { ...prev, homeStatTiles: current.filter((x) => x !== f) };
        }
        return { ...prev, homeStatTiles: [...current, f] };
      });
    },
    [setProfile],
  );

  // `loaded` aggregate computed AFTER the grocery slice initializes
  // its own *Loaded flags — see further down. Defined here only
  // as a forward reference so existing reads upstream don't break.
  // ---- Stable callbacks ----

  // PR 4 todos slice — owns todos + todoReferences + selectedTrashIds
  // state, all todo + subtask mutations, trash bulk ops, and the
  // pebble-accounting chokepoint (applyPebbleDelta + Timed). The
  // chokepoint is re-exposed so the grocery slice's bucket completions
  // can route through the same path.
  const todosBundle = useTodosSlice(adapter, {
    onSaved,
    profile,
    setProfile,
    profileRef,
    profileLoaded,
    filter,
    filterRef,
    uid,
    t,
    notify,
  });
  const {
    todos,
    setTodos,
    todosLoaded,
    todoReferences,
    selectedTrashIds,
    todosRef,
    applyPebbleDelta,
    applyPebbleDeltaTimed,
    toggle,
    moveToTrash,
    restoreFromTrash,
    permanentlyDelete,
    updatePriority,
    updateDueDate,
    updateReminder,
    updateTaskCategory,
    updateText,
    updateNotes,
    updateRecurrence,
    toggleTrashSelection,
    applySeriesFutureEdits,
    moveSeriesFutureToTrash,
    addSubtask,
    toggleSubtask,
    updateSubtaskText,
    updateSubtaskPriority,
    updateSubtaskDueDate,
    removeSubtask,
    clearSubtasks,
    deferOverdue,
    bulkDeferTodos,
    snooze,
    addTask,
    emptyTrash,
    clearTrashSelection,
    bulkRestore,
    bulkPermanentDelete,
    clearDone,
  } = todosBundle;
  // applyPebbleDelta is no longer read in the composer body — the
  // slice handles every call site internally. Composer re-exposes it
  // in the return for back-compat with any caller that reaches in.
  void applyPebbleDelta;

  // Grocery slice — placed after the todos slice so its
  // toggleGroceryChecked can route bucket-completion deltas through
  // applyPebbleDeltaTimed (now owned by the todos slice).
  const {
    groceries,
    setGroceries,
    groceriesLoaded,
    groceryGroups,
    setGroceryGroups,
    groceryGroupsLoaded,
    addGrocery,
    toggleGroceryChecked,
    editGrocery,
    deleteGrocery,
    addGroceryGroup,
    addGroceryStore,
    renameGroceryStore,
    deleteGroceryStore,
    linkItemsToStore,
    reorderGroceryStores,
    toggleGroceryStoreHidden,
    pinGroceryStore,
    setActiveGroceryStore,
    setActiveGroceryDept,
    pinGroceryDept,
  } = useGroceriesSlice(adapter, {
    onSaved,
    setProfile,
    profileRef,
    notify,
    t,
    applyPebbleDeltaTimed,
  });

  const loaded =
    categoriesLoaded &&
    todosLoaded &&
    profileLoaded &&
    groceriesLoaded &&
    groceryGroupsLoaded;


  function deleteCategory(id: string) {
    if (categories.length <= 1) return;
    const next = categoryDelete(todos, categories, id);
    if (!next.deleted) return;
    setTodos(next.todos);
    setCategories(next.categories);
    if (isCategoryFilter(filter) && categoryIdFromFilter(filter) === id)
      setFilter("all");
    // Strip any pinned set that contained this category so the
    // persisted profile doesn't accumulate stale `cat:<deleted-id>`
    // entries that would render as ghost pills (or come back as a
    // wrongly-typed re-create with the same id).
    const ghostFilter = `cat:${id}`;
    setProfile((prev) => {
      const pinned = prev.pinnedFilters;
      if (!pinned) return prev;
      let touched = false;
      const cleaned: string[][] = [];
      for (const set of pinned) {
        if (set.includes(ghostFilter)) {
          touched = true;
          const survivors = set.filter((f) => f !== ghostFilter);
          if (survivors.length > 0) cleaned.push(survivors);
        } else {
          cleaned.push(set);
        }
      }
      if (!touched) return prev;
      return { ...prev, pinnedFilters: cleaned.length > 0 ? cleaned : undefined };
    });
  }

  function changeView(v: ViewMode) {
    setProfile((prev) => ({ ...prev, view: v }));
    setFilter(v === "category" ? "all" : "open");
  }

  function renameStatus(id: StatusFilter, label: string) {
    setProfile((prev) => statusRename(prev, id, label));
  }

  function toggleStatusHidden(id: StatusFilter) {
    setProfile((prev) => {
      const next = statusToggleHidden(prev, id);
      // If the status was just hidden and any pinned set referenced
      // it, strip it from those sets so the FilterBar doesn't
      // surface an invisible filter as part of a composite pill.
      const overrides = next.statuses ?? [];
      const isNowHidden = overrides.find((s) => s.id === id)?.hidden === true;
      if (!isNowHidden || !next.pinnedFilters) return next;
      let touched = false;
      const cleaned: string[][] = [];
      for (const set of next.pinnedFilters) {
        if (set.includes(id)) {
          touched = true;
          const survivors = set.filter((f) => f !== id);
          if (survivors.length > 0) cleaned.push(survivors);
        } else {
          cleaned.push(set);
        }
      }
      if (!touched) return next;
      return {
        ...next,
        pinnedFilters: cleaned.length > 0 ? cleaned : undefined,
      };
    });
  }

  function reorderStatuses(newOrder: StatusFilter[]) {
    setProfile((prev) => statusReorder(prev, newOrder));
  }

  function togglePriorityHidden(id: Priority) {
    setProfile((prev) => {
      const next = priorityToggleHidden(prev, id);
      const overrides = next.priorities ?? [];
      const isNowHidden = overrides.find((p) => p.id === id)?.hidden === true;
      const pinId = `pri:${id}`;
      if (!isNowHidden || !next.pinnedFilters) return next;
      let touched = false;
      const cleaned: string[][] = [];
      for (const set of next.pinnedFilters) {
        if (set.includes(pinId)) {
          touched = true;
          const survivors = set.filter((f) => f !== pinId);
          if (survivors.length > 0) cleaned.push(survivors);
        } else {
          cleaned.push(set);
        }
      }
      if (!touched) return next;
      return {
        ...next,
        pinnedFilters: cleaned.length > 0 ? cleaned : undefined,
      };
    });
  }

  function reorderPriorities(newOrder: Priority[]) {
    setProfile((prev) => priorityReorder(prev, newOrder));
  }

  // ---- Derived state (memoized via core.deriveState) ----

  const derived = useMemo(
    () =>
      deriveState({
        todos,
        filters,
        categories,
        t,
      }),
    [todos, filters, categories, t],
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
  // De-pebble the mascot voice when the user has opted into
  // theme-from-avatar with a non-default preset. The picker drops any
  // lines mentioning the language's pebble token so the home subtitle
  // stays consistent with the themed cairn copy.
  const dethemePebbles =
    profile.themeFromAvatar === true && !!collectedNounKeyFor(profile.avatar);
  const mascotLine = pickMascotLine(lang, greetingKey, todayCount, todayDate, dethemePebbles);
  // Subtitle behavior is opt-in via the quote field:
  //   - Quote set → alternate user's quote with Mochi's line by
  //     day-stable seed (predictable rotation, steady within a
  //     session).
  //   - Quote empty → no subtitle line at all (mascot line is
  //     gated on the quote too). Emptying the quote field is the
  //     user's signal that they want the greeting bar quieter;
  //     the prior behavior of falling back to Mochi's voice felt
  //     like the empty-state didn't take effect.
  const identityLineIsQuote = !!trimmedQuote && dateSeed(todayDate) % 2 === 0;
  const identityLine = !trimmedQuote
    ? ''
    : identityLineIsQuote
      ? trimmedQuote
      : mascotLine;
  // Legacy: still expose quoteLine for any caller that wants the raw
  // value, but App.tsx now reads identityLine + identityLineIsQuote.
  const quoteLine = trimmedQuote;
  const orderedStatuses = getOrderedStatuses(profile, t);
  const orderedPriorities = getOrderedPriorities(profile, t);
  const orderedVisibleStatuses = getOrderedVisibleStatuses(profile, t);
  const todayPebbleCounts = getTodayPebbles(profile, todayDate);
  const todayTaskPebbles = todayPebbleCounts.task;
  const todaySubtaskPebbles = todayPebbleCounts.subtask;
  const todayPebbles = todayTaskPebbles + todaySubtaskPebbles;
  const lifetimePebbles = profile.lifetimePebbles ?? 0;

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
    addGroceryGroup,
    renameGroceryStore,
    deleteGroceryStore,
    linkItemsToStore,
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
    // Same shape as byCategory but keyed by Priority. Used by
    // CategorySheet + ManageHomeTilesSheet to render the new
    // PRIORITIES section.
    byPriority: derived.byPriorityTotal,
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
    /** True when the user has both completionAnimation on AND
     * reduceMotion off — the same check used internally for
     * deferred pebble flights. Exposed so screens can hide the
     * PebbleStrip entirely when the user has opted out of motion. */
    animationOn,
    orderedStatuses,
    orderedPriorities,
    orderedVisibleStatuses,
    setFilter,
    // Multi-select filter API. `filters` is the source of truth;
    // `filter` (above) is the single-pick alias for legacy code paths.
    filters,
    setFilters,
    toggleFilter,
    clearFilters,
    pinFilter,
    keepAndClearFilter,
    toggleHomeStatTile,
    clearHomeStatTiles,
    // Effective tiles for both Home rendering and Manage Filter badge
    // display. undefined (never customized) falls through to defaults;
    // an explicit empty array is respected as "no tiles" so the user
    // can opt out of the stats row entirely.
    effectiveHomeStatTiles: (
      profile.homeStatTiles === undefined
        ? DEFAULT_HOME_STAT_TILES
        : profile.homeStatTiles
    ) as Filter[],
    saveProfile: setProfile,
    changeView,
    renameStatus,
    toggleStatusHidden,
    reorderStatuses,
    togglePriorityHidden,
    reorderPriorities,
    toggle,
    moveToTrash,
    moveSeriesFutureToTrash,
    applySeriesFutureEdits,
    restoreFromTrash,
    permanentlyDelete,
    updatePriority,
    updateDueDate,
    updateReminder,
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
    clearSubtasks,
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
