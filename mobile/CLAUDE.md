# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the **mobile** workspace of `my-todo` — Expo SDK 54 + React Native 0.81 + TypeScript. The web sibling lives at `../web/` and shares pure logic via `../core/` (see `../web/CLAUDE.md` for the cross-platform `core/` architecture; this file covers mobile-only concerns).

## Commands

- `npm run ios` / `npm run android` — `expo run:ios` / `expo run:android`. Builds the dev client and launches on a sim/device. **Use the dev client, not Expo Go** — the project depends on native modules (Firebase, Google Sign-In, Apple Auth, FB SDK) that Expo Go does not bundle. `expo-dev-client` is in deps so EAS won't print the "uses Expo Go" warning.
- `npm start` — starts the Metro bundler only (use after a dev client is already installed).
- `npm run typecheck` — `tsc --noEmit`. Strict mode is on via `expo/tsconfig.base` + `"strict": true`.
- `npm run lint` — flat-config ESLint (`eslint.config.js`). `react-hooks` rules + `@typescript-eslint`.
- No test runner. There is no `jest` config; tests live in `core/` (run from there with `npx vitest`) or `web/`.

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

The Firestore adapter writes each entity to `users/{uid}/state/{key}` as `{ value: <json envelope>, updatedAt }`. `value` is the same versioned envelope (`{version, data}`) that AsyncStorage / web localStorage use, so the cross-device data shape is byte-identical.

### Auth (`src/AuthContext.tsx`)

Three social providers + email/password, all funnel through `signInWithCredential(auth, …)`.

- **Apple** — `expo-apple-authentication` + Firebase nonce flow. Generates a raw nonce (`Crypto.randomUUID`), sends SHA-256 hash to Apple, passes the raw nonce alongside the JWT to Firebase. Apple sends `fullName` only on **first** sign-in — seed the profile then or it's lost forever.
- **Google** — `@react-native-google-signin/google-signin` v16. Configure happens in a `useEffect` on mount. **iOS requires both `webClientId` and `iosClientId`** — v16's wrapper does NOT auto-read `GIDClientID` from `Info.plist`; omitting `iosClientId` produces `must specify |clientID| in |GIDConfiguration|`. Don't "simplify" this.
- **Facebook** — `react-native-fbsdk-next` `LoginManager.logInWithPermissions`, fetches profile via `FBProfile.getCurrentProfile()` for first/last name seeding.
- `signOut()` clears `["todos","categories","profile"]` from AsyncStorage so the next signed-in user on this device can't bleed prior-user data into a brand-new Firestore doc via `migrateLocalToCloud`.
- `deleteAccount()` deletes Firestore docs first (security rules block writes once auth is gone), then `deleteUser`. Throws `RecentLoginRequiredError` on `auth/requires-recent-login` so UI can prompt re-auth.

### Domain store (`src/useTodoStore.ts`)

Mostly mirrors web's store (see web/CLAUDE.md), with mobile-specific shape:

- Adds a `view: ViewMode` (`category` vs status). `changeView` resets filter (`'all'` for category, `'open'` for status views).
- Returns `headerLine` (greeting from local hour + profile name, or profile.quote override) and `appTitle` (`t.ownerTitle(firstName)` falling back to `profile.name`, then `t.title`).
- `selectedTrashIds: Set<string>` — todo ids are **strings** here (mobile uses `crypto.randomUUID`-style ids generated in `core`'s `newTodo`).

The same TaskItem-stability rules apply: callbacks passed to `TaskItem` (`toggle`, `moveToTrash`, `restoreFromTrash`, `permanentlyDelete`, `updatePriority`, `updateDueDate`, `updateTaskCategory`, `updateText`, `toggleTrashSelection`) are `useCallback`-wrapped with **only setter deps** and use functional `setTodos(prev => …)`. `toggleTrashSelection` uses a `todosRef` so selection bulk ops can read current todos without breaking the stable reference.

### Notifications

Use `useNotify()` for snackbars (Undo on `moveToTrash`). For destructive confirms, use **`Alert.alert(...)` directly** with a `style: "destructive"` button — the store does this in `emptyTrash` and `bulkPermanentDelete`. Don't reach for the web's `confirm()` API; it doesn't exist here.

### Theming (`src/theme.ts`)

`useTheme()` returns a `ThemeColors` palette (`LIGHT` / `DARK`) keyed off `useColorScheme()`. Components compute `StyleSheet.create` inside `useMemo(() => makeStyles(theme), [theme])` so dark-mode flips don't allocate new stylesheets per render. Match this pattern when adding screens — every component that uses theme colors goes through `makeStyles(c)`.

### Native modules & build quirks

- **`plugins/withFmtCxx17.js`** is a config plugin that patches the iOS `Podfile` to force `fmt 11.0.2` to compile with C++17. Without it, Xcode 16's clang rejects `consteval` calls in `format-inl.h` and the build breaks. **Do not remove this** unless RN bumps fmt past the bug. The plugin is idempotent across `expo prebuild --clean`.
- `expo-build-properties` sets `ios.useFrameworks: "static"` (required by `@react-native-firebase/*`).
- `newArchEnabled: false` — sticking with the legacy bridge until the third-party deps catch up.
- `googleServicesFile` points to `./GoogleService-Info.plist` (iOS) and `./google-services.json` (Android). `@react-native-firebase` auto-initializes from these at native launch — `src/firebase.ts` just calls `getApp()`.
- `app.json > ios.config.usesNonExemptEncryption: false` — required for App Store submission to skip the ITSAppUsesNonExemptEncryption prompt.

### Things to know before bigger changes

- Tests run from `core/` or `web/`, never here. Pure-logic regressions belong in core's vitest suite.
- ESLint warns on `@typescript-eslint/no-explicit-any` but doesn't fail. CI signal is `tsc --noEmit`.
- The mobile `src/persistence.ts` and `src/categories.ts`/`src/profile.ts`/etc. are thin re-export shims over `core/src/*`. Add new shared logic to core, not here.
- iOS bundle id and Android package: `com.websurfer.mytodo`. EAS project id `c564f1cd-…` lives in `app.json > extra.eas.projectId`.
