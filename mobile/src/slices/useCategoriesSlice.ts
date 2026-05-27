// PR 1 of the useTodoStore split — see docs/USETODOSTORE-SPLIT-PLAN.md.
// Owns the categories list + the three pure mutations (add/edit/reorder).
// `deleteCategory` stays in the composer because it crosses into todos
// (rewrites their category refs), filter (resets if pointing at the
// deleted id), and profile (strips pinned `cat:<id>` filters) — those
// other slices haven't been extracted yet.

import { useCallback } from "react";
import { useSyncedState } from "../useSyncedState";
import {
  CategoryDef,
  SEED_CATEGORIES,
  migrateCategory,
  newCategoryId,
} from "../categories";
import {
  categoryAdd,
  categoryEdit,
  categoryReorder,
} from "../../../core/src/derive";
import { StorageAdapter } from "../../../core/src/persistence";
import { unwrap, serializeAny } from "../storage/envelope";

const parseCategories = (raw: string | null): CategoryDef[] => {
  const data = unwrap(raw);
  if (!Array.isArray(data) || data.length === 0) return SEED_CATEGORIES;
  return (data as Array<Partial<CategoryDef> & { id: string }>).map(
    migrateCategory,
  );
};

export interface CategoriesSlice {
  categories: CategoryDef[];
  setCategories: (
    next: CategoryDef[] | ((prev: CategoryDef[]) => CategoryDef[]),
  ) => void;
  categoriesLoaded: boolean;
  addCategory: (data: {
    label: string;
    color: string;
    icon: string;
  }) => string;
  editCategory: (
    id: string,
    data: { label: string; color: string; icon: string },
  ) => void;
  reorderCategories: (fromIdx: number, toIdx: number) => void;
}

export function useCategoriesSlice(
  adapter: StorageAdapter,
  onSaved?: (ts: number) => void,
): CategoriesSlice {
  const [categories, setCategories, categoriesLoaded] = useSyncedState<
    CategoryDef[]
  >(
    adapter,
    "categories",
    SEED_CATEGORIES,
    parseCategories,
    serializeAny,
    onSaved,
  );

  const addCategory = useCallback(
    (data: { label: string; color: string; icon: string }): string => {
      const id = newCategoryId();
      setCategories((prev) => categoryAdd(prev, id, data));
      return id;
    },
    [setCategories],
  );

  const editCategory = useCallback(
    (
      id: string,
      data: { label: string; color: string; icon: string },
    ): void => {
      setCategories((prev) => categoryEdit(prev, id, data));
    },
    [setCategories],
  );

  const reorderCategories = useCallback(
    (fromIdx: number, toIdx: number): void => {
      setCategories((prev) => categoryReorder(prev, fromIdx, toIdx));
    },
    [setCategories],
  );

  return {
    categories,
    setCategories,
    categoriesLoaded,
    addCategory,
    editCategory,
    reorderCategories,
  };
}
