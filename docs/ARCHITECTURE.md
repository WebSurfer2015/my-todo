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
   └────────────┘         └────────┬─────────┘              │ or inert (signed │
                                   │                        │ out)             │
                                   │ pure transforms        └────────┬─────────┘
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
  signed out → an inert adapter (`SIGNED_OUT_ADAPTER` in `useTodoStore`:
  reads nothing, writes nothing — sign-in is mandatory, so there is no
  local-only mode). Memoized on `uid` (Firebase rotates the `User` object
  hourly).
- **`useSyncedState(adapter, key, …)`**: hydrate → subscribe (`onSnapshot`) →
  ~400 ms debounced writes; a failed/stalled read never writes defaults back.
- **Todos merge, never replace** (`core/src/store/mergeTodos.ts`): the todos
  slice passes a 3-way merge (by id / `updatedAt`, collapsing duplicate series
  occurrences on the same day), so a remote snapshot or a late first read
  can't clobber pending local edits.
- **Automatic writes wait for `serverConfirmed`**: `useSyncedState` also
  reports whether the latest snapshot came from the server; writes the app
  makes on its own (the daily series top-up) wait on it, so a stale local
  cache can't overwrite another device's newer doc.
- **Every read is validated** (`migrateTodos`, `migrateProfile`, …): storage is
  untrusted, so shapes are checked, capped and defaulted on load.
- **Usage signals** (`core/src/store/usageSignals.ts`): `createdAt`,
  `lastActiveDate`, `activatedAt` in their own `signals` doc — stamped on open,
  every foreground, and first completion; never in the profile.
- Clients can't delete state docs (rules); account erasure is server-side.
- **Tested UI rules live in core too**: display labels shared by the sheets
  (`core/src/logic/labels.ts`) and Home's Today rules
  (`core/src/logic/homeDashboard.ts`); mobile renders their output.
- **Sheets**: app-level sheets (compose, to-do details, Ask Mochi, …) are hosted
  once in `mobile/src/app/SheetContext.tsx`; a row tap opens details through
  `TaskDetailsOpenContext`, routed by `useDetailsRouter` (iOS can't stack
  Modals: a reminder tap while anything is presented is parked and offered as
  a "Reminder: … · Open" snackbar once the screen is clear — it re-checks when
  it would show and expires after 3 min; the user's own row tap retries
  briefly instead). Ask Mochi applies through `useMochiExecutor` + `mochiUndo`
  (only the newest applied turn's inline Undo is live). Completions/trash and
  "Edit series" commits go through `applyTracked` so each has an exact Undo
  (`todosRevertChanges`); an inline Undo retracts its own snackbar. An Undo
  can be **partial** — rows edited since are kept and the rest is put back,
  shown as "Undone — later changes were kept." in the snackbar or inline in
  the chat (threaded through `combineUndos` → `undoResult` →
  `useInlineUndo`; an Undo with nothing left to put back reads "Nothing to
  undo").

---

## Backend (Cloud Functions, us-central1)

| Function | Trigger | Does |
|---|---|---|
| `agentChat` | callable | Multi-turn Mochi (Haiku + tool_use). Proposes operations (the `ProposedOperation` union lives in `core/src/ports/aiContracts.ts`, parity-tested against the functions copy); the client turns them into store calls with the pure planner `core/src/logic/mochiOps.ts` (`mobile/src/app/useMochiExecutor.ts`, silent store calls — no root snackbar). A single `createTodo` / `addGroceryItem` applies optimistically (no Confirm) with an inline Undo; everything else applies after Confirm, with inline Undo. Only the newest applied turn keeps a live Undo (`mobile/src/app/mochiUndo.ts`; a turn that applied nothing — cancelled confirm, empty plan — retires nothing). History windowed to 40 turns starting on a user turn; a conversation start mints a server `convId` (recorded with its mint time in `users/{uid}/state/agentUsage` `convs`, a list of up to 120 records that expire 24h after last use, least-recently-used evicted, updated in the reservation transaction) and each reply carries an opaque `sig` = `convId.iat.hmac` over `uid | convId | iat | sha256(preceding user turn) | final reply text` that the client echoes back byte-for-byte (display tweaks live in a separate field). A follow-up is free only if the newest assistant sig verifies, the newest reply's convId is recorded, has had fewer than 30 follow-ups, and the newest reply was signed < 60 min ago (older replies aren't re-checked); anything else (fabricated, cross-user, stale or prefix-replayed history) is a new conversation. A start re-sent with identical history within 2 min reuses its convId (timeout retry, no second slot). Chat-only ceilings return RESOURCE_EXHAUSTED with `details.reason` `'turns'` (daily turn backstop) or `'tier'` (tier conversation ceiling), which pause only the chat. Context is budgeted (≤5 steps per to-do, ~20k chars). The fair-use slot is refunded if the model call fails. |
| `aiInfer` | callable | One-shot modes: `suggest-todo-fields`, `classify-grocery-dept`, `breakdown-subtasks`, `link-store-to-items`. |
| `revenuecatWebhook` | HTTPS | RevenueCat → `state/entitlement` (the client never writes it). Ignores events for deleted users. |
| `onUserDeleted` | auth delete (gen-1) | Recursively erases `users/{uid}`; retries on failure. |
| `metricsRollup` | daily 06:15 UTC | Aggregate counts → `metrics/{yesterday}` (no uids). Same pass prunes Mochi conversation records idle ≥24h from each user's `agentUsage` (conditional on update time, so a live write is never clobbered). |

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
mismatches and schedules new ones (`todo:<todoId>:<reminderId>:<fireIndex>`
ids, capped at 30 fires per todo so one series can't starve iOS's
~64-notification budget). Done / trashed → cancelled
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
  profile is seeded then. User data lives only in Firestore under
  `users/{uid}` (no device-local copy of to-dos; AsyncStorage holds the
  language setting plus a transient Apple first-sign-in name stash). Sign-out signs out of Firebase and the store's adapter
  swaps to the inert one, so nothing of the previous user renders. Account
  deletion is server-side: `deleteUser` triggers the `onUserDeleted` Cloud
  Function, which recursively erases `users/{uid}` (clients can't delete
  state docs under `firestore.rules`).
- **Profile** (`core/src/data/profile.ts`): one synced doc per user — avatar,
  themes, flags, grocery stores, pinned filters, lifetime count.
- **Localization** (`core/src/data/i18n.ts`): 6 locales (TS enforces that every
  locale has every key), but v2.0.0 ships **English-only** — the language
  picker is off (`LANGUAGE_PICKER_ENABLED` in `mobile/src/app/featureFlags.ts`).
  v2.0.0 is also **free-only** (`IAP_ENABLED` off: RevenueCat never initialized).
- **Crash reporting**: Firebase Crashlytics (no user id attached).
- **Privacy**: no analytics or ad SDKs (guarded by
  `mobile/src/__tests__/privacy-guard.test.ts`); policy `docs/PRIVACY.md`,
  App Store label answers `docs/APP-PRIVACY-LABEL.md`.
- **Calm-app stance** (`docs/POSITIONING.md`): no streaks or scoreboards, AI
  changes are confirmed, or (single capture) applied with a one-tap Undo,
  destructive actions reversible or confirmed, no exclamation marks in mascot copy (`mascotLines.test.ts`).
