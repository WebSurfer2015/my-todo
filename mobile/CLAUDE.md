# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the **mobile** workspace of `my-todo` — the Sagely app (Expo SDK 54 + React Native 0.81 + TypeScript), iOS-first. Pure domain logic lives in `../core/` and the backend in `../functions/` (see the root `CLAUDE.md` for layout, gates and the dependency rule; this file covers mobile concerns).

## Source layout (`src/`)

Feature-folder layout:

- `app/` — bootstrap & shell: contexts/providers (`AuthContext`, `LangContext`, `notify`, `StoreContext`, `SheetContext`), `ErrorBoundary`, `theme`, and top-level chrome (`AppHeader`, `AppBackground`, `Fab`, `Footer`, `SplashOverlay`). `App.tsx` is at the workspace root.
- `adapters/` — IO / platform edges: `firebase`, `firestoreAdapter`, `persistence`, `crashReporting`, `notifications`, `aiInfer`, `authErrors`.
- `store/` — domain store: `useTodoStore`, `useSyncedState`, `slices/`.
- `core-bindings/` — thin re-export shims over `../../core/src/*` (`types`, `groups`, `categories`, `i18n`, `profile`, `utils`, `groceries`). Import core through these (or core directly), not by reaching across.
- `ui/` — shared, feature-agnostic presentational components (`Avatar`, `CategoryIcon`, `EmptyState`, `InlinePicker`, …).
- `features/<domain>/` — co-located feature UI + hooks: `task/`, `category/`, `groceries/`, `profile/`, `filters/`, `mochi/` (chat + pebbles), `onboarding/`, `auth/`, `home/`. Multi-file components keep their own dir (`features/task/TaskItem/{index,styles}`).

When adding a file, place it by feature; keep shared presentational bits in `ui/` and IO in `adapters/`.

## Commands

- `npm run ios` / `npm run android` — `expo run:ios` / `expo run:android`. Builds the dev client and launches on a sim/device. **Use the dev client, not Expo Go** — the project depends on native modules (Firebase, Google Sign-In, Apple Auth) that Expo Go does not bundle. `expo-dev-client` is in deps so EAS won't print the "uses Expo Go" warning.
- `npm start` — starts the Metro bundler only (use after a dev client is already installed).
- `npm run typecheck` — `tsc --noEmit`. Strict mode is on via `expo/tsconfig.base` + `"strict": true`.
- `npm run lint` — flat-config ESLint (`eslint.config.js`), **zero warnings allowed** (`--max-warnings 0`, enforced in CI). `rules-of-hooks` + `exhaustive-deps` are errors; the React Compiler rules are off (the app doesn't use the compiler). The typecheck enforces `noUnusedLocals` / `noUnusedParameters`.
- `npm test` / `npm run test:watch` — Vitest. Test files live under `mobile/src/__tests__/*.test.ts`. Default env is node (pure logic); **hook tests** opt into a DOM with a `// @vitest-environment happy-dom` header and use `@testing-library/react`'s `renderHook`. `react-native` is aliased to an inert stub (`vitest-stubs/react-native.ts`) — RN's Flow source can't be transformed, so native UI / bridge behavior is out of scope (device QA covers it). Mock network with `vi.stubGlobal('fetch', …)`; never call the live AI API in tests.

### EAS builds & submission

- `eas build --platform ios --profile production --auto-submit` — production build, `autoIncrement` bumps `buildNumber`, channel `production`, auto-submits to App Store Connect using the API key in `eas.json` (`ascAppId 6767378689`, key `QD85GLBAA2` at `~/.appstoreconnect/AuthKey_QD85GLBAA2.p8`).
- `eas build --platform ios --profile development` — simulator-targeted dev client build.
- `appVersionSource: remote` — version state is owned by EAS, not local files. Don't bump `buildNumber` in `app.json`; let `autoIncrement` handle it.
- `requireCommit: true` — uncommitted changes block builds. Commit before invoking EAS.
- Android builds work (`buildType: app-bundle`) but Play Store submission is currently parked — see `../../.claude/projects/-Users-yingnming-WebProjects-my-todo/memory/project_android_paused.md`. App is fully wired; blocker is Google's account-verification step requiring a real Android device.

### Screenshot upload

`../scripts/asc_upload_screenshots.py <dir>` uploads to ASC version `5024a18a-…`. Maps PNG dims → display type via `SUPPORTED_SIZES` (1242×2688→APP_IPHONE_65, 1290×2796→APP_IPHONE_67, 2048×2732→APP_IPAD_PRO_3GEN_129). `APP_IPHONE_69` is **not** a valid ASC slot yet — downscale 1320×2868 captures to 1290×2796. `--replace` deletes existing shots in matching sets first. The `upload_chunk` retries 5× on Apple's intermittent TLS drops (BrokenPipe / SSL bad-record-mac).

## Architecture

### Top-level wiring (`App.tsx`)

```
SafeAreaProvider
  GestureHandlerRootView
    ErrorBoundary
      AuthProvider           // Firebase auth + 3rd-party SDK config
        LangProvider         // i18n; persisted to AsyncStorage key `lang`
          NotifyProvider     // snackbar + Alert.alert wrapper
            <AppInner>
```

`AppInner` blocks on `auth.loading`, then on `!user` (renders `<SignIn>`), then on `!store.loaded` (waits for first hydrate from Firestore/AsyncStorage). Auth must wrap `LangProvider` because `useTodoStore` consumes both `useAuth()` (for the uid → adapter switch) and `useLang()` (for derived strings).

### Persistence: per-uid adapter swap

The single most important pattern in this workspace.

`useTodoStore` picks a `StorageAdapter` based on auth state:

```ts
const uid = user?.uid ?? null;
const adapter = useMemo<StorageAdapter>(
  () => (uid ? makeFirestoreAdapter(db, uid) : localAdapter),
  [uid],   // memoize on uid, NOT on the User object
);
```

**Memoize on `uid`, never on `user`.** Firebase rotates the `User` reference roughly hourly on token refresh. Memoizing on `user` would tear down Firestore listeners and re-fire `migrateLocalToCloud` every refresh.

`migrateLocalToCloud(adapter)` runs once per uid: for each key in `["todos","categories","profile"]`, if cloud is empty, push the local AsyncStorage value up. **Per-key gating** is intentional — checking only `profile` would let stale local todos overwrite cloud todos on a device whose cloud profile happened to be missing.

`useSyncedState(adapter, key, initial, parse, serialize)` handles each entity:

1. Hydrates via `adapter.getItem(key)` → `parse` → `setState`, flips `loaded` true.
2. Subscribes via `adapter.subscribe?.(key, cb)` if available (Firestore adapter supplies `onSnapshot`; local adapter doesn't).
3. **Trailing-debounced writes (~400ms)** — bursts of mutations (typing in a task title) collapse into one `setDoc`. `lastSerializedRef` short-circuits write→subscribe→setState round-trips.

The Firestore adapter writes each entity to `users/{uid}/state/{key}` as `{ value: <json envelope>, updatedAt }`. `value` is the same versioned envelope (`{version, data}`) that AsyncStorage uses, so local and cloud data share one shape.

### Auth (`src/AuthContext.tsx`)

Two social providers (Apple, Google) + email/password, all funnel through `signInWithCredential(auth, …)`. Facebook was removed in v1.0.1 — its native dep (`react-native-fbsdk-next`) is unlinked, so don't reintroduce a Facebook path without re-adding the native module.

- **Apple** — `expo-apple-authentication` + Firebase nonce flow. Generates a raw nonce (`Crypto.randomUUID`), sends SHA-256 hash to Apple, passes the raw nonce alongside the JWT to Firebase. Apple sends `fullName` only on **first** sign-in — seed the profile then or it's lost forever.
- **Google** — `@react-native-google-signin/google-signin` v16. Configure happens in a `useEffect` on mount. **iOS requires both `webClientId` and `iosClientId`** — v16's wrapper does NOT auto-read `GIDClientID` from `Info.plist`; omitting `iosClientId` produces `must specify |clientID| in |GIDConfiguration|`. Don't "simplify" this.
- **Sign-in modes** — `src/features/auth/SignIn.tsx` is a 4-mode state machine: `"social"` (landing — Apple/Google + email-link toggle + create-account toggle) → `"signin"` | `"signup"` | `"reset"`. The email page intentionally has **no** social buttons (one path per page).
- `signOut()` clears `["todos","categories","profile"]` from AsyncStorage so the next signed-in user on this device can't bleed prior-user data into a brand-new Firestore doc via `migrateLocalToCloud`.
- `deleteAccount()` calls `deleteUser`, then clears local data (same as sign-out). The **`onUserDeleted` Cloud Function** (`functions/src/deleteUserData.ts`) recursively erases `users/{uid}` server-side — clients can't delete state docs (`firestore.rules`). Throws `RecentLoginRequiredError` on `auth/requires-recent-login` so UI can prompt re-auth.

### Domain store (`src/useTodoStore.ts`)

**Functional core / imperative shell (`createTodoStore`).** All pure logic lives in `core/` and is reached through one orchestration surface, `core/src/store` → `createTodoStore({ now, genId, t })`:

- `store.actions` — a flat table of **pure** transforms (`(state, …args) => state`) + cross-slice **coordinators** (`deleteCategoryCascade`, `toggleOutcome`, `reconcileTodayPebbles`), assembled by spreading the core transform modules so it auto-syncs as helpers land.
- `store.derive(input)` — platform-agnostic derived state (`deriveState`). **Localized** presentation derived (greeting/mascot/identity lines) stays in this shell, *not* in core, to keep i18n out of `core`.

The composer builds the store once (`useMemo` on `t`) and threads `store.actions` into each slice via deps. The slices (`src/slices/*`) + composer are the **imperative shell**: they own persisted state (`useSyncedState`), reference-stable `useCallback`s, refs, snackbars/`Alert`, and animation timing — none of which can move to `core`. Because `actions` are pure (not state-bound closures) and stable across ordinary renders, the slices destructure them and keep their existing `useCallback` deps, preserving the TaskItem/`React.memo` contract. **Don't import core transforms directly into a slice — pull them from `store.actions`** (exceptions: module-scope migrators used in parsers, plain data/consts, and date utils, which stay direct imports).

Mobile-specific shape:

- Adds a `view: ViewMode` (`category` vs status). `changeView` resets filter (`'all'` for category, `'open'` for status views).
- Returns `headerLine` (greeting from local hour + profile name, or profile.quote override) and `appTitle` (`t.ownerTitle(firstName)` falling back to `profile.name`, then `t.title`).
- `selectedTrashIds: Set<string>` — todo ids are **strings** here (mobile uses `crypto.randomUUID`-style ids generated in `core`'s `newTodo`).

The same TaskItem-stability rules apply: callbacks passed to `TaskItem` (`toggle`, `moveToTrash`, `restoreFromTrash`, `permanentlyDelete`, `updatePriority`, `updateDueDate`, `updateTaskCategory`, `updateText`, `toggleTrashSelection`) are `useCallback`-wrapped with **only setter deps** and use functional `setTodos(prev => …)`. `toggleTrashSelection` uses a `todosRef` so selection bulk ops can read current todos without breaking the stable reference.

### Notifications

Use `useNotify()` for snackbars (Undo on `moveToTrash`). For destructive confirms, use **`Alert.alert(...)` directly** with a `style: "destructive"` button — the store does this in `emptyTrash` and `bulkPermanentDelete`.

### Theming (`src/theme.ts`)

`useTheme()` returns a `ThemeColors` palette (`LIGHT` / `DARK`) keyed off `useColorScheme()`. Components compute `StyleSheet.create` inside `useMemo(() => makeStyles(theme), [theme])` so dark-mode flips don't allocate new stylesheets per render. Match this pattern when adding screens — every component that uses theme colors goes through `makeStyles(c)`.

### Crash + error reporting

The app uses **Firebase Crashlytics** (`@react-native-firebase/crashlytics`) — it shares the `@react-native-firebase` stack we already use for Auth + Firestore, so there's no second native SDK. Crashlytics never receives a user id.

- **Native crashes** are auto-collected by the Crashlytics SDK at app launch — no JS code involved.
- **JS errors** are forwarded by `src/ErrorBoundary.tsx` via `crashlytics().log(componentStack)` + `crashlytics().recordError(error)`. Wrapped in try/catch so a crash in the crash reporter can't take down the app.
- **Unhandled promise rejections** in production ARE forwarded — `installCrashReporters()` (`src/adapters/crashReporting.ts`, called at the top of `App.tsx`) enables `promise/setimmediate/rejection-tracking` and records to Crashlytics. The record is debounced (~2s, cancelled by `onHandled`) so a rejection handled a tick later isn't reported as a crash. That module also installs the single `ErrorUtils.setGlobalHandler` for uncaught JS errors — don't re-add a second one.
- **Activation:** Crashlytics needs to be enabled once in the Firebase Console (Console → Crashlytics → Get started). The SDK starts collecting on first launch after that, regardless of whether this code path has run.

### Native modules & build quirks

- **`plugins/withFmtCxx17.js`** is a config plugin that patches the iOS `Podfile` to force `fmt 11.0.2` to compile with C++17. Without it, Xcode 16's clang rejects `consteval` calls in `format-inl.h` and the build breaks. **Do not remove this** unless RN bumps fmt past the bug. The plugin is idempotent across `expo prebuild --clean`.
- `expo-build-properties` sets `ios.useFrameworks: "static"` (required by `@react-native-firebase/*`).
- `newArchEnabled: false` — sticking with the legacy bridge until the third-party deps catch up.
- `googleServicesFile` points to `./GoogleService-Info.plist` (iOS) and `./google-services.json` (Android). `@react-native-firebase` auto-initializes from these at native launch — `src/firebase.ts` just calls `getApp()`.
- `app.json > ios.config.usesNonExemptEncryption: false` — required for App Store submission to skip the ITSAppUsesNonExemptEncryption prompt.

### Things to know before bigger changes

- Pure domain logic belongs in `core/` with tests in `core/test/` (run from the repo root); mobile tests cover hooks, adapters and parity guards.
- `any` is a lint error; dependency arrays must be complete — when an effect must deliberately ignore a value, mirror it in a ref (see `useSyncedState`'s `initialRef`) rather than disabling the rule.
- The mobile `src/persistence.ts` and `src/categories.ts`/`src/profile.ts`/etc. are thin re-export shims over `core/src/*`. Add new shared logic to core, not here.
- iOS bundle id and Android package: `com.websurfer.mytodo`. EAS project id `c564f1cd-…` lives in `app.json > extra.eas.projectId`.
