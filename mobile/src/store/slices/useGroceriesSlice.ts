// Slice of useTodoStore.
// Owns groceries + groceryGroups state and every grocery mutation.
// Cross-slice work (active store stamps on profile, snackbars)
// flows through deps passed in from the composer.

import { useCallback, useEffect, useRef, MutableRefObject } from "react";
import { useSyncedState } from "../useSyncedState";
import {
  GroceryItem,
  GroceryGroup,
  SEED_GROCERY_GROUPS,
  SEED_GROCERY_STORES,
  migrateGroceries,
  migrateGroceryGroups,
  MAX_GROCERY_ITEMS,
  MAX_GROCERY_GROUPS,
  OTHERS_GROUP_ID,
  normalizeGroceryText,
} from "../../core-bindings/groceries";
import { Profile } from "../../core-bindings/profile";
import { classifyGroceryDept } from "../../adapters/aiInfer";
import { StorageAdapter } from "../../../../core/src/ports/persistence";
import { TodoStoreActions } from "../../../../core/src/store";
import { unwrap, serializeAny } from "../../storage/envelope";
import type { Undo } from "./useTodosSlice";

const parseGroceries = (raw: string | null): GroceryItem[] =>
  migrateGroceries(unwrap(raw));

const parseGroceryGroups = (raw: string | null): GroceryGroup[] =>
  migrateGroceryGroups(unwrap(raw));

export interface GroceriesSliceDeps {
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
  /** The createTodoStore pure-transform surface. */
  actions: TodoStoreActions;
}

/** The fields a re-add of an already-known item overwrites — what its Undo
 * puts back. */
export type GroceryReaddSnapshot = Pick<GroceryItem, "checked" | "checkedAt" | "addedAt" | "stores">;

/** What addGrocery did: the item's id, plus — when it re-added an item that
 * already existed — that item's previous state (so Undo restores it rather
 * than deleting an item the user already had). */
export interface GroceryAddResult {
  id: string;
  previous?: GroceryReaddSnapshot;
}

/** Undo for a grocery action (store add / rename / delete, item removal):
 * the shared store Undo — true only when something was put back. */
export type GroceryUndo = Undo;

export interface GroceriesSlice {
  groceries: GroceryItem[];
  groceriesLoaded: boolean;
  groceryGroups: GroceryGroup[];
  groceryGroupsLoaded: boolean;
  addGrocery: (args: {
    text: string;
    groupId?: string;
    stores?: string[];
  }) => GroceryAddResult | undefined;
  /** Undo a re-add: put an existing item's previous fields back. True when
   * the item is still there (and so was restored). */
  restoreGrocery: (id: string, previous: GroceryReaddSnapshot) => boolean;
  /** Returns 1 when this toggle just checked the item off (drives the
   * row's completion animation), 0 otherwise. */
  toggleGroceryChecked: (id: string) => number;
  /** True when it changed the item. */
  editGrocery: (
    id: string,
    patch: { text?: string; groupId?: string; stores?: string[] },
  ) => boolean;
  /** Removes the item; returns an Undo that puts it back in its place (null
   * when there was no such item). */
  deleteGrocery: (id: string) => GroceryUndo | null;
  addGroceryGroup: (label: string) => string | undefined;
  addGroceryStore: (name: string) => GroceryUndo | null;
  renameGroceryStore: (oldName: string, newName: string) => GroceryUndo | null;
  deleteGroceryStore: (name: string) => GroceryUndo | null;
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
  const { setProfile, profileRef, notify, t, actions } = deps;
  // Pure grocery transforms via the createTodoStore surface (stable
  // across ordinary renders). Migrators + consts stay direct imports —
  // they're used at module scope / are data, not behavior.
  const {
    newGroceryItem,
    groceryToggleChecked,
    groceryEdit,
    groceryDelete,
    inferGroceryGroupLocal,
    newGroceryGroup,
    groceryGroupAdd,
    insertGroupBeforeOthers,
    addStoreToList,
    renameStoreInList,
    renameStoreInItems,
    removeStoreFromItems,
    linkStoreToItems,
  } = actions;

  const [groceries, setGroceries, groceriesLoaded] = useSyncedState<GroceryItem[]>(
    adapter,
    "groceries",
    [],
    parseGroceries,
    serializeAny,
  );
  const [groceryGroups, setGroceryGroups, groceryGroupsLoaded] = useSyncedState<GroceryGroup[]>(
    adapter,
    "groceryGroups",
    SEED_GROCERY_GROUPS,
    parseGroceryGroups,
    serializeAny,
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
    (args: { text: string; groupId?: string; stores?: string[] }): GroceryAddResult | undefined => {
      // Strip a leading shopping verb ("Buy Milk" → "Milk"), case-insensitively,
      // so the list holds the item itself. Applies to manual + Mochi adds alike.
      const text = normalizeGroceryText(args.text);
      if (!text) return;

      // Already known (case-insensitive)? Re-add the SAME item instead of
      // duplicating — un-check a past/bought one so it's back on the list, float
      // it to the top, and merge any new store tags. Preserves its purchase
      // history. This is why "buy eggs" when eggs is in Past Items just works.
      const existing = groceriesRef.current.find(
        (it) => it.text.trim().toLowerCase() === text.toLowerCase(),
      );
      if (existing) {
        const mergedStores =
          args.stores && args.stores.length > 0
            ? Array.from(new Set([...existing.stores, ...args.stores]))
            : existing.stores;
        setGroceries((prev) => {
          if (!prev.some((it) => it.id === existing.id)) return prev;
          const updated: GroceryItem = {
            ...existing,
            checked: false,
            checkedAt: undefined,
            addedAt: Date.now(),
            stores: mergedStores,
          };
          return [updated, ...prev.filter((it) => it.id !== existing.id)];
        });
        return {
          id: existing.id,
          previous: {
            checked: existing.checked,
            checkedAt: existing.checkedAt,
            addedAt: existing.addedAt,
            stores: existing.stores,
          },
        };
      }
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
      // Only spend an AI call when it can add something: the on-device guess
      // found no aisle, or the text may name a store ("milk from Costco").
      // Calling on every item burned the shared daily fair-use budget (a
      // 10-item Mochi list = 10 extra calls) and sent text needlessly.
      const mayNameStore = /\b(from|at)\s+\S/i.test(text);
      if (aiOn && !explicit && (landedInOthers || mayNameStore)) {
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
      return { id: item.id };
    },
    [inferGroceryGroupLocal, newGroceryItem, setGroceries, setProfile, profileRef, notify, t, newGroceryGroup, setGroceryGroups, insertGroupBeforeOthers],
  );

  // Snapshot-restore Undo for a store rename/delete: the profile's store
  // fields go back as they were, and each item's store tags go back for the
  // items that still exist (later adds/edits to other fields survive).
  const storeUndo = useCallback(
    (profileBefore: Profile, itemsBefore: GroceryItem[]): GroceryUndo => () => {
      // Anything to put back? (the store list, or an item's store tags)
      const prof = profileRef.current;
      const storesById = new Map(itemsBefore.map((it) => [it.id, it.stores]));
      const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
      const changed =
        !same(prof.groceryStores, profileBefore.groceryStores) ||
        !same(prof.activeGroceryStore, profileBefore.activeGroceryStore) ||
        groceriesRef.current.some((it) => storesById.has(it.id) && !same(storesById.get(it.id), it.stores));
      if (!changed) return false;
      setProfile((p) => ({
        ...p,
        groceryStores: profileBefore.groceryStores,
        activeGroceryStore: profileBefore.activeGroceryStore,
      }));
      setGroceries((prev) =>
        prev.map((it) => {
          const stores = storesById.get(it.id);
          return stores && stores !== it.stores ? { ...it, stores } : it;
        }),
      );
      return true;
    },
    [setProfile, setGroceries, profileRef],
  );

  const restoreGrocery = useCallback(
    (id: string, previous: GroceryReaddSnapshot): boolean => {
      if (!groceriesRef.current.some((it) => it.id === id)) return false;
      setGroceries((prev) => prev.map((it) => (it.id === id ? { ...it, ...previous } : it)));
      return true;
    },
    [setGroceries],
  );

  const renameGroceryStore = useCallback(
    (oldName: string, newName: string) => {
      const next = newName.trim();
      if (!next || next === oldName) return null;
      const profileBefore = profileRef.current;
      const itemsBefore = groceriesRef.current;
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
      return storeUndo(profileBefore, itemsBefore);
    },
    [setProfile, setGroceries, renameStoreInList, renameStoreInItems, profileRef, storeUndo],
  );

  const deleteGroceryStore = useCallback(
    (name: string) => {
      const profileBefore = profileRef.current;
      const itemsBefore = groceriesRef.current;
      setProfile((p) => {
        const list = (p.groceryStores ?? SEED_GROCERY_STORES).filter((s) => s !== name);
        const active =
          p.activeGroceryStore === name ? undefined : p.activeGroceryStore;
        return { ...p, groceryStores: list, activeGroceryStore: active };
      });
      setGroceries((prev) => removeStoreFromItems(prev, name));
      return storeUndo(profileBefore, itemsBefore);
    },
    [setProfile, setGroceries, removeStoreFromItems, profileRef, storeUndo],
  );

  const linkItemsToStore = useCallback(
    (storeName: string, itemIds: string[]) => {
      setGroceries((prev) => linkStoreToItems(prev, storeName, itemIds));
    },
    [linkStoreToItems, setGroceries],
  );

  const reorderGroceryStores = useCallback(
    (next: string[]) => {
      setProfile((p) => ({ ...p, groceryStores: next.filter((s) => s.trim().length > 0) }));
    },
    [setProfile],
  );

  // Returns an Undo that removes the store again — null when it was already
  // listed (nothing was added, so there's nothing to take back).
  const addGroceryStore = useCallback(
    (name: string): GroceryUndo | null => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const existed = (profileRef.current.groceryStores ?? SEED_GROCERY_STORES).includes(trimmed);
      setProfile((p) => {
        const list = p.groceryStores ?? SEED_GROCERY_STORES;
        return { ...p, groceryStores: addStoreToList(list, trimmed) };
      });
      if (existed) return null;
      return () => {
        const live = profileRef.current.groceryStores ?? SEED_GROCERY_STORES;
        const tagged = groceriesRef.current.some((it) => (it.stores ?? []).includes(trimmed));
        if (!live.includes(trimmed) && !tagged) return false;
        setProfile((p) => {
          const list = (p.groceryStores ?? SEED_GROCERY_STORES).filter((s) => s !== trimmed);
          const active = p.activeGroceryStore === trimmed ? undefined : p.activeGroceryStore;
          return { ...p, groceryStores: list, activeGroceryStore: active };
        });
        setGroceries((prev) => removeStoreFromItems(prev, trimmed));
        return true;
      };
    },
    [addStoreToList, removeStoreFromItems, setProfile, setGroceries, profileRef],
  );

  const addGroceryGroup = useCallback(
    (label: string): string | undefined => {
      const res = groceryGroupAdd(groceryGroupsRef.current, label);
      if (!res) return undefined;
      // res.groups === current ref on a dedup hit → nothing to persist.
      if (res.groups !== groceryGroupsRef.current) setGroceryGroups(res.groups);
      return res.id;
    },
    [groceryGroupAdd, setGroceryGroups],
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
      // Compute "became checked" SYNCHRONOUSLY from the ref-mirrored
      // current state. setGroceries(updater) queues its updater for the
      // next render, so reading a closure variable set inside the
      // updater returns the initial value at call time — that broke the
      // Row's completion-animation gate. Compute first, dispatch, return.
      const prev = groceriesRef.current;
      const beforeItem = prev.find((x) => x.id === id);
      const next = groceryToggleChecked(prev, id);
      // Advance the ref now and update functionally: a Mochi batch ("check
      // off milk and eggs") calls this several times in one tick, and a plain
      // setGroceries(next) from the stale ref kept only the last one.
      groceriesRef.current = next;
      setGroceries((p) => (p === prev ? next : groceryToggleChecked(p, id)));
      // 1 when the item just transitioned to checked — the Row fires the
      // completion animation on a positive value.
      return beforeItem && !beforeItem.checked ? 1 : 0;
    },
    [groceryToggleChecked, setGroceries],
  );

  const editGrocery = useCallback(
    (id: string, patch: { text?: string; groupId?: string; stores?: string[] }): boolean => {
      const prev = groceriesRef.current;
      const before = prev.find((it) => it.id === id);
      const after = groceryEdit(prev, id, patch).find((it) => it.id === id);
      setGroceries((p) => groceryEdit(p, id, patch));
      return !!before && JSON.stringify(before) !== JSON.stringify(after);
    },
    [groceryEdit, setGroceries],
  );

  const deleteGrocery = useCallback(
    (id: string): GroceryUndo | null => {
      const prev = groceriesRef.current;
      const idx = prev.findIndex((it) => it.id === id);
      if (idx === -1) return null;
      const item = prev[idx];
      setGroceries((p) => groceryDelete(p, id));
      // Undo: the very item back in its slot (unless it is back already).
      return () => {
        if (groceriesRef.current.some((it) => it.id === id)) return false;
        setGroceries((p) => (p.some((it) => it.id === id) ? p : [...p.slice(0, idx), item, ...p.slice(idx)]));
        return true;
      };
    },
    [groceryDelete, setGroceries],
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
  };
}
