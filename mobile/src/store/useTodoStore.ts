import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
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
import { useReducedMotion } from "../app/useReducedMotion";
import { db } from "../adapters/firebase";
import { makeFirestoreAdapter } from "../adapters/firestoreAdapter";
import {
  StorageAdapter,
  USER_STATE_KEYS,
  SCHEMA_VERSION,
} from "../../../core/src/ports/persistence";
import { createTodoStore, refreshUsageSignals } from "../../../core/src/store";
import { todayLocal } from "../../../core/src/logic/utils";
import { dailyQuoteIndex, quoteAt } from "../../../core/src/data/quotes";
import { isSyncedKeyTrusted, onSyncIssue } from "./useSyncedState";

// Sync-problem snackbars. English-only launch — TODO(i18n owner): move into
// core/src/data/i18n.ts when the language picker returns.
const SYNC_TOO_LARGE_MESSAGE =
  "Your list is very large — clear finished to-dos in Done to keep syncing.";
const SYNC_WRITE_FAILED_MESSAGE =
  "Couldn't save your latest changes. They'll stay on this device for now.";

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
  clear: async () => {},
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
    setTodos,
    todosLoaded,
    todoReferences,
    selectedTrashIds,
    todosRef,
    toggle,
    moveToTrash,
    skipTodo,
    skipSeriesFuture,
    detachFromSeries,
    applyRecurrenceChange,
    applySeriesSubtasks,
    restoreFromTrash,
    permanentlyDelete,
    permanentlyDeleteSeriesFuture,
    updatePriority,
    updateDueDate,
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
  // onboarded account) gate on this. The todos flag is read from the
  // useSyncedState registry because the todos slice doesn't surface it;
  // reading at render is safe — the flag flips together with a state update
  // in the same component, so this re-renders.
  const todosTrusted = isSyncedKeyTrusted(adapter, "todos");
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
  const clearAllData = useCallback(async () => {
    const empty = JSON.stringify({ version: SCHEMA_VERSION, data: [] });
    // Fire the cloud overwrites but don't wait for the server: Firestore
    // only resolves setDoc once the server confirms, so offline this hung
    // "Deleting…" forever. The writes are queued and sync when back online.
    USER_STATE_KEYS.forEach((key) => {
      adapter.setItem(key, empty).catch((err) => {
        console.warn(`clearAllData: cloud overwrite failed for ${key}`, err);
      });
    });
  }, [adapter]);


  // Returns an Undo (Ask Mochi's inline "✓ Done · Undo") that puts the
  // category back in place and reverts the to-dos the cascade changed.
  function deleteCategory(id: string): (() => void) | null {
    const res = store.actions.deleteCategoryCascade({
      todos,
      categories,
      id,
      filter,
      filters,
      pinnedFilters: profile.pinnedFilters,
      homeStatTiles: profile.homeStatTiles,
    });
    if (!res.changed) return null;
    // Functional updates: a Mochi batch ("create Work, delete Errands", or
    // "move X to Home, delete Errands") applies earlier ops in the same tick,
    // and writing the render-time result clobbered them.
    const cascadeFrom = (t: typeof todos, c: typeof categories) =>
      store.actions.deleteCategoryCascade({
        todos: t,
        categories: c,
        id,
        filter,
        pinnedFilters: profile.pinnedFilters,
      });
    setTodos((prev) => cascadeFrom(prev, categories).todos);
    setCategories((prev) => cascadeFrom(todos, prev).categories);
    if (res.filter !== null) setFilter(res.filter);
    // Strip any pinned set that contained this category so the persisted
    // profile doesn't accumulate stale `cat:<deleted-id>` ghost pills.
    if (res.pinnedFilters !== profile.pinnedFilters) {
      setProfile((prev) => ({ ...prev, pinnedFilters: res.pinnedFilters }));
    }
    // Multi-select filter sets and Home stat tiles drop the deleted
    // category too (they kept a ghost `cat:<id>`).
    if (res.filters !== null) setFiltersState(res.filters);
    if (res.homeStatTiles !== profile.homeStatTiles) {
      setProfile((prev) => ({ ...prev, homeStatTiles: res.homeStatTiles }));
    }
    const idx = categories.findIndex((c) => c.id === id);
    const removed = categories[idx];
    const todosBefore = todos;
    const todosAfter = res.todos;
    return () => {
      setTodos((prev) => store.actions.todosRevertChanges(prev, todosBefore, todosAfter));
      if (removed) {
        setCategories((prev) =>
          prev.some((c) => c.id === id) ? prev : [...prev.slice(0, idx), removed, ...prev.slice(idx)],
        );
      }
    };
  }


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
  // Legacy: still expose quoteLine for any caller that wants the raw
  // value, but App.tsx now reads identityLine + identityLineIsQuote.
  const orderedStatuses = getOrderedStatuses(profile, t);
  const orderedPriorities = getOrderedPriorities(profile, t);
  const orderedVisibleStatuses = getOrderedVisibleStatuses(profile, t);

  return {
    todos,
    todoReferences,
    categories,
    groceries,
    addGrocery,
    restoreGrocery,
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
    saveProfile: setProfile,
    renameStatus,
    toggleStatusHidden,
    reorderStatuses,
    togglePriorityHidden,
    reorderPriorities,
    toggle,
    moveToTrash,
    skipTodo,
    skipSeriesFuture,
    detachFromSeries,
    applyRecurrenceChange,
    applySeriesSubtasks,
    moveSeriesFutureToTrash,
    applySeriesFutureEdits,
    restoreFromTrash,
    permanentlyDelete,
    permanentlyDeleteSeriesFuture,
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
