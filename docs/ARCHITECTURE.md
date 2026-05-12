# Architecture & Workflow

Diagrams describing the cross-platform topology of `my-todo` and the runtime data flow for auth + sync. Mermaid renders inline on GitHub. A FigJam mirror lives at the link in the [FigJam mirror](#figjam-mirror) section at the bottom (kept loosely in sync — Mermaid here is the source of truth).

## 1. System architecture

How the three packages, Firebase, hosting, and the app-store pipelines fit together. The dashed boundary is the runtime adapter swap: `useTodoStore` picks `localStorage` / `AsyncStorage` when signed out, and `Firestore` once a `uid` is available.

```mermaid
flowchart LR
  subgraph CORE["core/ (pure TypeScript)"]
    direction TB
    types["types.ts<br/>derive.ts<br/>groups.ts<br/>persistence.ts<br/>profile.ts<br/>categories.ts<br/>i18n.ts<br/>selection.ts"]
    adapter_iface(["StorageAdapter interface<br/>getItem · setItem · removeItem · subscribe?"])
  end

  subgraph WEB["web/ (Vite + React 18)"]
    direction TB
    web_store["useTodoStore"]
    web_synced["useSyncedState<br/>~400ms debounced writes"]
    web_auth["AuthContext<br/>(Firebase Web SDK)"]
    web_local["localStorage adapter<br/>(signed-out path)"]
    web_fs["Firestore adapter<br/>(signed-in path)"]
    web_sentry["Sentry<br/>(opt-in via VITE_SENTRY_DSN)"]
  end

  subgraph MOBILE["mobile/ (Expo SDK 54 + RN 0.81)"]
    direction TB
    mob_store["useTodoStore"]
    mob_synced["useSyncedState<br/>~400ms debounced writes"]
    mob_auth["AuthContext<br/>(@react-native-firebase/*)<br/>+ Google/Apple/Facebook native SDKs"]
    mob_local["AsyncStorage adapter<br/>(signed-out path)"]
    mob_fs["Firestore adapter<br/>(signed-in path)"]
    mob_crash["Crashlytics"]
  end

  subgraph FIREBASE["Firebase project: my-todos-1b079"]
    direction TB
    fb_auth["Firebase Auth<br/>Google · Apple · Facebook · Email/Password"]
    fb_fs["Firestore<br/>users/{uid}/state/{key}<br/>key in (todos, categories, profile)"]
    fb_rules["firestore.rules<br/>request.auth.uid == uid"]
    fb_cache["IndexedDB persistent cache<br/>+ multi-tab manager (web only)"]
  end

  subgraph DEPLOY["Deploy & distribution"]
    direction TB
    amplify["AWS Amplify Hosting<br/>auto-deploy on push to main"]
    eas["EAS Build<br/>production · auto-increment"]
    asc["App Store Connect<br/>(TestFlight + App Store)"]
    play["Google Play Console<br/>(paused — verification block)"]
    asc_script["scripts/asc_upload_screenshots.py<br/>JWT ES256 + chunked upload + retry"]
  end

  WEB -->|"relative imports"| CORE
  MOBILE -->|"relative imports"| CORE
  web_local -. implements .-> adapter_iface
  web_fs -. implements .-> adapter_iface
  mob_local -. implements .-> adapter_iface
  mob_fs -. implements .-> adapter_iface

  web_store --> web_synced
  web_synced -->|"adapter chosen by uid"| web_local
  web_synced -->|"adapter chosen by uid"| web_fs
  web_store --> web_auth

  mob_store --> mob_synced
  mob_synced -->|"adapter chosen by uid"| mob_local
  mob_synced -->|"adapter chosen by uid"| mob_fs
  mob_store --> mob_auth

  web_auth --> fb_auth
  mob_auth --> fb_auth
  web_fs --> fb_fs
  mob_fs --> fb_fs
  web_fs -. cached via .-> fb_cache
  fb_rules -. enforces .-> fb_fs

  WEB -->|"git push main"| amplify
  MOBILE -->|"eas build --auto-submit"| eas
  eas --> asc
  eas -. parked .-> play
  asc_script --> asc

  web_store -. captures .-> web_sentry
  mob_auth -. captures .-> mob_crash
```

### Notes on the architecture

- **`core/` is pure TS.** No React, no platform deps. Both apps import via relative paths (`'../../core/src/...'`). No path aliases, no monorepo tooling.
- **The adapter swap is the linchpin.** `useTodoStore` memoizes `adapter` on `uid` (NOT on the `User` reference — Firebase rotates it ~hourly on token refresh).
- **Per-key gated migration.** On first sign-in, `migrateLocalToCloud(adapter)` walks `["todos","categories","profile"]` and pushes each local value up only if the cloud value is missing. Per-key gating prevents stale local todos from clobbering cloud todos when a cloud-side profile happens to be absent.
- **Web persistent cache.** `initializeFirestore` is configured with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` — repeat loads paint instantly from IndexedDB; two open tabs share the same cache.
- **Security.** `firestore.rules` allows read/write on `users/{uid}/state/{key}` only when `request.auth.uid == uid`. Default-deny everywhere else (including the root `users` collection — listing it would otherwise leak the uid set). Verified by `web/tests/firestore-rules.test.ts` under the emulator.
- **Hosting.** AWS Amplify is the prod surface (`main.dhcuxhzauzw4c.amplifyapp.com`); Firebase Hosting is configured as a fallback target but isn't the canonical deploy.
- **iOS pipeline shipped.** Build 16 / v1.0 in App Store. Android pipeline is wired but Play Store submission is parked on Google's developer-account verification (real Android device required).

## 2. Auth + sync workflow

Two sequences. The first covers sign-in and the adapter swap; the second covers a mutation propagating from one tab to another (or web ↔ mobile).

### 2a. Sign-in → adapter swap → first-time migration

```mermaid
sequenceDiagram
  participant U as User
  participant App as App.tsx
  participant Auth as AuthContext
  participant FB as Firebase Auth
  participant Store as useTodoStore
  participant LS as localStorage adapter
  participant FS as Firestore adapter
  participant Cloud as Firestore

  U->>App: visit
  App->>Auth: useAuth()
  Auth->>FB: onAuthStateChanged
  FB-->>Auth: user = null, loading false
  App->>U: render <SignIn />

  U->>Auth: signInWithGoogle()
  Auth->>FB: signInWithPopup(GoogleAuthProvider)
  alt popup blocked / Safari ITP
    FB-->>Auth: auth/popup-blocked
    Auth->>FB: signInWithRedirect()
    FB-->>U: redirect, then return
    Auth->>FB: getRedirectResult()
  end
  FB-->>Auth: UserCredential (uid)
  Auth->>Cloud: getDoc(users/{uid}/state/profile)
  alt profile doc missing
    Auth->>Cloud: setDoc(profile derived from displayName)
  end

  Auth-->>Store: user.uid changes (memo dep)
  Store->>FS: makeFirestoreAdapter(db, uid)
  Store->>FS: migrateLocalToCloud(adapter)
  loop key in [todos, categories, profile]
    FS->>Cloud: getItem(key)
    alt cloud value missing
      FS->>LS: localStorage.getItem(key)
      FS->>Cloud: setItem(key, localValue)
    end
  end

  Store->>FS: getItem(todos), getItem(categories), getItem(profile)
  FS->>Cloud: read 3 docs
  Cloud-->>FS: versioned envelopes
  FS-->>Store: parsed Todo[], CategoryDef[], Profile
  Store-->>App: loaded = true
  App->>U: render todos
```

### 2b. Mutation → debounced write → cross-device fan-out

```mermaid
sequenceDiagram
  participant U as User on Tab A
  participant TA as TaskItem (A)
  participant SA as useTodoStore (A)
  participant SyncA as useSyncedState (A)
  participant FSA as Firestore adapter (A)
  participant Cloud as Firestore
  participant FSB as Firestore adapter (B)
  participant SyncB as useSyncedState (B / mobile)
  participant SB as useTodoStore (B)
  participant TB as UI (B)

  U->>TA: type into todo title
  TA->>SA: updateText(id, text)
  SA->>SA: setTodos(prev => todoSet(prev, id, "text", text))
  SA->>SyncA: state changed
  SyncA->>SyncA: trailing-debounce 400ms<br/>(coalesce burst of keystrokes)
  SyncA->>FSA: setItem("todos", json envelope)
  FSA->>Cloud: setDoc(users/{uid}/state/todos)
  Cloud-->>FSB: onSnapshot fires
  FSB-->>SyncB: callback(value)
  SyncB->>SyncB: skip if value === lastSerializedRef
  SyncB->>SyncB: setState(parse(value))
  SyncB-->>SB: todos updated
  SB-->>TB: derived state recomputed, re-render
```

### Workflow notes

- **Debounce.** A burst of mutations (typing in a title) collapses into one `setDoc`. Without it every keystroke would be a write.
- **Round-trip guard.** `lastSerializedRef` in `useSyncedState` short-circuits the write→`onSnapshot`→`setState` round-trip — otherwise the writing tab would re-render itself from its own write.
- **Auth boundaries.** Apple sends `fullName` only on the **first** sign-in. The web flow handles this in `seedProfileIfMissing` (popup path inline, redirect path via `getRedirectResult`); mobile handles it in `signInWithApple` directly using `credential.fullName`.
- **Sign-out.** Clears `["todos","categories","profile"]` from local storage (web `localStorage`, mobile `AsyncStorage`) so the next user signing in on the same device can't bleed prior-user data into a fresh Firestore via `migrateLocalToCloud`.
- **Delete account.** Deletes the three Firestore state docs first (security rules block writes once auth is gone), then `deleteUser`. Throws `RecentLoginRequiredError` on `auth/requires-recent-login` so the UI can prompt re-auth.

## FigJam mirror

FigJam versions of these diagrams are published below — useful for stakeholder review or quick visual exploration. The Mermaid above is the source of truth; if the two diverge, trust the Mermaid and regenerate.

- [System architecture](https://www.figma.com/board/3i7eiMCySzF6tBIwa6s3bS) — mirrors §1
- [Sign-in workflow](https://www.figma.com/board/7swkuCLxDDWXWafwVvwvNB) — mirrors §2a
- [Sync workflow](https://www.figma.com/board/6SvvLRrqoPBcKc0A9RaByH) — mirrors §2b
