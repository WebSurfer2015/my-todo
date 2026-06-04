/**
 * User-facing JSON export. Produced by the "Export data" button in
 * ProfileSheet (mobile) / ProfilePopover (web). The payload is a
 * stable, version-tagged snapshot of everything the app persists
 * under `users/{uid}/state/{key}` for the signed-in user — so a user
 * can keep a personal backup, hand it to support, or eventually pipe
 * it into an Import flow.
 *
 * The shape mirrors the storage envelope intentionally: each entity
 * is its own `{ version, data }` block so a future migration can
 * version each entity independently. The top-level wrapper records
 * the export-format version + an `exportedAt` timestamp.
 */

import type { Todo, TodoReference } from '../domain/types'
import type { Profile } from './profile'
import type { CategoryDef } from './categories'
import type { GroceryItem, GroceryGroup } from './groceries'

/**
 * Bump when the export wrapper shape changes (top-level keys, framing).
 * Bumping a per-entity schema doesn't require touching this — entity
 * versions live in each block's own envelope.
 */
export const EXPORT_VERSION = 1

export interface ExportPayload {
  version: number
  exportedAt: number
  app: {
    name: 'Sagely'
    /** Free-form — lets a future Import flow know roughly what produced
     *  the file. Caller can set this from package.json / build info. */
    appVersion?: string
  }
  data: {
    todos?: Todo[]
    categories?: CategoryDef[]
    profile?: Profile
    todoReferences?: TodoReference[]
    groceries?: GroceryItem[]
    groceryGroups?: GroceryGroup[]
  }
}

export interface BuildExportInput {
  todos?: Todo[]
  categories?: CategoryDef[]
  profile?: Profile
  todoReferences?: TodoReference[]
  groceries?: GroceryItem[]
  groceryGroups?: GroceryGroup[]
  appVersion?: string
  /** Optional override (ms since epoch). Defaults to `Date.now()` —
   * tests pass an explicit value for determinism. */
  now?: number
}

/**
 * Build the JSON-serializable export payload. Pure. Omits empty
 * entities (undefined or empty arrays) so a freshly signed-in user
 * who hasn't created anything yet gets a clean small file rather
 * than a sea of `[]`.
 */
export function buildExportPayload(input: BuildExportInput): ExportPayload {
  const payload: ExportPayload = {
    version: EXPORT_VERSION,
    exportedAt: input.now ?? Date.now(),
    app: {
      name: 'Sagely',
      ...(input.appVersion ? { appVersion: input.appVersion } : {}),
    },
    data: {},
  }
  if (input.todos && input.todos.length > 0) payload.data.todos = input.todos
  if (input.categories && input.categories.length > 0)
    payload.data.categories = input.categories
  if (input.profile) payload.data.profile = input.profile
  if (input.todoReferences && input.todoReferences.length > 0)
    payload.data.todoReferences = input.todoReferences
  if (input.groceries && input.groceries.length > 0)
    payload.data.groceries = input.groceries
  if (input.groceryGroups && input.groceryGroups.length > 0)
    payload.data.groceryGroups = input.groceryGroups
  return payload
}

/**
 * Convenience: stringify the payload with stable two-space indent so
 * the file is human-readable when opened in Notes / a text editor.
 */
export function serializeExport(payload: ExportPayload): string {
  return JSON.stringify(payload, null, 2)
}

/** True iff the export would be effectively empty (no data fields). */
export function isExportEmpty(payload: ExportPayload): boolean {
  const d = payload.data
  return (
    !d.todos?.length &&
    !d.categories?.length &&
    !d.profile &&
    !d.todoReferences?.length &&
    !d.groceries?.length &&
    !d.groceryGroups?.length
  )
}
