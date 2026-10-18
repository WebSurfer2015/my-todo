# Sagely — Workflow & Architecture

Reference doc for collaborators, current as of the v2.0.0 cycle (iOS-first;
the web app was removed 2026-10-18). Deeper notes: root `CLAUDE.md`,
`mobile/CLAUDE.md`. Product direction: `docs/POSITIONING.md`.

## Repo layout

```
my-todo/
├── core/           Pure TypeScript domain (types, derive, persistence port, profile,
│   ├── src/        categories, groceries, i18n, entitlements, store coordinators)
│   └── test/       core's tests — run + coverage-gated from the repo root
├── mobile/         Expo SDK 54 + React Native 0.81 + TS  →  EAS → TestFlight / App Store
│   └── scripts/    ASC release helper, screenshot capture + upload, Play helpers
├── functions/      Firebase Cloud Functions (Node 22)     →  GCP us-central1
│   ├── src/        agentChat, aiInfer, revenuecatWebhook, onUserDeleted, metricsRollup
│   └── test/       Firestore rules tests (emulator)
├── firebase.json   Firebase project config (functions source, rules, emulator)
├── firestore.rules Security rules
├── docs/           This file, PRIVACY.md (GitHub Pages), strategy + release docs
└── package.json    Root = core's test runner + repo gates (lint:arch, typecheck:core)
```

Dependency rule (enforced by `npm run lint:arch`): `mobile/ → core/`, never
the reverse; `core/` imports nothing external; `functions/` deploys standalone
(no imports from `core/` or `mobile/` — it keeps its own copies, guarded by
parity tests in `mobile/src/__tests__`).

---

## Data flow

```
   ┌────────────┐  state  ┌──────────────────┐  read/write  ┌──────────────────┐
   │ React      │────────▶│ useTodoStore +   │─────────────▶│ StorageAdapter   │
   │ Native UI  │         │ slices (mobile)  │              │ Firestore (uid)  │
   └────────────┘         └────────┬─────────┘              │ or AsyncStorage  │
                                   │ pure transforms         └────────┬─────────┘
                                   ▼                                  │
                          ┌──────────────────┐                        ▼
                          │ core/ (derive,   │          Firestore users/{uid}/state/
                          │ createTodoStore) │            todos · categories · profile
                          └──────────────────┘            groceries · groceryGroups
                                                          todoReferences · signals
                                                          (+ server-only: agentUsage,
                                                           mochiUsage, entitlement,
                                                           rcWebhook)
```

- **Per-uid adapter swap**: signed in → `makeFirestoreAdapter(db, uid)`,
  signed out → AsyncStorage. Memoized on `uid` (Firebase rotates the `User`
  object hourly).
- **`useSyncedState(adapter, key, …)`**: hydrate → subscribe (`onSnapshot`) →
  ~400 ms debounced writes; a failed/stalled read never writes defaults back.
- **Every read is validated** (`migrateTodos`, `migrateProfile`, …): storage is
  untrusted, so shapes are checked, capped and defaulted on load.
- **Usage signals** (`core/src/store/usageSignals.ts`): `createdAt`,
  `lastActiveDate`, `activatedAt` in their own `signals` doc — stamped on open,
  every foreground, and first completion; never in the profile.
- Clients can't delete state docs (rules); account erasure is server-side.

---

## Backend (Cloud Functions, us-central1)

| Function | Trigger | Does |
|---|---|---|
| `agentChat` | callable | Multi-turn Mochi (Haiku + tool_use). Proposes operations; the client applies them after confirm. History windowed to 40 turns starting on a user turn. |
| `aiInfer` | callable | One-shot modes: `suggest-todo-fields`, `classify-grocery-dept`, `breakdown-subtasks`, `link-store-to-items`. |
| `revenuecatWebhook` | HTTPS | RevenueCat → `state/entitlement` (the client never writes it). Ignores events for deleted users. |
| `onUserDeleted` | auth delete (gen-1) | Recursively erases `users/{uid}`; retries on failure. |
| `metricsRollup` | daily 06:15 UTC | Aggregate counts → `metrics/{yesterday}` (no uids). |

**AI cost / safety knobs**: validate input before reserving quota; a flat
150/day per-uid fair-use cap shared by both AI functions
(`MOCHI_TIER_ENFORCEMENT` is OFF until IAP is live — then per-tier invisible
ceilings); per-mode `max_tokens` with a cost-guard test; prompt caching on large
system prompts; user text stripped of our envelope tags before wrapping;
max-instance caps (5 / 5 / 3 / 1 / 3, min 0). Over the ceiling the server
returns `RESOURCE_EXHAUSTED` and the client falls back to manual Compose — no
wall, no meter, no paywall.

---

## Reminders

Local notifications only (no server push, no push token). `Todo.reminders[]`;
the scheduler diffs the desired fires against `getAllScheduledAsync`, cancels
mismatches and schedules new ones (`todo:<id>:<n>` ids, capped per todo so one
series can't starve iOS's ~64-notification budget). Done / trashed → cancelled
by the diff.

---

## Deploy workflow — dev first, then main

```
   working tree ──commit──▶ dev ──push──▶ CI (core · mobile · functions · rules)
                                │
                                │  verify on a dev-client build / TestFlight
                                │  (functions + rules: `firebase deploy` from repo root)
                                ▼
                     git checkout main && git merge --ff-only dev && git push
                                │
                                ▼
                     main ──▶ GitHub Pages republishes docs/ (privacy policy)
```

Every change lands on `dev` first; `main` only after the owner verifies.
`--ff-only` so parallel work on main fails loudly. There is no web staging
environment.

---

## Mobile build + App Store submit

```
  bump mobile/app.json version (EAS autoIncrement owns buildNumber)
           │
           ▼
  eas build --platform ios --profile production --auto-submit
           │   (EAS cloud build ~10–20 min; requireCommit, appVersionSource: remote)
           ▼
  auto-submit to App Store Connect via the API key (AuthKey_QD85…p8)
           │   build processed by Apple (~5–10 min)
           ▼
  python mobile/scripts/asc/asc_release.py prepare      (links build, copy, privacy URL, What's New)
  python mobile/scripts/asc_upload_screenshots.py <dir> (10 slots × locales)
           │
           ▼
  "Submit for Review" in App Store Connect  →  review (~24–72 h)  →  live
```

Screenshots: `mobile/screenshots/<device>/raw` → `process.py` → `processed/`.
iPhone captures are downscaled to 1290×2796 (the 6.7" slot), iPad to 2048×2732.

---

## Cross-cutting

- **Auth** (`mobile/src/app/AuthContext.tsx`): Apple / Google / email → all via
  `signInWithCredential`. Apple sends `fullName` only on first sign-in — the
  profile is seeded then. Sign-out and account deletion both clear local data.
- **Profile** (`core/src/data/profile.ts`): one synced doc per user — avatar,
  themes, flags, grocery stores, pinned filters, lifetime count.
- **Localization** (`core/src/data/i18n.ts`): 6 languages; TS enforces that every
  locale has every key.
- **Crash reporting**: Firebase Crashlytics (no user id attached).
- **Privacy**: no analytics or ad SDKs (guarded by
  `mobile/src/__tests__/privacy-guard.test.ts`); policy `docs/PRIVACY.md`,
  App Store label answers `docs/APP-PRIVACY-LABEL.md`.
- **Calm-app stance** (`docs/POSITIONING.md`): no streaks or scoreboards, AI
  never auto-mutates without confirm, destructive actions reversible or
  confirmed, no exclamation marks in mascot copy (`mascotLines.test.ts`).
