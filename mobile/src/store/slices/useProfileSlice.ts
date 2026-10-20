// Profile slice of useTodoStore: owns the synced profile state and the
// profile-backed mutations (pins, statuses, priorities, stat tiles, …).
//
// PR 5 expansion: also owns every profile-touching mutation —
// pinFilter / keepAndClearFilter / toggleHomeStatTile /
// clearHomeStatTiles / changeView / renameStatus / reorderStatuses /
// reorderPriorities — so
// the composer doesn't have to re-derive setProfile in dozens of
// callbacks. Cross-state mutations (changeView calls setFilter,
// keepAndClearFilter calls clearFilters) thread through deps.

import { useCallback, useEffect, useRef } from "react";
import { useSyncedState } from "../useSyncedState";
import { Profile, SEED_PROFILE, migrateProfile } from "../../core-bindings/profile";
import { Filter, Priority, StatusFilter, ViewMode } from "../../core-bindings/types";
import { PIN_LIMIT } from "../../../../core/src/logic/filters";
import { TodoStoreActions } from "../../../../core/src/store";
import { StorageAdapter } from "../../../../core/src/ports/persistence";
import { unwrapEnvelope, wrapEnvelope } from "../../../../core/src/ports/persistence";
import type { SilentOpt } from "./useTodosSlice";

const parseProfile = (raw: string | null): Profile => {
  const data = unwrapEnvelope(raw);
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
  /** The profile came from real data, not SEED_PROFILE after a failed /
   * timed-out hydrate. */
  profileTrusted: boolean;
  // ---- Mutations (PR 5 expansion) ----
  /** Pin / unpin a filter set. `limitReached`: the pin cap blocked it — the
   * store says so in a snackbar unless `silent` (a sheet over the root, where
   * the snackbar can't be seen, says it inline). */
  pinFilter: (set: Filter[], opts?: SilentOpt) => { limitReached: boolean };
  keepAndClearFilter: (set: Filter[]) => void;
  toggleHomeStatTile: (f: Filter) => void;
  clearHomeStatTiles: () => void;
  changeView: (v: ViewMode) => void;
  renameStatus: (id: StatusFilter, label: string) => void;
  reorderStatuses: (newOrder: StatusFilter[]) => void;
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
    statusReorder,
    priorityReorder,
    togglePinnedFilter,
    addPinnedFilter,
    toggleStatTile,
    defaultFilterForView,
  } = actions;

  const [profile, setProfile, profileLoaded, profileTrusted] = useSyncedState<Profile>(
    adapter,
    "profile",
    SEED_PROFILE,
    parseProfile,
    wrapEnvelope,
  );

  // Latest profile, so pinFilter can tell its caller (synchronously) that
  // the cap blocked the pin.
  const profileRef = useRef(profile);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // ---- Pin filter (set-aware) ----
  const pinFilter = useCallback(
    (set: Filter[], opts?: SilentOpt) => {
      if (togglePinnedFilter(profileRef.current.pinnedFilters, set).limitReached) {
        if (!opts?.silent) notify.showSnackbar({ message: t.pinCapReached(PIN_LIMIT) });
        return { limitReached: true };
      }
      setProfile((prev) => {
        const res = togglePinnedFilter(prev.pinnedFilters, set);
        if (res.limitReached || res.pinned === prev.pinnedFilters) return prev;
        return { ...prev, pinnedFilters: res.pinned };
      });
      return { limitReached: false };
    },
    [setProfile, togglePinnedFilter, notify, t],
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
    [clearFilters, setProfile, addPinnedFilter, notify, t],
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
    [setProfile, toggleStatTile],
  );

  // ---- View + status/priority overrides ----
  const changeView = useCallback(
    (v: ViewMode) => {
      setProfile((prev) => ({ ...prev, view: v }));
      setFilter(defaultFilterForView(v));
    },
    [setProfile, setFilter, defaultFilterForView],
  );

  const renameStatus = useCallback(
    (id: StatusFilter, label: string) => {
      setProfile((prev) => statusRename(prev, id, label));
    },
    [setProfile, statusRename],
  );

  const reorderStatuses = useCallback(
    (newOrder: StatusFilter[]) => {
      setProfile((prev) => statusReorder(prev, newOrder));
    },
    [setProfile, statusReorder],
  );

  const reorderPriorities = useCallback(
    (newOrder: Priority[]) => {
      setProfile((prev) => priorityReorder(prev, newOrder));
    },
    [priorityReorder, setProfile],
  );

  return {
    profile,
    setProfile,
    profileLoaded,
    profileTrusted,
    pinFilter,
    keepAndClearFilter,
    toggleHomeStatTile,
    clearHomeStatTiles,
    changeView,
    renameStatus,
    reorderStatuses,
    reorderPriorities,
  };
}
