import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { Filter, ViewMode } from "../core-bindings/types";
import {
  getOrderedStatuses,
} from "../../../core/src/domain/statuses";
import { getOrderedPriorities } from "../../../core/src/domain/priorities";
import { useCategoriesSlice } from "./slices/useCategoriesSlice";
import { useProfileSlice } from "./slices/useProfileSlice";
import { useGroceriesSlice } from "./slices/useGroceriesSlice";
import { useTodosSlice, type SilentOpt, type Undo } from "./slices/useTodosSlice";
import type { UndoOutcome } from "./undo";
import { useLang } from "../app/LangContext";
import { useAuth } from "../app/AuthContext";
import { useNotify } from "../app/notify";
import { useReducedMotion } from "../app/useReducedMotion";
import { db } from "../adapters/firebase";
import { makeFirestoreAdapter } from "../adapters/firestoreAdapter";
import {
  StorageAdapter,
  USER_STATE_KEYS,
  wrapEnvelope,
} from "../../../core/src/ports/persistence";
import { createTodoStore, refreshUsageSignals } from "../../../core/src/store";
import { todayLocal } from "../../../core/src/logic/utils";
import { dailyQuoteIndex, quoteAt } from "../../../core/src/data/quotes";
import type { Profile } from "../../../core/src/data/profile";
import { onSyncIssue } from "./useSyncedState";

// Sync-problem snackbars. English-only launch — TODO(i18n owner): move into
// core/src/data/i18n.ts when the language picker returns.
const SYNC_TOO_LARGE_MESSAGE =
  "Your list is very large — clear finished to-dos in Done to keep syncing.";
// Truthful: a rejected write is retried with the next edit (useSyncedState
// rolls back its "last saved" marker), it doesn't "stay on this device".
const SYNC_WRITE_FAILED_MESSAGE =
  "Couldn't save your latest change. It'll try again with your next edit.";

/** How long "Delete data only" waits for the server to confirm the wipe
 * before signing out anyway (offline: Firestore keeps the writes queued). */
const CLEAR_DATA_CONFIRM_MS = 5000;

/** Outcome of clearAllData: `synced` = the server confirmed every key;
 * `pending` = still queued (offline) when the wait ran out. */
export type ClearDataResult = "synced" | "pending";

/** ms until the next local midnight (+1s so todayLocal() has rolled over). */
function msUntilNextLocalMidnight(now = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 1, 0);
  return next.getTime() - now.getTime();
}

/** Signed out there is no account to sync with: reads are empty and writes
 * go nowhere. (The old AsyncStorage "local mode" and its local→cloud
 * migration were removed once sign-in became mandatory.) */
const SIGNED_OUT_ADAPTER: StorageAdapter = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

export function useTodoStore() {
  const { t } = useLang();
  const { user } = useAuth();
  const notify = useNotify();

  // The framework-free orchestration surface (core). The shell below
  // owns persisted state (useSyncedState) + stable callbacks; it drives
  // store.actions (pure transforms) through setState and feeds live
  // state to store.derive. Memoized on `t` (the only deps member that
  // varies); actions are pure so this keeps useCallback identities
  // stable across ordinary renders.
  const store = useMemo(() => createTodoStore({ t }), [t]);

  // Memoize on uid (not the User object) so token refresh — which replaces
  // the User reference ~hourly — doesn't recreate the adapter and tear down
  // Firestore listeners. Sign-in is mandatory (AppGate renders <SignIn>
  // until there's a user), so signed out there is nothing to persist.
  const uid = user?.uid ?? null;
  const adapter = useMemo<StorageAdapter>(
    () => (uid ? makeFirestoreAdapter(db, uid) : SIGNED_OUT_ADAPTER),
    [uid],
  );


  // ---- Filter state (session — not persisted) ----
  // Multi-faceted selection. Empty = "all". OR within type group, AND
  // across type groups (open OR done) AND (Home OR Work). See
  // core/derive.ts for the matching predicate.
  const [filters, setFiltersState] = useState<Filter[]>([]);
  // A filter like `cat:<id>` belongs to one account — clear it when the
  // signed-in user changes so the next user doesn't land on an empty list.
  useEffect(() => {
    setFiltersState([]);
  }, [uid]);
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

  // ---- Day key ----
  // The local "today" (YYYY-MM-DD). State, not a per-render todayLocal(), so
  // everything date-bound (derive's Today/overdue groups, the daily quote,
  // usage signals) recomputes when the day rolls over while the app stays
  // open: a timer fires at the next local midnight, and returning to the
  // foreground re-checks (timers don't run while suspended; time zone may
  // have changed).
  const [today, setToday] = useState(todayLocal);
  useEffect(() => {
    const handle = setTimeout(
      () => setToday(todayLocal()),
      msUntilNextLocalMidnight(),
    );
    return () => clearTimeout(handle);
  }, [today]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") setToday(todayLocal());
    });
    return () => sub.remove();
  }, []);

  // ---- Profile + categories slices ----
  // Profile slice now also owns every profile-touching mutation
  // (pinFilter, keepAndClearFilter, home tiles, status/priority
  // overrides, changeView), so the composer only forwards setFilter +
  // clearFilters for the two callbacks that cross into session state.
  const {
    profile,
    setProfile,
    profileLoaded,
    profileTrusted,
    pinFilter,
    keepAndClearFilter,
    renameStatus,
    reorderStatuses,
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
  } = useCategoriesSlice(adapter, store.actions);

  // OS-level Reduce Motion — folded into every animation gate below so the
  // system accessibility setting is honored, not just the in-app toggle.
  const osReduceMotion = useReducedMotion();

  const view: ViewMode = profile.view ?? "status";
  // Derived bool re-exposed for screens that gate motion-bound chrome
  // when the user has opted out. Same expression the todos slice
  // uses internally to gate the completion animation.
  const animationOn =
    profile.completionAnimation !== false &&
    profile.reduceMotion !== true &&
    !osReduceMotion;
  // Effective motion-reduction for prop-based consumers (SplashOverlay,
  // ChatSheet) — the in-app toggle OR the OS setting.
  const reduceMotion = profile.reduceMotion === true || osReduceMotion;
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
  // Latest categories / filter selection, for Undos that run later.
  const categoriesRef = useRef(categories);
  useEffect(() => {
    categoriesRef.current = categories;
  }, [categories]);
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // pinFilter / keepAndClearFilter / clearHomeStatTiles /
  // toggleHomeStatTile moved into useProfileSlice (PR 5). The
  // composer destructures them from the slice return at the top.

  // `loaded` aggregate computed AFTER the grocery slice initializes
  // its own *Loaded flags — see further down. Defined here only
  // as a forward reference so existing reads upstream don't break.
  // ---- Stable callbacks ----

  // PR 4 todos slice — owns todos + todoReferences + selectedTrashIds
  // state, all todo + subtask mutations, and trash bulk ops.
  const todosBundle = useTodosSlice(adapter, {
    filter,
    filterRef,
    uid,
    today,
    t,
    notify,
    actions: store.actions,
  });
  const {
    todos,
    todosLoaded,
    todosTrusted,
    todoReferences,
    selectedTrashIds,
    todosRef,
    toggle,
    moveToTrash,
    skipTodo,
    skipSeriesFuture,
    detachFromSeries,
    commitSeriesEdits,
    restoreFromTrash,
    permanentlyDelete,
    permanentlyDeleteSeriesFuture,
    permanentlyDeleteSeries,
    rescheduleSeriesFrom,
    updatePriority,
    updateDueDate,
    updateReminders,
    updateTaskCategory,
    updateText,
    updateNotes,
    updateRecurrence,
    toggleTrashSelection,
    moveSeriesFutureToTrash,
    moveSeriesToTrash,
    addSubtask,
    toggleSubtask,
    revertTodo,
    updateSubtaskText,
    updateSubtaskPriority,
    updateSubtaskDueDate,
    removeSubtask,
    clearSubtasks,
    deferOverdue,
    bulkDeferTodos,
    snooze,
    addTask,
    addTaskWithUndo,
    applyTracked,
    undoTracked,
    emptyTrash,
    clearTrashSelection,
    bulkRestore,
    bulkPermanentDelete,
    clearDone,
  } = todosBundle;

  // Grocery slice.
  const {
    groceries,
    groceriesLoaded,
    groceryGroups,
    groceryGroupsLoaded,
    addGrocery,
    restoreGrocery,
    toggleGroceryChecked,
    checkOffGrocery,
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
    groceriesRef,
  } = useGroceriesSlice(adapter, {
    setProfile,
    profileRef,
    notify,
    t,
    actions: store.actions,
  });

  const loaded =
    categoriesLoaded &&
    todosLoaded &&
    profileLoaded &&
    groceriesLoaded &&
    groceryGroupsLoaded;
  // True only when profile AND todos came from real data — not defaults
  // after a failed / timed-out hydrate. Effects that would act destructively
  // on defaults (reminder sync cancelling every reminder, onboarding over an
  // onboarded account) gate on this.
  const dataTrusted = loaded && profileTrusted && todosTrusted;

  // Calm, once-per-session notices for sync problems the user can act on
  // (or should at least know about). Reset per account.
  const syncNoticeShownRef = useRef({ tooLarge: false, writeFailed: false });
  useEffect(() => {
    syncNoticeShownRef.current = { tooLarge: false, writeFailed: false };
  }, [uid]);
  useEffect(
    () =>
      onSyncIssue((issue) => {
        const shown = syncNoticeShownRef.current;
        if (shown[issue.kind]) return;
        shown[issue.kind] = true;
        notify.showSnackbar({
          message:
            issue.kind === "tooLarge"
              ? SYNC_TOO_LARGE_MESSAGE
              : SYNC_WRITE_FAILED_MESSAGE,
        });
      }),
    [notify],
  );

  // P0 Tier 2 measurement (docs/MEASUREMENT-PLAN.md): stamp the
  // privacy-preserving signals — createdAt (once), lastActiveDate (today),
  // activatedAt (once a to-do is completed) — in their OWN `state/signals`
  // doc, never the profile (rewriting the whole profile could push defaults or
  // a stale cache over real data). Runs on open, on every return to the
  // foreground (an app resumed days later still counts as active), and when the
  // first to-do gets completed. A failed read writes nothing. First-party +
  // aggregate-only, never behavioral tracking.
  const hasCompletedTodo = todos.some((td) => td.done);
  useEffect(() => {
    if (!loaded || !uid) return;
    const run = () => {
      void refreshUsageSignals(adapter, {
        nowISO: new Date().toISOString(),
        today: todayLocal(),
        hasCompletedTodo: todosRef.current.some((td) => td.done),
      });
    };
    run();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    return () => sub.remove();
  }, [loaded, uid, adapter, hasCompletedTodo, todosRef]);

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
  // No setX calls: those triggered useSyncedState write-debounces
  // that raced everything else. Letting signOut re-hydrate is the
  // calmer guarantee.
  //
  // Waits (bounded) for the server: Firestore resolves setDoc only once the
  // server confirms, so unbounded this hung "Deleting…" forever offline —
  // but fire-and-forget then signOut meant the user was told it was done
  // while nothing had reached the server. Resolves `synced` when every key
  // is confirmed, `pending` when the wait ran out (the writes stay queued
  // and go out when the device is back online); rejects if a write was
  // refused.
  const clearAllData = useCallback(async (): Promise<ClearDataResult> => {
    const empty = wrapEnvelope([]);
    const writes = Promise.all(USER_STATE_KEYS.map((key) => adapter.setItem(key, empty)));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<ClearDataResult>((resolve) => {
      timer = setTimeout(() => resolve("pending"), CLEAR_DATA_CONFIRM_MS);
    });
    try {
      return await Promise.race([writes.then((): ClearDataResult => "synced"), timedOut]);
    } finally {
      clearTimeout(timer);
      // A rejection after the timeout won the race must not go unhandled.
      writes.catch((err) => console.warn("clearAllData: cloud overwrite failed", err));
    }
  }, [adapter]);

  // Patch, or an updater for read-modify-write. Updater form avoids
  // clobbering a profile change that landed since the caller rendered.
  const saveProfile = useCallback(
    (patch: Partial<Profile> | ((p: Profile) => Profile)) => {
      setProfile(typeof patch === "function" ? patch : (p) => ({ ...p, ...patch }));
    },
    [setProfile],
  );

  // Returns an Undo (Ask Mochi's inline "✓ Done · Undo") that puts the
  // category back in place and reverts the to-dos the cascade changed.
  // `silent`: a partial to-do revert reports "partial" without the store's
  // snackbar (Ask Mochi says it inline).
  const deleteCategory = useCallback((id: string, opts?: SilentOpt): Undo | null => {
    const res = store.actions.deleteCategoryCascade({
      todos: todosRef.current,
      categories,
      id,
      filter,
      filters,
      pinnedFilters: profile.pinnedFilters,
      homeStatTiles: profile.homeStatTiles,
    });
    if (!res.changed) return null;
    // Applied to the FRESHEST lists: a Mochi batch ("create Work, delete
    // Errands", or "move X to Home, delete Errands") applies earlier ops in
    // the same tick, and the render-time result clobbered them. The to-do
    // change is tracked, so its Undo is exact (later edits survive).
    const cascadeFrom = (t: typeof todos, c: typeof categories) =>
      store.actions.deleteCategoryCascade({
        todos: t,
        categories: c,
        id,
        filter,
        pinnedFilters: profile.pinnedFilters,
      });
    const todosChange = applyTracked((prev) => cascadeFrom(prev, categories).todos);
    // The removed category + its slot, captured from the list it was
    // actually removed from (the updater has run by the time Undo can).
    let removed: { cat: (typeof categories)[number]; idx: number } | null = null;
    setCategories((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx >= 0) removed = { cat: prev[idx], idx };
      return cascadeFrom(todosRef.current, prev).categories;
    });
    // The filter selection the delete leaves (single legacy filter, then the
    // multi-select set — the latter wins), as ONE array object so the Undo
    // can tell whether the user changed it since.
    const filtersBefore = filters;
    let filtersAfter: Filter[] | null = null;
    if (res.filter !== null) filtersAfter = res.filter === "all" ? [] : [res.filter];
    if (res.filters !== null) filtersAfter = res.filters;
    if (filtersAfter) setFiltersState(filtersAfter);
    // Strip any pinned set that contained this category so the persisted
    // profile doesn't accumulate stale `cat:<deleted-id>` ghost pills.
    // Home stat tiles drop the deleted category too (a ghost `cat:<id>`).
    const pinnedBefore = profile.pinnedFilters;
    const tilesBefore = profile.homeStatTiles;
    const pinnedChanged = res.pinnedFilters !== pinnedBefore;
    const tilesChanged = res.homeStatTiles !== tilesBefore;
    if (pinnedChanged || tilesChanged) {
      setProfile((prev) => ({
        ...prev,
        ...(pinnedChanged ? { pinnedFilters: res.pinnedFilters } : {}),
        ...(tilesChanged ? { homeStatTiles: res.homeStatTiles } : {}),
      }));
    }
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    // Puts back the category in its slot, the to-dos the cascade changed,
    // and the filter / pinned set / Home tiles it stripped — each only if
    // still as the delete left it. True when anything came back; "partial"
    // when the to-dos came back only in part (edited since, kept).
    return (): UndoOutcome => {
      let restored = false;
      const todosOut = todosChange ? undoTracked(todosChange, opts) : false;
      if (todosOut !== false) restored = true;
      const r = removed as { cat: (typeof categories)[number]; idx: number } | null;
      if (r && !categoriesRef.current.some((c) => c.id === id)) {
        restored = true;
        setCategories((prev) =>
          prev.some((c) => c.id === id) ? prev : [...prev.slice(0, r.idx), r.cat, ...prev.slice(r.idx)],
        );
      }
      if (filtersAfter && filtersRef.current === filtersAfter) {
        restored = true;
        setFiltersState((cur) => (cur === filtersAfter ? filtersBefore : cur));
      }
      const prof = profileRef.current;
      const putPinned = pinnedChanged && same(prof.pinnedFilters, res.pinnedFilters);
      const putTiles = tilesChanged && same(prof.homeStatTiles, res.homeStatTiles);
      if (putPinned || putTiles) {
        restored = true;
        setProfile((prev) => ({
          ...prev,
          ...(putPinned && same(prev.pinnedFilters, res.pinnedFilters) ? { pinnedFilters: pinnedBefore } : {}),
          ...(putTiles && same(prev.homeStatTiles, res.homeStatTiles) ? { homeStatTiles: tilesBefore } : {}),
        }));
      }
      return todosOut === "partial" ? "partial" : restored;
    };
  }, [store, todosRef, categories, filter, filters, profile.pinnedFilters, profile.homeStatTiles, applyTracked, undoTracked, setCategories, setProfile]);


  // ---- Derived state (memoized via core.deriveState) ----

  // `today` is a dep (deriveState reads the clock itself) so the Today /
  // carried-over grouping is recomputed when the day rolls over.
  const derived = useMemo(
    () => {
      void today;
      return store.derive({
        todos,
        filters,
        categories,
        t,
      });
    },
    [store, todos, filters, categories, t, today],
  );

  const hour = new Date().getHours();
  const greetingKey: "morning" | "afternoon" | "evening" =
    hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const greetingName =
    profile.firstName?.trim() || profile.name.trim();
  // No name yet → just the greeting (not "Good morning, ").
  const headerLine = greetingName
    ? `${t.greeting[greetingKey]}, ${greetingName}`
    : t.greeting[greetingKey];
  const trimmedQuote =
    profile.quote && profile.quote.trim() ? profile.quote.trim() : '';
  const todayDate = today;
  // Subtitle source. Resolution:
  //   - 'daily'  → date-seeded curated quote, stable all day, rotates at
  //                midnight; honors a per-day "show me another" shuffle.
  //   - 'custom' → the user's own quote text.
  //   - 'off'    → no subtitle.
  // Default (undefined) is 'custom' → empty box = no subtitle; the daily
  // quote is opt-in via Profile's "Random daily".
  const quoteMode = profile.quoteMode ?? 'custom';
  const dailyQuote =
    quoteMode === 'daily'
      ? quoteAt(
          profile.quoteShuffle?.date === todayDate
            ? profile.quoteShuffle.index
            : dailyQuoteIndex(todayDate),
        )
      : '';
  const identityLine =
    quoteMode === 'off' ? '' : quoteMode === 'custom' ? trimmedQuote : dailyQuote;
  const identityLineIsQuote = identityLine !== '';
  // Memoized: fresh arrays every render would bust the store memo below.
  const orderedStatuses = useMemo(() => getOrderedStatuses(profile, t), [profile, t]);
  const orderedPriorities = useMemo(() => getOrderedPriorities(profile, t), [profile, t]);

  // ONE stable object per state change: StoreContext hands this to every
  // screen, so a fresh literal each render re-rendered every consumer on
  // every tick of the provider (snackbar, timers, unrelated parent state).
  return useMemo(() => ({
    todos,
    todoReferences,
    categories,
    groceries,
    addGrocery,
    restoreGrocery,
    toggleGroceryChecked,
    checkOffGrocery,
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
    profile,
    filter,
    view,
    loaded,
    /** Profile came from real data (not SEED_PROFILE after a failed /
     * timed-out hydrate). Gate one-shot decisions like onboarding on it. */
    profileTrusted,
    /** loaded AND profile + todos came from real data. */
    dataTrusted,
    /** Local day key (YYYY-MM-DD); changes at local midnight / on resume.
     * Use as a dep for once-per-day work (e.g. the series top-up latch). */
    today,
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
    identityLine,
    identityLineIsQuote,
    /** True when the user has both completionAnimation on AND
     * reduceMotion off. Gates the completion animation. */
    animationOn,
    /** Effective motion-reduction (in-app toggle OR OS Reduce Motion). For
     * prop-based animation consumers like SplashOverlay / ChatSheet. */
    reduceMotion,
    orderedStatuses,
    orderedPriorities,
    setFilter,
    // Multi-select filter API. `filters` is the source of truth;
    // `filter` (above) is the single-pick alias for legacy code paths.
    filters,
    setFilters,
    toggleFilter,
    clearFilters,
    pinFilter,
    keepAndClearFilter,
    saveProfile,
    renameStatus,
    reorderStatuses,
    reorderPriorities,
    toggle,
    moveToTrash,
    skipTodo,
    skipSeriesFuture,
    detachFromSeries,
    commitSeriesEdits,
    moveSeriesFutureToTrash,
    moveSeriesToTrash,
    restoreFromTrash,
    permanentlyDelete,
    permanentlyDeleteSeriesFuture,
    permanentlyDeleteSeries,
    rescheduleSeriesFrom,
    updatePriority,
    updateDueDate,
    updateReminders,
    bulkDeferTodos,
    snooze,
    deferOverdue,
    updateTaskCategory,
    updateText,
    updateNotes,
    addSubtask,
    toggleSubtask,
    revertTodo,
    updateSubtaskText,
    updateSubtaskPriority,
    updateSubtaskDueDate,
    removeSubtask,
    clearSubtasks,
    addTask,
    addTaskWithUndo,
    /** Latest to-dos (advanced synchronously by every local mutation) — for
     * Undos that must see the effect of an earlier Undo in the same tick. */
    todosRef,
    /** Revert a tracked change exactly (see useTodosSlice.undoTracked). */
    undoTracked,
    /** Latest groceries (advanced synchronously by add / toggle / delete). */
    groceriesRef,
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
  }), [
    addCategory, addGrocery, restoreGrocery, addGroceryGroup, addGroceryStore, addSubtask, addTask, addTaskWithUndo, animationOn,
    commitSeriesEdits, bulkDeferTodos,
    bulkPermanentDelete, bulkRestore, categories, clearAllData, clearDone, clearFilters,
    clearSubtasks, clearTrashSelection, dataTrusted, deferOverdue, deleteCategory, deleteGrocery,
    deleteGroceryStore, derived, detachFromSeries, editCategory, editGrocery, emptyTrash, filter,
    filters, groceries, groceryGroups, headerLine, identityLine, identityLineIsQuote,
    keepAndClearFilter, linkItemsToStore, loaded, moveSeriesFutureToTrash, moveSeriesToTrash, moveToTrash,
    orderedPriorities, orderedStatuses, permanentlyDelete,
    permanentlyDeleteSeriesFuture, permanentlyDeleteSeries, rescheduleSeriesFrom,
    pinFilter, pinGroceryDept, pinGroceryStore, profile,
    profileTrusted, reduceMotion, removeSubtask, renameGroceryStore, renameStatus,
    reorderCategories, reorderGroceryStores, reorderPriorities, reorderStatuses, restoreFromTrash,
    revertTodo, saveProfile, selectedTrashIds, todosRef, undoTracked, groceriesRef, setActiveGroceryDept, setActiveGroceryStore,
    setFilter, setFilters, skipSeriesFuture, skipTodo, snooze, today, todoReferences, todos, toggle,
    toggleFilter, toggleGroceryChecked, checkOffGrocery, toggleGroceryStoreHidden,
    toggleSubtask, toggleTrashSelection, updateDueDate, updateNotes,
    updatePriority, updateRecurrence, updateReminders, updateSubtaskDueDate,
    updateSubtaskPriority, updateSubtaskText, updateTaskCategory, updateText, view,
  ]);
}
