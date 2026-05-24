# Sagely — Workflow & Architecture

Reference doc for collaborators. Captures the system at **v1.4.0**.
For deeper per-package notes, see `web/CLAUDE.md`, `mobile/CLAUDE.md`,
and `docs/POSITIONING.md`.

## Repo layout

```
my-todo/
├── core/                Pure TypeScript: types, derive, persistence, profile, categories, i18n, selection
├── web/                 Vite + React 18 + TypeScript    →  AWS Amplify (main branch)
│   └── functions/       Firebase Cloud Functions        →  Production GCP
├── mobile/              Expo SDK 54 + RN 0.81 + TS      →  EAS → App Store / TestFlight
│   └── scripts/
│       ├── asc/         ASC release helper (Python)
│       ├── screenshots/ capture.sh + process.py
│       └── asc_upload_screenshots.py
└── docs/                ARCHITECTURE.md, POSITIONING.md, PRIVACY.md, etc.
```

`core/` is the bedrock — pure TypeScript, no React, no platform. Both
web and mobile import via relative paths (`'../../core/src/types'`).
All shared logic (data model, derive helpers, migrators, i18n) lives
there.

---

## Data flow

```
   ┌──────────┐         ┌──────────────────┐         ┌──────────────┐
   │  React   │  state  │  useTodoStore    │  CRUD   │  Storage     │
   │  (web /  │────────▶│  (per-platform   │────────▶│  adapter     │
   │  mobile) │         │   thin wrapper)  │         │  (Firestore  │
   └──────────┘         └──────────────────┘         │   or local)  │
                              │                     └──────┬───────┘
                              │ derives via                │
                              ▼                            │
                     ┌─────────────────┐                   │
                     │  core/derive.ts │                   │
                     │  (pure funcs)   │                   │
                     └─────────────────┘                   │
                                                          ▼
                                              ┌─────────────────────────┐
                                              │  Firestore              │
                                              │  users/{uid}/state/...  │
                                              │   ├ todos               │
                                              │   ├ categories          │
                                              │   ├ profile             │
                                              │   ├ groceries           │
                                              │   ├ groceryGroups       │
                                              │   ├ todoReferences      │
                                              │   ├ agentUsage          │
                                              │   └ devices/{id} (push) │
                                              └─────────────────────────┘
```

- **Per-uid adapter swap**: signed-in → `makeFirestoreAdapter(db, uid)`,
  signed-out → local storage. Memoized on `uid` (not on the `User`
  object — Firebase rotates that hourly).
- **`useSyncedState(adapter, key, …)`**: trailing-debounced writes
  (~400ms), live `onSnapshot` subscribe for cross-device sync,
  short-circuit on write→subscribe round-trips.
- **Migration**: every read passes through `migrateTodos` /
  `migrateProfile` etc. so schema changes are forward-compatible.
- **Two stability rules** for `TaskItem` (React.memo): callbacks come
  from `useCallback` with setter-only deps; refs (`todosRef`,
  `lastSelectedRef`) carry latest state into stable closures.

---

## AI surface (Phase 2 + 3)

```
                 mobile/web client                       Cloud Function                Anthropic
                  ┌───────────────┐                     ┌───────────────┐            ┌─────────┐
   user types ──▶ │ debounced     │  POST /aiInfer  ──▶ │  aiInfer      │ ── HTTP ──▶│ Claude  │
                  │ signal-gated  │  {mode, input}      │  - validate   │            │ Haiku / │
                  │ AI hook       │                     │  - reserve    │            │ Sonnet  │
                  └──────┬────────┘                     │    quota      │            └─────────┘
                         │                              │  - call model │
                         │ pills above form             │  - parse JSON │
                         ▼                              │  - post-proc  │
                  ┌──────────────┐                      └───────────────┘
                  │ tap-to-apply │                              │
                  │ NEVER auto   │                              │ shared 30/day
                  └──────────────┘                              ▼
                                                      Firestore agentUsage
```

**Modes** (`web/functions/src/aiInfer.ts`):
- `suggest-todo-fields` — Haiku, ambient, prompt-cached. Returns
  category / priority / dueDate (with optional time) / recurrence /
  reminder.
- `classify-grocery-dept` — Haiku, returns dept id OR new label +
  optional store hint.
- `breakdown-subtasks` — Sonnet, returns 3–6 concrete substeps.

**Discipline knobs**:
- 1500ms debounce, 8-char minimum, signal-pattern fast-path
- Per-uid 30-call/day cap shared across all modes (`quota.ts`)
- Prompt caching (`cacheableSystemModes`) — ~90% discount on system
  prompt for back-to-back calls
- Categories list capped at 10 sent to model
- All errors silent-fail in client wrapper (`suggestTodoFields`
  returns nulls)

---

## Reminders (Phase 3)

Local-only. `Todo.reminder: { at, intervalMinutes?, until? }`.

```
   user sets reminder ──▶ store mutation ──▶ Firestore sync
                                                   │
                                                   ▼
                                       App.tsx useEffect(todos)
                                                   │
                                                   ▼
                                   syncTodoReminders(todos):
                                     for each todo with reminder:
                                       compute fire schedule
                                         (at, at+interval, … until)
                                       cap MAX_FIRES_PER_TODO = 30
                                       diff vs Notifications.getAllScheduledAsync
                                         cancel mismatches
                                         schedule new fires
                                            id = `todo:<id>:<fireIndex>`
                                                   │
                                                   ▼
                                            iOS local notification
                                              fires at scheduled time
```

Done/trash → reminders auto-cancel via the diff. Recurrence advance
rolls reminder forward by the dueDate delta. iOS budget is ~64
scheduled notifications app-wide; the per-todo cap of 30 keeps a
single noisy series from starving the rest.

---

## Deploy workflow — dev first, then main

```
   working tree
        │
        │  git commit
        ▼
   dev branch ──── push origin dev ──── Amplify deploys to dev.dhcuxhzauzw4c.amplifyapp.com
        │                                  +  Cloud Functions deployed manually if changed
        │
        │  (user verifies on dev)
        │
        │  git checkout main && git merge --ff-only dev && git push
        ▼
   main branch ─── push origin main ──── Amplify deploys to main.dhcuxhzauzw4c.amplifyapp.com
                                            +  production traffic + custom domain
```

**Hard rule (CLAUDE.md)**: every change — code, docs, scripts,
lockfiles — lands on `dev` first. `main` is only updated after the
user verifies on the dev Amplify URL. Use `--ff-only` so a
non-fast-forward (parallel main work) fails loudly.

---

## Mobile build + App Store submit

```
  ┌─────────────────┐
  │ bump version    │  mobile/app.json → 1.4.0 → 1.4.1 …
  └────────┬────────┘  (autoIncrement handles buildNumber)
           │
           ▼
  ┌─────────────────────────────────────────────────────┐
  │  eas build --platform ios --profile production      │
  │            --auto-submit                            │
  └─────────────────────────────┬───────────────────────┘
                                │
                ┌───────────────┴───────────────────┐
                ▼                                   ▼
        ┌──────────────────┐               ┌──────────────────┐
        │ EAS cloud build  │               │ Anchored to git  │
        │  (~10–20 min)    │               │ requireCommit:t  │
        │  creates IPA     │               │ appVersionSource:│
        └────────┬─────────┘               │   remote         │
                 │                         └──────────────────┘
                 ▼
        ┌──────────────────┐
        │ Auto-submit to   │
        │ ASC via API key  │
        │ AuthKey_QD85…p8  │
        └────────┬─────────┘
                 │
                 ▼  build #N processed by Apple (~5–10 min)
                 │
   ┌─────────────┴─────────────────────────────────────┐
   ▼                                                   ▼
┌───────────────────────────┐               ┌────────────────────────┐
│ python asc_release.py     │               │ python                 │
│   create-version --version│               │ asc_upload_screenshots │
│                           │               │   <processed dir>      │
│   prepare                 │               │   --replace            │
│   (links build + pushes   │               │ (10 slots × 7 locales) │
│    copy + privacy + What's│               └────────────────────────┘
│    New across 7 locales)  │
└─────────────┬─────────────┘
              │
              ▼
   click "Submit for Review" in ASC web UI
              │
              ▼   Apple review (~24–72h)
              │
              ▼
        live on App Store
```

**Screenshots pipeline**:

```
mobile/screenshots/<device>/raw/N-<name>.png     ←  capture.sh N <device> <udid>
                          ↓ process.py
mobile/screenshots/<device>/processed/...         →  asc_upload_screenshots.py
```

- iPhone 17 Pro Max → 1320×2868 → downscaled to 1290×2796 (ASC 6.7" slot)
- iPad Pro 13" → 2064×2752 → downscaled to 2048×2732 (ASC 12.9" slot)
- 10 slots per device; v1.4 slot plan in `docs/POSITIONING.md`
- `APP_STORE_VERSION_ID` in `mobile/scripts/asc_upload_screenshots.py`
  must be re-pointed per release (look it up via
  `asc_release.py status`)

---

## Cross-cutting

- **Auth** (`AuthContext.tsx`): Apple / Google / email-password → all
  funnel through `signInWithCredential`. Apple sends `fullName` only
  on first sign-in — seed profile then.
- **Profile** (`core/profile.ts`): one synced doc per user. Holds
  avatar, density, background, reminders + agent + onboarding +
  guides flags, grocery store list, pebble counters.
- **Localization** (`core/i18n.ts`): 6 langs (en, zh, es, fr, ja, de).
  All user-facing text routes through `useLang().t`. Adding copy =
  add 6 entries, TS enforces shape.
- **Crash reporting**: Crashlytics on mobile (`ErrorBoundary` +
  `crashlytics().recordError`), Sentry on web (gated on
  `VITE_SENTRY_DSN`).
- **Hosting split**: Amplify for web (`amplify.yml` at repo root,
  `appRoot: web`), Firebase Hosting as fallback, GCP for Cloud
  Functions, EAS for native binaries.
- **In-app guides** (`mobile/src/guides.tsx` +
  `components/Guide*.tsx`): 6 topical walkthroughs with per-slide
  mockups built from `GuideMockups.tsx` primitives. First-run prompt
  fires once after onboarding (including for upgraders whose profile
  predates `guidesPromptShown`); always reachable from
  Settings → Tips & guides.
- **Calm-app stance** (`docs/POSITIONING.md`): no streaks, no
  scoreboards, AI never auto-mutates, every destructive action
  reversible or confirmed, no exclamation marks in mascot copy
  (enforced by `mobile/src/__tests__/mascotLines.test.ts`).
