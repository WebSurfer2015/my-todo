// PR 3 of the useTodoStore split — see docs/USETODOSTORE-SPLIT-PLAN.md.
// Owns groceries + groceryGroups state and every grocery mutation.
// Cross-slice work (active store stamps on profile, snackbars,
// pebble bookkeeping for store×department buckets) flows through
// deps passed in from the composer.

import { useCallback, useEffect, useRef, MutableRefObject } from "react";
import { useSyncedState } from "../useSyncedState";
import {
  GroceryItem,
  GroceryGroup,
  SEED_GROCERY_GROUPS,
  SEED_GROCERY_STORES,
  migrateGroceries,
  migrateGroceryGroups,
  newGroceryItem,
  groceryToggleChecked,
  shoppingBucketPebbleDelta,
  groceryEdit,
  groceryDelete,
  MAX_GROCERY_ITEMS,
  MAX_GROCERY_GROUPS,
  OTHERS_GROUP_ID,
  inferGroceryGroupLocal,
  newGroceryGroup,
  groceryGroupAdd,
  insertGroupBeforeOthers,
  addStoreToList,
  renameStoreInList,
  renameStoreInItems,
  removeStoreFromItems,
  linkStoreToItems,
} from "../groceries";
import { Profile } from "../profile";
import { classifyGroceryDept } from "../aiInfer";
import { StorageAdapter } from "../../../core/src/persistence";
import { PebbleDelta } from "../../../core/src/derive";
import { unwrap, serializeAny } from "../storage/envelope";

const parseGroceries = (raw: string | null): GroceryItem[] =>
  migrateGroceries(unwrap(raw));

const parseGroceryGroups = (raw: string | null): GroceryGroup[] =>
  migrateGroceryGroups(unwrap(raw));

export interface GroceriesSliceDeps {
  onSaved?: (ts: number) => void;
  setProfile: (next: Profile | ((prev: Profile) => Profile)) => void;
  /** Live profile ref so addGrocery's async AI-classify reads the
   * latest agentEnabled flag + groceryStores without taking either
   * as a useCallback dep (which would break callback identity). */
  profileRef: MutableRefObject<Profile>;
  /** notify.showSnackbar — used for the AI-suggested-store and
   * AI-suggested-new-dept prompts. */
  notify: {
    showSnackbar: (opts: {
      message: string;
      actionLabel?: string;
      onAction?: () => void;
      durationMs?: number;
    }) => void;
  };
  /** i18n table for snackbar copy. */
  t: {
    groceryNewStorePrompt: (name: string) => string;
    grocerySortedInto: (dept: string) => string;
    groceryNewDeptSuggest: (label: string) => string;
    create: string;
  };
  /** Same pebble chokepoint as todo completions — fires when a
   * store×dept bucket completes/uncompletes. */
  applyPebbleDeltaTimed: (delta: PebbleDelta) => void;
}

export interface GroceriesSlice {
  groceries: GroceryItem[];
  setGroceries: (
    next: GroceryItem[] | ((prev: GroceryItem[]) => GroceryItem[]),
  ) => void;
  groceriesLoaded: boolean;
  groceryGroups: GroceryGroup[];
  setGroceryGroups: (
    next: GroceryGroup[] | ((prev: GroceryGroup[]) => GroceryGroup[]),
  ) => void;
  groceryGroupsLoaded: boolean;
  addGrocery: (args: {
    text: string;
    groupId?: string;
    stores?: string[];
  }) => void;
  /** Returns the bucket-completion delta — > 0 when this toggle
   * finished a (store × department) bucket, < 0 when it un-finished
   * one, 0 otherwise. The UI uses the sign to gate the Mochi
   * pebble-flight celebration (only on positive completions). */
  toggleGroceryChecked: (id: string) => number;
  editGrocery: (
    id: string,
    patch: { text?: string; groupId?: string; stores?: string[] },
  ) => void;
  deleteGrocery: (id: string) => void;
  addGroceryGroup: (label: string) => string | undefined;
  addGroceryStore: (name: string) => void;
  renameGroceryStore: (oldName: string, newName: string) => void;
  deleteGroceryStore: (name: string) => void;
  linkItemsToStore: (storeName: string, itemIds: string[]) => void;
  reorderGroceryStores: (next: string[]) => void;
  toggleGroceryStoreHidden: (name: string) => void;
  pinGroceryStore: (name: string) => void;
  setActiveGroceryStore: (store: string | undefined) => void;
  setActiveGroceryDept: (deptId: string | undefined) => void;
  pinGroceryDept: (deptId: string) => void;
}

export function useGroceriesSlice(
  adapter: StorageAdapter,
  deps: GroceriesSliceDeps,
): GroceriesSlice {
  const { onSaved, setProfile, profileRef, notify, t, applyPebbleDeltaTimed } = deps;

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

  // Mirror groceryGroups so addGrocery's stable callback can read
  // the latest department list inside an async AI-classify Promise
  // without taking it as a dep (which would break the callback's
  // identity and force every GroceryView render to bind a new
  // addGrocery).
  const groceryGroupsRef = useRef(groceryGroups);
  useEffect(() => {
    groceryGroupsRef.current = groceryGroups;
  }, [groceryGroups]);
  // Mirror groceries too so toggleGroceryChecked can compute the
  // (store × dept) bucket-completion delta SYNCHRONOUSLY and return
  // it to the caller. setGroceries with an updater fn defers the
  // computation to the next render, so an outer `let delta` would
  // read 0 — the Row's pebble-flight gate then skipped every
  // celebration after the first (which happened to fire on a stale
  // closure).
  const groceriesRef = useRef(groceries);
  useEffect(() => {
    groceriesRef.current = groceries;
  }, [groceries]);

  const addGrocery = useCallback(
    (args: { text: string; groupId?: string; stores?: string[] }) => {
      const text = args.text.trim();
      if (!text) return;
      const explicit =
        args.groupId && args.groupId !== OTHERS_GROUP_ID
          ? args.groupId
          : undefined;
      const localGuess =
        explicit ?? inferGroceryGroupLocal(text, groceryGroupsRef.current);
      const item = newGroceryItem({
        text,
        groupId: localGuess,
        stores: args.stores,
      });
      setGroceries((prev) => {
        if (prev.length >= MAX_GROCERY_ITEMS) return prev;
        return [item, ...prev];
      });
      const newStores = item.stores;
      const lastAdded = newStores[0];
      setProfile((p) => {
        const next = { ...p, lastAddedGroceryStore: lastAdded ?? p.lastAddedGroceryStore };
        if (newStores.length > 0) {
          const list = p.groceryStores ?? SEED_GROCERY_STORES;
          const additions = newStores.filter((s) => !list.includes(s));
          if (additions.length > 0) {
            next.groceryStores = [...list, ...additions];
          }
        }
        return next;
      });
      const landedInOthers = item.groupId === OTHERS_GROUP_ID;
      const aiOn = profileRef.current.agentEnabled !== false;
      if (aiOn && !explicit) {
        const departments = groceryGroupsRef.current
          .filter((g) => g.id !== OTHERS_GROUP_ID && !g.hidden)
          .slice(0, 30)
          .map((g) => ({ id: g.id, label: g.label }));
        const storesInProfile =
          profileRef.current.groceryStores ?? SEED_GROCERY_STORES;
        const explicitStore = !!args.stores && args.stores.length > 0;
        if (departments.length > 0) {
          const placedAt = item.groupId;
          void classifyGroceryDept({
            text,
            departments,
            stores: storesInProfile,
          }).then((res) => {
            const hint = res.storeHint;
            if (hint && !explicitStore) {
              const existing = storesInProfile.find(
                (s) => s.toLowerCase() === hint.name.toLowerCase(),
              );
              if (existing) {
                setGroceries((prev) =>
                  prev.map((it) => {
                    if (it.id !== item.id) return it;
                    if (it.stores.includes(existing)) return it;
                    return { ...it, stores: [...it.stores, existing] };
                  }),
                );
              } else if (hint.isNew) {
                notify.showSnackbar({
                  message: t.groceryNewStorePrompt(hint.name),
                  actionLabel: t.create,
                  onAction: () => {
                    const liveStores =
                      profileRef.current.groceryStores ?? SEED_GROCERY_STORES;
                    const dupe = liveStores.find(
                      (s) => s.toLowerCase() === hint.name.toLowerCase(),
                    );
                    const targetName = dupe ?? hint.name;
                    if (!dupe) {
                      setProfile((p) => {
                        const list = p.groceryStores ?? SEED_GROCERY_STORES;
                        if (list.some((s) => s.toLowerCase() === hint.name.toLowerCase())) {
                          return p;
                        }
                        return { ...p, groceryStores: [...list, hint.name] };
                      });
                    }
                    setGroceries((prev) =>
                      prev.map((it) => {
                        if (it.id !== item.id) return it;
                        if (it.stores.includes(targetName)) return it;
                        return { ...it, stores: [...it.stores, targetName] };
                      }),
                    );
                  },
                });
              }
            }
            if (res.groupId) {
              const dept = groceryGroupsRef.current.find((g) => g.id === res.groupId);
              if (!dept) return;
              if (placedAt === res.groupId) return;
              setGroceries((prev) =>
                prev.map((it) =>
                  it.id === item.id ? { ...it, groupId: res.groupId! } : it,
                ),
              );
              notify.showSnackbar({
                message: t.grocerySortedInto(dept.label),
              });
              return;
            }
            if (!landedInOthers) return;
            const proposed = res.newGroupLabel;
            if (!proposed) return;
            const liveGroups = groceryGroupsRef.current;
            if (liveGroups.length >= MAX_GROCERY_GROUPS) return;
            const lower = proposed.toLowerCase();
            const existing = liveGroups.find(
              (g) => g.id !== OTHERS_GROUP_ID && g.label.toLowerCase() === lower,
            );
            if (existing) {
              setGroceries((prev) =>
                prev.map((it) =>
                  it.id === item.id ? { ...it, groupId: existing.id } : it,
                ),
              );
              return;
            }
            notify.showSnackbar({
              message: t.groceryNewDeptSuggest(proposed),
              actionLabel: t.create,
              onAction: () => {
                const groupsAtCommit = groceryGroupsRef.current;
                if (groupsAtCommit.length >= MAX_GROCERY_GROUPS) return;
                const dupe = groupsAtCommit.find(
                  (g) =>
                    g.id !== OTHERS_GROUP_ID &&
                    g.label.toLowerCase() === lower,
                );
                let targetGroupId: string;
                if (dupe) {
                  targetGroupId = dupe.id;
                } else {
                  const newGroup = newGroceryGroup(proposed);
                  targetGroupId = newGroup.id;
                  setGroceryGroups((prev) => insertGroupBeforeOthers(prev, newGroup));
                }
                setGroceries((prev) =>
                  prev.map((it) =>
                    it.id === item.id ? { ...it, groupId: targetGroupId } : it,
                  ),
                );
              },
            });
          });
        }
      }
    },
    [setGroceries, setProfile, setGroceryGroups, profileRef, notify, t],
  );

  const renameGroceryStore = useCallback(
    (oldName: string, newName: string) => {
      const next = newName.trim();
      if (!next || next === oldName) return;
      setProfile((p) => {
        const list = p.groceryStores ?? SEED_GROCERY_STORES;
        const activeUpdated =
          p.activeGroceryStore === oldName ? next : p.activeGroceryStore;
        return {
          ...p,
          groceryStores: renameStoreInList(list, oldName, next),
          activeGroceryStore: activeUpdated,
        };
      });
      setGroceries((prev) => renameStoreInItems(prev, oldName, next));
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
      setGroceries((prev) => removeStoreFromItems(prev, name));
    },
    [setProfile, setGroceries],
  );

  const linkItemsToStore = useCallback(
    (storeName: string, itemIds: string[]) => {
      setGroceries((prev) => linkStoreToItems(prev, storeName, itemIds));
    },
    [setGroceries],
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
        return { ...p, groceryStores: addStoreToList(list, trimmed) };
      });
    },
    [setProfile],
  );

  const addGroceryGroup = useCallback(
    (label: string): string | undefined => {
      const res = groceryGroupAdd(groceryGroupsRef.current, label);
      if (!res) return undefined;
      // res.groups === current ref on a dedup hit → nothing to persist.
      if (res.groups !== groceryGroupsRef.current) setGroceryGroups(res.groups);
      return res.id;
    },
    [setGroceryGroups],
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
    (id: string): number => {
      // Compute next + delta SYNCHRONOUSLY from the ref-mirrored
      // current state. setGroceries(updater) queues its updater for
      // the next render, so reading a closure variable set inside the
      // updater returns the initial value at call time — that broke
      // the Row's pebble-flight gate (no animation on bucket
      // completions after the first one). Compute first, dispatch
      // the result, return the real delta.
      const prev = groceriesRef.current;
      const next = groceryToggleChecked(prev, id);
      const delta = shoppingBucketPebbleDelta(prev, next, id);
      if (delta !== 0) {
        applyPebbleDeltaTimed({ task: 0 as const, subtask: delta });
      }
      setGroceries(next);
      return delta;
    },
    [setGroceries, applyPebbleDeltaTimed],
  );

  const editGrocery = useCallback(
    (id: string, patch: { text?: string; groupId?: string; stores?: string[] }) => {
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

  // Auto-pin on activate: picking a store/dept also pins it (if it
  // wasn't already), so it stays in the filter row as a quick-switch
  // shortcut after the user backs out to All. Deactivating (passing
  // undefined) doesn't unpin — that's a separate explicit action
  // via long-press → Unpin.
  const setActiveGroceryStore = useCallback(
    (store: string | undefined) => {
      setProfile((p) => {
        const next = { ...p, activeGroceryStore: store || undefined };
        if (store) {
          const pinned = p.pinnedGroceryStores ?? [];
          if (!pinned.includes(store)) {
            next.pinnedGroceryStores = [...pinned, store];
          }
        }
        return next;
      });
    },
    [setProfile],
  );

  const setActiveGroceryDept = useCallback(
    (deptId: string | undefined) => {
      setProfile((p) => {
        const next = { ...p, activeGroceryDept: deptId || undefined };
        if (deptId) {
          const pinned = p.pinnedGroceryDepts ?? [];
          if (!pinned.includes(deptId)) {
            next.pinnedGroceryDepts = [...pinned, deptId];
          }
        }
        return next;
      });
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
  };
}
