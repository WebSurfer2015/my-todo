import { CategoryDef, SEED_CATEGORIES, migrateCategory } from '../../core/src/categories'
import { readVersioned } from './persistence'

export * from '../../core/src/categories'

/** Sync localStorage loader used by the web store's `useState(loader)` initializer. */
export function loadCategories(): CategoryDef[] {
  return readVersioned<CategoryDef[]>('categories', (raw) => {
    if (!Array.isArray(raw) || raw.length === 0) return SEED_CATEGORIES
    return (raw as Array<Partial<CategoryDef> & { id: string }>).map(migrateCategory)
  })
}
