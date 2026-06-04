import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Filter, ViewMode } from "../core-bindings/types";
import {
  getOrderedStatuses,
  getOrderedVisibleStatuses,
} from "../../../core/src/domain/statuses";
import { getOrderedPriorities } from "../../../core/src/domain/priorities";
import { useCategoriesSlice } from "./slices/useCategoriesSlice";
import { useProfileSlice } from "./slices/useProfileSlice";
import { useGroceriesSlice } from "./slices/useGroceriesSlice";
import { useTodosSlice } from "./slices/useTodosSlice";
import { useLang } from "../app/LangContext";
import { useAuth } from "../app/AuthContext";
import { useNotify } from "../app/notify";
import { storage as localAdapter } from "../adapters/persistence";
import { db } from "../adapters/firebase";
import { makeFirestoreAdapter } from "../adapters/firestoreAdapter";
import { StorageAdapter, USER_STATE_KEYS } from "../../../core/src/ports/persistence";
import { createTodoStore } from "../../../core/src/store";
import { DEFAULT_HOME_STAT_TILES } from "../../../core/src/logic/filters";
import { todayLocal, genUuid } from "../../../core/src/logic/utils";
import { getTodayPebbles, collectedNounKeyFor } from "../core-bindings/profile";

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

import { pickMascotLine, dateSeed } from "../features/mochi/mascotLines";
import { Analytics } from "../adapters/analytics";

export function useTodoStore() {
  const { lang, t } = useLang();
  const { user } = useAuth();
  const notify = useNotify();

  // The framework-free orchestration surface (core). The shell below
  // owns persisted state (useSyncedState) + stable callbacks; it drives
  // store.actions (pure transforms) through setState and feeds live
  // state to store.derive. Memoized on `t` (the only deps member that
  // varies); actions are pure so this keeps useCallback identities
  // stable across ordinary renders.
  const store = useMemo(
    () => createTodoStore({ now: Date.now, genId: genUuid, t }),
    [t],
  );

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


  // ---- Filter state (session — not persisted) ----
  // Multi-faceted selection. Empty = "all". OR within type group, AND
  // across type groups (open OR done) AND (Home OR Work). See
  // core/derive.ts for the matching predicate.
  const [filters, setFiltersState] = useState<Filter[]>([]);
  // Legacy single-filter alias. `filter === 'all'` when 0 or 2+ are
  // selected; the lone value when exactly one is. Keeps every
  // existing `store.filter === '...'` comparison working.
  const filter: Filter = filters.length === 1 ? filters[0] : "all";
  const setFilter = useCallback((f: Filter) => {
    if (f === "all") setFiltersState([]);
    else setFiltersState([f]);
  }, []);
  const toggleFilter = useCallback((f: Filter) => {
    if (f === "all") {
      setFiltersState([]);
      return;
    }
    setFiltersState((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
    );
  }, []);
  const clearFilters = useCallback(() => setFiltersState([]), []);
  const setFilters = useCallback((f: Filter[]) => setFiltersState(f), []);

  // ---- Profile + categories slices ----
  // Profile slice now also owns every profile-touching mutation
  // (pinFilter, keepAndClearFilter, home tiles, status/priority
  // overrides, changeView), so the composer only forwards setFilter +
  // clearFilters for the two callbacks that cross into session state.
  const {
    profile,
    setProfile,
    profileLoaded,
    lastSavedAt,
    onSaved,
    pinFilter,
    keepAndClearFilter,
    toggleHomeStatTile,
    clearHomeStatTiles,
    changeView,
    renameStatus,
    toggleStatusHidden,
    reorderStatuses,
    togglePriorityHidden,
    reorderPriorities,
  } = useProfileSlice(adapter, {
    setFilter,
    clearFilters,
    t,
    notify,
    actions: store.actions,
  });
  const {
    categories,
    setCategories,
    categoriesLoaded,
    addCategory,
    editCategory,
    reorderCategories,
  } = useCategoriesSlice(adapter, store.actions, onSaved);

  const view: ViewMode = profile.view ?? "status";
  // Derived bool re-exposed for screens that hide motion-bound chrome
  // when the user has opted out. Same expression the todos slice
  // uses internally to decide whether to defer pebble flights.
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

  // pinFilter / keepAndClearFilter / clearHomeStatTiles /
  // toggleHomeStatTile moved into useProfileSlice (PR 5). The
  // composer destructures them from the slice return at the top.

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
    actions: store.actions,
  });
  const {
    todos,
    setTodos,
    todosLoaded,
    todoReferences,
    setTodoReferences,
    selectedTrashIds,
    todosRef,
    applyPebbleDelta,
    applyPebbleDeltaTimed,
    toggle,
    moveToTrash,
    skipTodo,
    detachFromSeries,
    applyRecurrenceChange,
    applySeriesSubtasks,
    restoreFromTrash,
    permanentlyDelete,
    updatePriority,
    updateDueDate,
    updateReminder,
    updateReminders,
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
    actions: store.actions,
  });

  const loaded =
    categoriesLoaded &&
    todosLoaded &&
    profileLoaded &&
    groceriesLoaded &&
    groceryGroupsLoaded;

  // "Delete data only" — clears every per-user state doc the app
  // knows about. The auth user stays intact. SheetContext follows
  // the await with a signOut() so the user re-hydrates from a
  // guaranteed-empty cloud on next sign-in.
  //
  // Cloud strategy: setItem the empty wrapper (NOT removeItem). The
  // prior delete-then-let-the-debounce-recreate approach lost to
  // races: writes could fire BEFORE the deletes commit (stale state
  // re-uploaded), the Firestore adapter's hasPendingWrites skip
  // swallowed the post-delete snapshot, and signOut tearing down
  // listeners mid-flight left some keys partially cleared. Writing
  // an empty wrapper directly is one round-trip per key and lands
  // in cloud as `{version:1, data:[]}` — every slice's parser
  // returns its initial value for that input (empty array, or
  // SEED_CATEGORIES / SEED_PROFILE for the seeded slices), so the
  // next hydrate is clean.
  //
  // Local strategy: AsyncStorage.removeItem every known key in
  // parallel. Without this, migrateLocalToCloud on next sign-in
  // would push the still-present local copy back to the freshly-
  // cleared cloud (the inverse race that brought back the data the
  // user just deleted). signOut() ITSELF only multiRemove's the
  // legacy ['todos','categories','profile'] subset; we own
  // todoReferences / groceries / groceryGroups too.
  //
  // No setX calls: those triggered useSyncedState write-debounces
  // that raced everything else. Letting signOut re-hydrate is the
  // calmer guarantee.
  const clearAllData = useCallback(async () => {
    const empty = JSON.stringify({ version: 1, data: [] });
    await Promise.all(
      USER_STATE_KEYS.map((key) =>
        adapter.setItem(key, empty).catch((err) => {
          console.warn(`clearAllData: cloud overwrite failed for ${key}`, err);
        }),
      ),
    );
    await Promise.all(
      USER_STATE_KEYS.map((key) =>
        AsyncStorage.removeItem(key).catch(() => {
          // best-effort — already absent or storage hiccup
        }),
      ),
    );
  }, [adapter]);


  function deleteCategory(id: string) {
    const res = store.actions.deleteCategoryCascade({
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
    // Strip any pinned set that contained this category so the persisted
    // profile doesn't accumulate stale `cat:<deleted-id>` ghost pills.
    if (res.pinnedFilters !== profile.pinnedFilters) {
      setProfile((prev) => ({ ...prev, pinnedFilters: res.pinnedFilters }));
    }
  }


  // ---- Derived state (memoized via core.deriveState) ----

  const derived = useMemo(
    () =>
      store.derive({
        todos,
        filters,
        categories,
        t,
      }),
    [store, todos, filters, categories, t],
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
    skipTodo,
    detachFromSeries,
    applyRecurrenceChange,
    applySeriesSubtasks,
    moveSeriesFutureToTrash,
    applySeriesFutureEdits,
    restoreFromTrash,
    permanentlyDelete,
    updatePriority,
    updateDueDate,
    updateReminder,
    updateReminders,
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
    clearAllData,
  };
}
