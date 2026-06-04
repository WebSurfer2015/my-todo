// PR 2/5 of the useTodoStore split — see docs/USETODOSTORE-SPLIT-PLAN.md.
// Owns the profile state + the lastSavedAt "saved at" stamp + the
// onSaved callback. Other slices receive `onSaved` from the composer
// so any save (todos, categories, groceries, etc.) advances the
// shared "last saved" indicator.
//
// PR 5 expansion: also owns every profile-touching mutation —
// pinFilter / keepAndClearFilter / toggleHomeStatTile /
// clearHomeStatTiles / changeView / renameStatus / toggleStatusHidden
// / reorderStatuses / togglePriorityHidden / reorderPriorities — so
// the composer doesn't have to re-derive setProfile in dozens of
// callbacks. Cross-state mutations (changeView calls setFilter,
// keepAndClearFilter calls clearFilters) thread through deps.

import { useCallback, useState } from "react";
import { useSyncedState } from "../useSyncedState";
import { Profile, SEED_PROFILE, migrateProfile } from "../profile";
import { Filter, Priority, StatusFilter, ViewMode } from "../types";
import { PIN_LIMIT } from "../../../core/src/logic/filters";
import { TodoStoreActions } from "../../../core/src/store";
import { StorageAdapter } from "../../../core/src/ports/persistence";
import { unwrap, serializeAny } from "../storage/envelope";

const parseProfile = (raw: string | null): Profile => {
  const data = unwrap(raw);
  return data ? migrateProfile(data) : SEED_PROFILE;
};

export interface ProfileSliceDeps {
  /** Forwarded by changeView when flipping between category and
   * status views — each view has a sensible default filter. */
  setFilter: (f: Filter) => void;
  /** keepAndClearFilter clears the selection in one shot after
   * stashing the active set into pinnedFilters. */
  clearFilters: () => void;
  /** Snackbar copy for the pin-limit warning. */
  t: { pinCapReached: (n: number) => string };
  notify: { showSnackbar: (opts: { message: string }) => void };
  /** The createTodoStore pure-transform surface. */
  actions: TodoStoreActions;
}

export interface ProfileSlice {
  profile: Profile;
  setProfile: (next: Profile | ((prev: Profile) => Profile)) => void;
  profileLoaded: boolean;
  /** Most recent successful persist timestamp across ALL useSyncedState
   * keys threaded through `onSaved`. Surfaced in Settings as a quiet
   * "saved" indicator. */
  lastSavedAt: number | null;
  /** Pass this into every other slice's useSyncedState so a save
   * anywhere updates the shared indicator. */
  onSaved: (ts: number) => void;
  // ---- Mutations (PR 5 expansion) ----
  pinFilter: (set: Filter[]) => void;
  keepAndClearFilter: (set: Filter[]) => void;
  toggleHomeStatTile: (f: Filter) => void;
  clearHomeStatTiles: () => void;
  changeView: (v: ViewMode) => void;
  renameStatus: (id: StatusFilter, label: string) => void;
  toggleStatusHidden: (id: StatusFilter) => void;
  reorderStatuses: (newOrder: StatusFilter[]) => void;
  togglePriorityHidden: (id: Priority) => void;
  reorderPriorities: (newOrder: Priority[]) => void;
}

export function useProfileSlice(
  adapter: StorageAdapter,
  deps: ProfileSliceDeps,
): ProfileSlice {
  const { setFilter, clearFilters, t, notify, actions } = deps;
  // Pure transforms via the createTodoStore surface. Stable across
  // ordinary renders (store memoized on t), so the existing useCallback
  // deps stay correct and callback identities hold.
  const {
    statusRename,
    statusToggleHidden,
    statusReorder,
    priorityToggleHidden,
    priorityReorder,
    togglePinnedFilter,
    addPinnedFilter,
    stripFilterFromPinned,
    toggleStatTile,
    defaultFilterForView,
  } = actions;
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const onSaved = useCallback((ts: number) => setLastSavedAt(ts), []);

  const [profile, setProfile, profileLoaded] = useSyncedState<Profile>(
    adapter,
    "profile",
    SEED_PROFILE,
    parseProfile,
    serializeAny,
    onSaved,
  );

  // ---- Pin filter (set-aware) ----
  const pinFilter = useCallback(
    (set: Filter[]) => {
      setProfile((prev) => {
        const res = togglePinnedFilter(prev.pinnedFilters, set);
        if (res.limitReached) {
          notify.showSnackbar({ message: t.pinCapReached(PIN_LIMIT) });
          return prev;
        }
        if (res.pinned === prev.pinnedFilters) return prev;
        return { ...prev, pinnedFilters: res.pinned };
      });
    },
    [setProfile, notify, t],
  );

  // Atomic "stash the current selection as a pinned shortcut then
  // clear it" — used by FilterBar when the user taps an active pill.
  // Reads the live profile in a functional setProfile so the
  // membership check always uses current state.
  const keepAndClearFilter = useCallback(
    (set: Filter[]) => {
      if (set.length > 0) {
        setProfile((prev) => {
          const res = addPinnedFilter(prev.pinnedFilters, set);
          if (res.limitReached) {
            notify.showSnackbar({ message: t.pinCapReached(PIN_LIMIT) });
            return prev;
          }
          if (res.pinned === prev.pinnedFilters) return prev;
          return { ...prev, pinnedFilters: res.pinned };
        });
      }
      clearFilters();
    },
    [setProfile, clearFilters, notify, t],
  );

  // ---- Home stat tiles ----
  const clearHomeStatTiles = useCallback(() => {
    setProfile((prev) => ({ ...prev, homeStatTiles: [] }));
  }, [setProfile]);

  const toggleHomeStatTile = useCallback(
    (f: Filter) => {
      setProfile((prev) => ({
        ...prev,
        homeStatTiles: toggleStatTile(prev.homeStatTiles, f),
      }));
    },
    [setProfile],
  );

  // ---- View + status/priority overrides ----
  const changeView = useCallback(
    (v: ViewMode) => {
      setProfile((prev) => ({ ...prev, view: v }));
      setFilter(defaultFilterForView(v));
    },
    [setProfile, setFilter],
  );

  const renameStatus = useCallback(
    (id: StatusFilter, label: string) => {
      setProfile((prev) => statusRename(prev, id, label));
    },
    [setProfile],
  );

  const toggleStatusHidden = useCallback(
    (id: StatusFilter) => {
      setProfile((prev) => {
        const next = statusToggleHidden(prev, id);
        // If the status was just hidden and any pinned set referenced
        // it, strip it from those sets so the FilterBar doesn't surface
        // an invisible filter as part of a composite pill.
        const overrides = next.statuses ?? [];
        const isNowHidden =
          overrides.find((s) => s.id === id)?.hidden === true;
        if (!isNowHidden) return next;
        const pinned = stripFilterFromPinned(next.pinnedFilters, id);
        if (pinned === next.pinnedFilters) return next;
        return { ...next, pinnedFilters: pinned };
      });
    },
    [setProfile],
  );

  const reorderStatuses = useCallback(
    (newOrder: StatusFilter[]) => {
      setProfile((prev) => statusReorder(prev, newOrder));
    },
    [setProfile],
  );

  const togglePriorityHidden = useCallback(
    (id: Priority) => {
      setProfile((prev) => {
        const next = priorityToggleHidden(prev, id);
        const overrides = next.priorities ?? [];
        const isNowHidden =
          overrides.find((p) => p.id === id)?.hidden === true;
        if (!isNowHidden) return next;
        const pinned = stripFilterFromPinned(next.pinnedFilters, `pri:${id}`);
        if (pinned === next.pinnedFilters) return next;
        return { ...next, pinnedFilters: pinned };
      });
    },
    [setProfile],
  );

  const reorderPriorities = useCallback(
    (newOrder: Priority[]) => {
      setProfile((prev) => priorityReorder(prev, newOrder));
    },
    [setProfile],
  );

  return {
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
  };
}
