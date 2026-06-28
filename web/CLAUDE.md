# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server
- `npm run build` — type-check (`tsc -b`) then build with Vite; type errors fail the build
- `npm run preview` — serve the built `dist/`
- `npm test` — Vitest once. Excludes `tests/firestore-rules.test.ts` because it needs the emulator. Includes `src/{selection,core,i18n}.test.ts`.
- `npm run test:watch` — Vitest in watch mode (also excludes the rules test)
- `npm run test:rules` — boots the Firestore emulator via `firebase emulators:exec` and runs the rules test against it
- Single file: `npx vitest run src/selection.test.ts`; filter by name: `npx vitest run -t "regression"`
- `npm run lint` — ESLint via flat config (`eslint.config.js`). Rules are mostly **warnings** (incl. `react-hooks/set-state-in-effect`, `react-hooks/refs`, `@typescript-eslint/no-explicit-any`) — they won't fail CI on their own.
- `npm run deploy` — `npm run build && firebase deploy --only hosting`. **Production is hosted on AWS Amplify** (auto-deploys from the `main` branch via root-level `amplify.yml`); `firebase hosting` is a backup target, not the primary surface.
- `npm run deploy:rules` — `firebase deploy --only firestore:rules`. Use when `firestore.rules` changes.

TypeScript is `strict` with `noUnusedLocals` and `noUnusedParameters` on (see `tsconfig.app.json`), so dead variables/params fail the build — `tsc -b` (via `npm run build`) is the authoritative verification pass; the lint step warns but doesn't block.

A `PostToolUse:Edit/Write` hook runs `npm run build` after every file edit. If a Write/Edit lands the codebase in a non-compiling state (e.g. importing a symbol you haven't used yet, removing an export still referenced elsewhere), the hook blocks. Land import-then-usage in a **single Write**, not two Edits.

## Architecture

Single-page React 18 + TypeScript + Vite app. No router. Auth via Firebase (Google / Apple / Facebook / email-password) and per-user state syncs to Firestore at `users/{uid}/state/{key}`. While signed out (or before auth resolves), state lives in `localStorage` under the same keys (`todos`, `categories`, `profile`, `lang`) using the same versioned envelope, so the same parser/migrator handles both. Domain state lives in `useTodoStore`; the storage adapter behind it switches on `uid` (see "Persistence & sync" below). Sentry is wired in `main.tsx` and gated on `VITE_SENTRY_DSN` (no-op when unset, so dev never reports).

### Shared `core/` package

Pure TypeScript module at `/Users/yingnming/WebProjects/core/` (sibling of `my-todo/` and `my-todo-mobile/`). Both apps import from `'../../core/src/...'` — no monorepo, no path aliases, just relative paths. The web project's `src/{types,groups,utils,i18n,categories,profile}.ts` are now thin re-exports from core; the only platform-specific code is the storage adapter, the React glue, and the UI components.

Core exports:

- `types.ts` — `Todo`, `Filter` (with `cat:` prefix), `Priority`, `STATUS_FILTERS`, `PRIORITY_VALUES`, `PRIORITY_COLORS` (hex), filter helpers.
- `utils.ts` — date helpers (`todayLocal`, `endOfWeekLocal`, `isoDate`, `formatDisplayDate` with optional `today/tomorrow/yesterday` labels).
- `groups.ts` — `buildGroups({ separateDone? })`.
- `persistence.ts` — `StorageAdapter` interface (async `getItem`/`setItem`/`removeItem`/`clear`), `readVersioned`/`writeVersioned` wrapping a `{version, data}` envelope, `clearAllPersisted`.
- `categories.ts` — `CategoryDef` (icon: string, color: hex), `SEED_CATEGORIES`, `COLOR_PALETTE`, `migrateCategory` (with var(--\*) → hex migration baked in for legacy web data), `categoryLabel`.
- `profile.ts` — `Profile`, `Avatar` discriminated union (`image` with `uri` / `icon` / `preset`), `AVATAR_ICON_LIBRARY`, `AVATAR_PRESET_LIBRARY`, `findPreset`, `migrateProfile`.
- `i18n.ts` — merged `strings.{en,zh}` covering both platforms' keys.
- `derive.ts` — pure mutation helpers (`todoToggle`, `todoMoveToTrash`, `todoSet`, `categoryAdd`, `categoryDelete`, …) and `deriveState({todos, filter, categories, t})` returning `{filtered, groups, counts, sectionLabel, subtitle, emptyState, defaultCategory, …}`. Pure functions only — no React, no platform deps.

Each platform's `useTodoStore` is now thin glue: storage adapter + `useState`/`useCallback`/`useMemo` + calls into core's `derive` and mutation helpers.

### Top-level wiring (`src/main.tsx`)

```
<StrictMode>
  <ErrorBoundary>        // catches mutation throws, offers data-clear reset
    <AuthProvider>       // Firebase auth state + sign-in/up/out APIs
      <LangProvider>     // i18n, lang persisted to localStorage via usePersistedState
        <NotifyProvider> // snackbar + confirm dialog (portaled)
          <App />
        </NotifyProvider>
      </LangProvider>
    </AuthProvider>
  </ErrorBoundary>
</StrictMode>
```

All providers must be present in this order: `useTodoStore` consumes `useAuth()`, `useLang()`, and `useNotify()`, and each context default is `null!` so hooks throw outside their provider. `App.tsx` blocks on `auth.loading`, then renders `<SignIn />` when `!user`, then renders the app. Any new top-level provider must be added here.

Sentry init runs at the very top of `main.tsx`, before `createRoot`, gated on `import.meta.env.VITE_SENTRY_DSN`. Without the env var it's a no-op.

### Domain store (`src/useTodoStore.ts`)

`useTodoStore()` is the single owner of domain state — `categories`, `todos`, `filter`, `profile`, `selectedTrashIds`. The three persisted entities (`categories`, `todos`, `profile`) are owned by `useSyncedState` calls against the auth-aware `adapter` described above. `filter` and `selectedTrashIds` are session-only (plain `useState`).

The store also returns derived data (`filtered`, `groups`, `systemCounts`, `byCategoryOpen`/`byCategoryTotal`, `sectionLabel`, `subtitle`, `emptyState`, `defaultCategory`, `appTitle`, `greetingKey`, `loaded`, …) all computed by `core/src/derive.ts → deriveState(...)` inside a `useMemo` keyed on `[todos, filter, categories, t]`, plus all mutations. `App.tsx` is layout-only and keeps just ephemeral UI state (drawer toggle).

Four rules to know when extending the store:

1. **Mutations passed to `TaskItem` MUST stay stable.** `TaskItem` is wrapped in `React.memo`, so its memoization breaks if a callback prop gets a new identity each render. The mutations that flow into `TaskItem` (`toggle`, `moveToTrash`, `restoreFromTrash`, `permanentlyDelete`, `updatePriority`, `updateDueDate`, `updateTaskCategory`, `updateText`, `toggleTrashSelection`) are wrapped in `useCallback` with **only setter deps** (and refs for `toggleTrashSelection`). They use functional setState (`setTodos(prev => ...)`) so they don't close over `todos`. Non-`TaskItem` mutations (e.g. `addCategory`, `deleteCategory`, `bulkPermanentDelete`) don't have this constraint and are plain functions.
2. **Derived state is wrapped in `useMemo`** keyed on `[todos, filter, categories, t]`. `t` is included so language toggles refresh `sectionLabel`/`subtitle`/`emptyState`. If you add a derived value that depends on `profile` or another piece of state, add it to the dep array.
3. **Trash-selection bulk ops use refs** (`todosRef`, `lastSelectedRef`) to keep `toggleTrashSelection` stable. The selection set is `Set<string>` (todo ids are strings — see "ID format" below). If you need access to current `todos` from a stable callback, follow the same `useRef` + sync `useEffect` pattern.
4. **Hydration is async**. Even with `localStorage` (the signed-out path), `useSyncedState` flips `loaded` true only after the first `adapter.getItem` resolves on a microtask. The store exposes `loaded = categoriesLoaded && todosLoaded && profileLoaded`. `App.tsx` does NOT gate on `store.loaded` directly — it gates on `auth.loading` and shows a loading shell, then flips to `<SignIn />` or the app. Components that need to wait for first hydrate before rendering should check `store.loaded`.

### Persistence & sync

Three layers cooperate:

1. **`StorageAdapter`** (`core/src/persistence.ts`) — async key/value interface (`getItem`/`setItem`/`removeItem`/`clear`, optional `subscribe`). All persistence flows through this.
2. **Two adapter implementations:**
   - `storage` in `src/persistence.ts` — wraps browser `localStorage` (no `subscribe`).
   - `makeFirestoreAdapter(db, uid)` in `src/firestoreAdapter.ts` — reads/writes `users/{uid}/state/{key}` as `{ value: <json envelope>, updatedAt: number }`. `subscribe` uses `onSnapshot` so cross-device + cross-tab updates land live. `clear()` is a no-op (subcollection enumeration is too expensive).
3. **`useSyncedState(adapter, key, initial, parse, serialize)`** (`src/useSyncedState.ts`) — the hook every persisted entity goes through. Hydrates via `adapter.getItem` → flips its `loaded` flag, subscribes if the adapter supports it, debounces writes by ~400ms (so a burst of mutations during typing collapses into one Firestore `setDoc`). A `lastSerializedRef` short-circuits write→subscribe→setState round-trips.

The versioned envelope (`{ version: SCHEMA_VERSION, data }`) is the same on both adapters, so the same `migrate*` functions in core handle either. `SCHEMA_VERSION` is `1`. Bumped versions get forward-migration in the appropriate `migrate*` function.

The legacy sync `readVersioned`/`writeVersioned` and `usePersistedState` (`src/usePersistedState.ts`) are still exported but only `LangProvider`'s `lang` key uses them. New persisted entities should use `useSyncedState` against the auth-aware adapter from the store, not `usePersistedState`. `usePersistedState` is **not** auth-aware and would write to `localStorage` only.

### Auth + adapter swap (`src/AuthContext.tsx` + `useTodoStore`)

`AuthContext` exposes `{ user, loading, signIn, signUp, signInWithApple, signInWithGoogle, signInWithFacebook, resetPassword, signOut, deleteAccount }`. Social sign-in uses `signInWithPopup` and falls back to `signInWithRedirect` on `auth/popup-blocked` / `auth/operation-not-supported-in-this-environment` / `auth/unauthorized-domain` / `auth/web-storage-unsupported` (Safari ITP, in-app browsers). `getRedirectResult` runs on every mount to complete pending redirect handshakes.

First-time social sign-in calls `seedProfileIfMissing` — fetches `users/{uid}/state/profile`, and if absent writes a profile derived from `cred.user.displayName` / `cred.user.email`. **Apple sends name only on the very first sign-in**, so a missed seed there is unrecoverable.

`signOut()` clears `["todos","categories","profile"]` from `localStorage` so the next user signing in on this browser can't bleed prior-user data into their empty Firestore via `migrateLocalToCloud` (see below).

`deleteAccount()` deletes Firestore docs first (security rules block writes once auth is gone), then `deleteUser`. Throws `RecentLoginRequiredError` on `auth/requires-recent-login` so UI can prompt re-auth.

In `useTodoStore`:

```ts
const uid = user?.uid ?? null;
const adapter = useMemo<StorageAdapter>(
  () => (uid ? makeFirestoreAdapter(db, uid) : localAdapter),
  [uid],   // memoize on uid, NOT on the User object
);
```

**Memoize on `uid`, never on `user`.** Firebase rotates the `User` reference roughly hourly on token refresh. Memoizing on `user` would tear down Firestore listeners and re-fire `migrateLocalToCloud` on every refresh.

`migrateLocalToCloud(adapter)` runs once per uid: for each key in `["todos","categories","profile"]`, if the cloud value is missing, push the local `localStorage` value up. **Per-key gating** is intentional — only checking `profile` would let a stale local `todos` overwrite cloud `todos` on a device whose cloud profile happened to be missing.

### Firebase setup (`src/firebase.ts`) + Firestore rules

`firebase.ts` initializes the app with `initializeFirestore` (vs `getFirestore`) so it can configure `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` — repeat loads paint instantly from IndexedDB, and two open tabs share the same cache. `setPersistence(auth, browserLocalPersistence)` is set explicitly. The `firebaseConfig` is bundled in JS (intentional — Firebase config is not a secret; security is enforced by rules).

`firestore.rules` (deployed via `npm run deploy:rules`):

- `users/{uid}/state/{key}` — only the signed-in user can read/write their own subtree (`request.auth.uid == uid`).
- Default deny on everything else, including the root `users` collection (would otherwise leak the set of valid uids).

`tests/firestore-rules.test.ts` exercises these rules under the Firestore emulator (`npm run test:rules`).

### Data flow

- All mutations go through the setters returned by `usePersistedState`. Components never touch state or localStorage directly — they call callbacks from the store.
- On mount, `loadTodos()` (called inside `useTodoStore`) reads the versioned envelope, defaults missing `priority`/`dueDate`/`category`/`trashed`, validates `category` against the loaded category list (reassigning to `categories[0].id` if invalid), and **purges trashed todos older than `TRASH_RETENTION_MS` (30 days)** — the only auto-mutation that runs without user action.
- `App.tsx` reads everything off the `store` object returned by `useTodoStore`. Filtering, grouping, and counts are pre-computed in the store; `App.tsx` just renders.
- Cmd/Ctrl+K focuses the AddTask input via a `forwardRef` + `useImperativeHandle` exposed by `AddTask.tsx`. The shortcut listener lives in `App.tsx` and reads `store.filter` / `store.setFilter`.

### Grouping (`src/groups.ts`)

After filtering, todos are bucketed into `overdue` / `today` / `week` / `upcoming` / `done` based on `dueDate` vs `todayLocal()` and `endOfWeekLocal()` (see `src/utils.ts` — these use **local** dates, not UTC, to avoid off-by-one bugs at midnight). `endOfMonthLocal` is also exported (used by mobile's date chips).

`buildGroups` takes an optional `{ separateDone }` flag. When true, completed todos are pulled into the `done` bucket instead of being date-bucketed; when false, all todos are date-bucketed. The store passes `separateDone: filter !== 'done'` so the Done filter view still date-buckets completed todos, while every other view shows completed todos in a trailing Done group.

Within each bucket, todos are sorted by priority rank (`high < medium < low`), then due date, then id. Empty buckets are dropped. Overdue group renders with `group-header--overdue` (red).

### Categories (`src/categories.ts` re-exports `core/src/categories.ts`)

Categories are **runtime data**, not compile-time literals. `CategoryDef = { id, label?, color, icon }` lives in core; web's `src/categories.ts` is a re-export plus a sync `loadCategories()` shim. `SEED_CATEGORIES` (home/school/work/other) and `COLOR_PALETTE` use **hex colors** (e.g. `#34C759`) — not `var(--green)` — so the same value works in DOM inline styles, RN StyleSheet, and Firestore. `migrateCategory` (in core) maps legacy `var(--*)` color tokens from old web data to hex on read.

Built-ins are not privileged — they can be renamed, recolored, re-iconed, reordered, and deleted just like custom categories.

- `categoryLabel(c, t)` resolves a category's display label: user-set `label` wins; otherwise built-ins fall back to `t.categories[id]` (so unrenamed built-ins stay localized).
- `BUILTIN_CATEGORY_IDS` only matters for that i18n fallback — there is no other special-casing.
- The icon registry in `src/components/CategoryIcon.tsx` (lucide-based, ~80 icons) drives the picker. `CategoryIcon` takes `{ icon: string }`, **not** a category id. Categories store the icon key in `CategoryDef.icon` (a plain string in core).

`Todo.category` is a `string` (the id of a `CategoryDef`). The store's `migrateTodos` (in core) validates against the loaded category list and clears invalid ids, keeping storage consistent across category deletes.

### Filters (`src/types.ts`)

`Filter = SystemFilter | \`cat:${string}\``— system filters are`'all' | 'overdue' | 'open' | 'done' | 'trash'`, plus category filters tagged with a `cat:`prefix. Helpers:`isCategoryFilter(f)`, `categoryIdFromFilter(f)`, `categoryFilter(id)`. Because template-literal Filter members can't be enumerated, filter counts use a struct shape `{ all, overdue, open, done, trash, byCategory }`rather than`Record<Filter, number>`.

`Todo` carries `trashed: boolean` and `trashedAt?: number`. The active list filters out trashed items everywhere except the `'trash'` view, which shows only trashed items. `Todo.updatedAt?: number` is set on every mutation in core's `derive.ts` helpers and is used for last-write-wins semantics in cross-device sync.

#### ID format

`Todo.id` is `string` (UUID v4 generated by `crypto.randomUUID()` inside `core/src/derive.ts → newTodo`). Older v0 stores used `Date.now()` numbers, which collide on rapid bursts and aren't safe across devices — `migrateTodos` in core rewrites legacy numeric ids to UUIDs on read. Anything new that holds id sets/maps must use `Set<string>` / `Record<string, …>`.

`PRIORITY_VALUES` / `PRIORITY_COLORS` (hex) live in core. The CSS variables in `src/index.css` (`--red`, `--orange`, `--blue`) are kept for the rest of the chrome (sidebar accents, etc.) but priority badges now use the core hex values directly so the same colors render consistently across web and mobile.

### Sidebar interactions (`src/components/Sidebar.tsx`)

- "+" button next to the Categories section heading opens `CategoryPopover` in add mode.
- Each category row is `draggable` (native HTML5 DnD); reorder fires `store.reorderCategories(from, to)`. Visual states: `.sidebar-row.dragging` and `.sidebar-row.drag-over`.
- Hovering a category row reveals a "..." button that opens `CategoryPopover` in edit mode. The button has `draggable={false}` to avoid stealing drag events.
- Delete (in edit mode) auto-reassigns affected todos to the first remaining category and is blocked when only one category exists. Reassignment lives in `useTodoStore.deleteCategory()` — it rewrites `todos` and resets `filter` to `'all'` if the user was filtering on the deleted category. The destructive confirm dialog is owned by the store, not by the popover.

### Profile (`src/profile.ts` re-exports `core/src/profile.ts`)

`Profile = { name, quote?, avatar, density?, title? }` is persisted under `localStorage` key `profile`. `Avatar` is a discriminated union with three kinds (defined in core to keep cross-device sync interchangeable):

- `{ kind: 'image', uri }` — uploaded photo. On web, `uri` is a compressed data URL (`fileToCompressedDataURL`); on mobile, a file/remote URI.
- `{ kind: 'icon', icon, color }` — web's lucide-icon avatars. `AVATAR_ICON_LIBRARY` in core.
- `{ kind: 'preset', key }` — mobile's emoji presets. `AVATAR_PRESET_LIBRARY` in core.

Web's `AVATAR_LIBRARY` re-export aliases the icon library; mobile's aliases the preset library. Each platform's `<Avatar>` component must handle all three kinds — fall back gracefully if it encounters an unfamiliar one (web renders preset emoji directly, mobile falls back to a colored circle for icon kind). `density` (`'comfortable' | 'compact'`) is rendered as a `data-density` attribute on `.app-shell`. `title` is the editable page heading (defaults to "My TODOs").

The store exposes `saveProfile`, which is **just the `useState` setter** from `usePersistedState('profile', ...)`. There's no bespoke save function — it accepts either a full `Profile` or an updater.

### Notifications (`src/notify.tsx`)

`NotifyProvider` exposes a single `useNotify()` hook returning `{ showSnackbar, confirm }`. The context value is memoized via `useMemo` so consumers don't re-render on unrelated provider state changes (snackbar/dialog open/close). Both UIs render via `createPortal(document.body)` to escape the sidebar's `backdrop-filter` containing block. `showSnackbar({ message, actionLabel?, onAction?, durationMs? })` is used for the Undo flow on `moveToTrash`. `confirm({ ... })` returns `Promise<boolean>` and replaces native `window.confirm` for destructive actions. **Reuse these — do not call `alert`/`confirm` directly.**

The destructive-action confirm dialogs are owned by the store mutations themselves (`emptyTrash`, `bulkPermanentDelete`, `deleteCategory`), not by call sites. If you add a new destructive mutation, follow the same pattern.

### Selection helpers (`src/selection.ts`)

Pure functions for the trash-view bulk select: `toggleSelection`, `applyBulkRestore`, `applyBulkDelete`. Kept pure so `selection.test.ts` can exercise them with no React. There was a stale-closure bug fixed by going through these helpers — `useTodoStore` always uses the **functional** form `setSelectedTrashIds(prev => toggleSelection({ prev, ... }))`. The regression is locked in by a Vitest test.

### Error boundary (`src/ErrorBoundary.tsx`)

Top-level catch for any uncaught throw from a mutation, render, or effect. Renders a fallback with two recovery actions:

- **Try again** — clears the error state, attempts to re-render the tree.
- **Reset all data and reload** — `localStorage.clear()` then `window.location.reload()`. This is the escape hatch for corrupt persisted state.

Inline-styled (no CSS class dependency) so it works even if `index.css` failed to load.

### i18n (`src/i18n.ts` + `src/LangContext.tsx`)

All user-facing text routes through `useLang().t`. `strings` is keyed by `Lang` (`'en'` | `'zh'`) and includes function entries (`remaining(n)`, `listSubtitle(n)`) for plural/count formatting. Language is **persisted to localStorage** under the key `lang` (versioned envelope). When adding UI copy, add both `en` and `zh` entries; TypeScript will enforce the shape via `Strings`.

The context value is memoized (`useMemo` on `[lang, toggle]`) so components don't re-render on unrelated provider re-renders.

**Do not add `as const` to `strings`.** `Strings` is `typeof strings['en']`, so `as const` pins it to en's literal values and `strings.zh` (different literals) becomes unassignable in `LangContext`.

### Styling (`src/index.css`)

Apple-system color palette + Reminders.app-style two-column layout. Light/dark mode via `prefers-color-scheme: dark` overriding the same CSS custom properties. Per-category accent on task items is driven by a single `--cat-color` CSS variable set **inline** from `CategoryDef.color` (a 3px `::before` stripe reads it). There are **no** `.cat-home/.cat-school/.cat-work` rules — that pattern was removed when categories became runtime data. The sidebar's active-item accent uses an inline `--accent` CSS var set from the active category's color.

Density is exposed via `data-density="comfortable" | "compact"` on `.app-shell`; compact rules live under `.app-shell[data-density="compact"] ...` selectors.

### Component conventions

- Dropdowns (priority/category pickers in `AddTask.tsx`, `TaskItem.tsx`) all use `useCloseOnOutside` from `src/hooks.ts` for outside-click + Escape dismissal. Reuse this hook rather than reimplementing.
- `TaskItem` is wrapped in `React.memo` (default shallow compare). Don't pass freshly-created objects/arrays as props to it from `App.tsx` or memo will be defeated. Callbacks must come from the store's stable `useCallback`'d set.
- `TaskItem` text editing toggles between a `<span>` and an `<input>`; click-to-edit is disabled when `todo.done` is true.
- Date inputs use `dateRef.current?.showPicker()` to trigger the native picker from a styled chip button.
- `lucide-react` provides the bulk of category icons via `CategoryIcon.tsx` (80+) and the mobile top-bar (`Menu`/`X`). `Sidebar.tsx` and `TaskItem.tsx` use **inline SVGs** instead — match the style of nearby components when adding icons rather than mixing approaches in one file.

### Hosting

Production traffic lives at AWS Amplify (`main.dhcuxhzauzw4c.amplifyapp.com` and the custom domain). The build spec is at the repo root in `amplify.yml` (`appRoot: web`). Amplify rebuilds + deploys on every push to `main`. Firebase Hosting (`firebase.json`) is configured as a fallback target — `dist/` published, SPA rewrite to `/index.html`, immutable cache headers on hashed assets — but `npm run deploy` is not the canonical deploy path; pushes to `main` are.

### Tests

- `src/selection.test.ts` — locks in the trash-view bulk-select stale-closure regression.
- `src/core.test.ts` — exercises pure helpers from `core/src/derive.ts` and friends.
- `src/i18n.test.ts` — verifies `strings.en` and `strings.zh` cover the same key shape and that count formatters return non-empty strings.
- `tests/firestore-rules.test.ts` — runs under the Firestore emulator to verify per-uid isolation. Requires the Firebase CLI installed; gated behind `npm run test:rules` so a normal `npm test` doesn't fail when the emulator isn't running.
