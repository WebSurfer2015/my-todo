# useTodoStore split — design plan

`mobile/src/useTodoStore.ts` has grown to ~1500 lines with 30+
`useCallback` mutations covering todos, categories, profile,
groceries, groceryGroups, selection, and pebble accounting. Both
the code review and the architecture lens flagged it as the single
biggest tech-debt item in the codebase.

This doc captures the slice boundaries + extraction order so the
refactor can be done as 4-5 small, low-risk PRs instead of one
giant rewrite.

## Why not a single mega-PR

- A 1500-line refactor that touches every component importing
  `useStore()` is unreviewable.
- The store has cross-cutting concerns (pebble accounting reads
  profile, category delete rewrites todos, deriveState combines
  todos + filter + categories + t) that are easy to break silently.
- Most failures would only surface at runtime (broken sync, broken
  pebble counter, broken trash) which manual + RNFirebase-mocked
  tests can't easily catch.

The split should be **incremental**: one slice per PR, each PR
shipped + verified before the next starts.

## Slice boundaries

| Slice | State owned | Reads from |
|---|---|---|
| **useTodosSlice** | `todos`, `selectedTrashIds`, `todoReferences` | profile (for pebble accounting), categories (for `deleteCategory` rewrite) |
| **useCategoriesSlice** | `categories` | none |
| **useProfileSlice** | `profile`, `lastSavedAt` | none |
| **usePebbleSlice** | (no own state — pure derived from profile) | profile |
| **useGroceriesSlice** | `groceries`, `groceryGroups` | profile (for activeGroceryStore default), agentEnabled gate |
| **useSelectionSlice** | already part of useTodosSlice today; consider keeping |

## Extraction order (5 PRs)

1. **PR 1 — `useCategoriesSlice`**. Smallest, fewest dependencies.
   Exposes categories + add/edit/delete/reorder. Outside reads: none.
   Risk: low. Touches every component that uses `store.categories` —
   but only at the import / hook-result destructuring level.

2. **PR 2 — `useProfileSlice` + `lastSavedAt`**. Just profile state +
   `saveProfile`. The `lastSavedAt` indicator + `onSaved` callback.
   Risk: low.

3. **PR 3 — `useGroceriesSlice`**. Owns groceries + groceryGroups +
   all 15 grocery mutations. Reads profile for activeGroceryStore +
   agentEnabled. Risk: medium — the AI call inside `addGrocery`
   reaches across slice boundaries.

4. **PR 4 — `useTodosSlice`**. The largest slice (~800 lines). All
   todo mutations + selection + references + pebble accounting.
   Risk: highest. Defer until PRs 1-3 are stable.

5. **PR 5 — `useTodoStore` becomes the composer**. Imports the
   slices, calls each with the shared adapter, composes the return
   value, adds derived state (`deriveState` call + `appTitle` +
   `headerLine`). Tiny.

## Rules for each PR

- **Stable callback identity** must survive: every callback that
  flows into `<TaskItem>` (toggle, moveToTrash, restoreFromTrash,
  permanentlyDelete, updatePriority, updateDueDate,
  updateTaskCategory, updateText, toggleTrashSelection) needs to
  retain its memoization shape per `mobile/CLAUDE.md`.
- **No new state.** Each slice extracts existing state; don't
  introduce new fields during the split. Save behavior changes for
  separate PRs.
- **Same return shape from `useStore()`.** Components don't change.
- **Suite green after each PR.** All 408 tests + typecheck pass.
- **Manual smoke** of compose + mark done + add grocery on the
  simulator between PRs.

## What stays in useTodoStore

After the 5 PRs:

- `useStore()` composition
- `migrateLocalToCloud` (cross-slice on first sign-in)
- `useSyncedState` adapter wiring per key
- The derived state useMemo (deriveState input/output)
- Cross-tab signal pattern (manageRequest)
- Computed reads (`appTitle`, `headerLine`, `identityLine`, etc.)

Target after the split: useTodoStore.ts ≤ 300 lines.

## Open questions for the first PR

- Hook signature: `useCategoriesSlice(adapter)` or pass the storage
  adapter via a context?
- Test approach: each slice gets its own hook test (RTL + happy-dom)
  with a mock adapter, OR rely on integration testing through
  `useStore()` consumer tests?
- Backwards compat with existing memory rule
  (`feedback_use_todo_store_stability.md` if one exists)?
- Should `selectedTrashIds` move to its own slice or stay coupled
  to todos? (Currently coupled via bulk restore / delete.)

## Out of scope

- Splitting the giant component files (TaskDetailsSheet, ComposeSheet,
  etc.) — covered by `docs/COMPONENT-SPLIT-PLAN.md` (separate item).
- Migrating to a state-management library (Zustand, Jotai, Redux).
  The hook pattern works; adding a library is a bigger architectural
  decision that should come from a separate ADR.
