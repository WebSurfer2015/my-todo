# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Sagely is an **iOS-first** Expo / React Native app (Android build config is kept
but not actively shipped). There is no web app. `mobile/CLAUDE.md` has the deep
mobile guide (Expo SDK 54 + RN 0.81, EAS build/submit, native auth quirks).

## Layout

```
my-todo/
├── core/            Pure TypeScript domain, in Clean Architecture rings:
│   ├── src/         domain/ (types, priorities, statuses, entitlements),
│   │                logic/ (derive, groups, filters, selection, utils, labels,
│   │                  homeDashboard, mochiOps, mochiFallback, reminderPresets,
│   │                  suggestFields),
│   │                ports/ (persistence StorageAdapter, aiContracts),
│   │                data/ (categories, profile, groceries, i18n, exporter, quotes,
│   │                  authMessages),
│   │                store/ (createTodoStore, coordinators, mergeTodos,
│   │                  usageSignals, types, index);
│   │                index.ts is the barrel
│   └── test/        core's tests (vitest, node env)
├── mobile/          Expo SDK 54 + React Native 0.81 + TypeScript (the app)
├── functions/       Firebase Cloud Functions (Node 22): agentChat, aiInfer,
│                    revenuecatWebhook, onUserDeleted, metricsRollup; test/ = rules tests
├── firebase.json    Firebase config (functions source, firestore rules, emulator)
├── firestore.rules  Firestore security rules
├── docs/            ARCHITECTURE.md, PRIVACY.md (GitHub Pages), strategy + release docs
├── scripts/         one-off maintenance scripts (orphan cleanup, demo seed)
├── package.json     root = core's test/coverage runner + repo gates (no workspaces)
└── .dependency-cruiser.cjs   Clean Architecture rules
```

`mobile/` imports `core/` via relative paths to the ring (e.g.
`'../../../core/src/logic/derive'`) or through its thin `src/core-bindings/`
re-exports. No path aliases, no monorepo tooling.

## Commands

| What | Where | Command |
|---|---|---|
| Core tests | repo root | `npm test` · coverage gate: `npm run test:coverage` |
| Core typecheck (src + tests) | repo root | `npm run typecheck:core` |
| Architecture gate | repo root | `npm run lint:arch` |
| Mobile | `mobile/` | `npm run lint` · `npx tsc --noEmit` · `npm test` |
| Functions | `functions/` | `npx tsc --noEmit` · `npm test` |
| Firestore rules tests | `functions/` | `npm run test:rules` (needs JDK 21+; CI runs it) |
| Deploy backend | repo root | `firebase deploy --only functions` / `--only firestore:rules` |

CI (`.github/workflows/ci.yml`) runs all of the above on every push to
`dev`/`main` — keep it green; a red run is a stop.

## Clean Architecture — the dependency rule (enforced)

Source dependencies point **inward**:

```
frameworks/drivers  →  interface adapters  →  use cases / domain
(mobile/: RN, Expo,     (firestoreAdapter,      (core/src: types, derive,
 Firebase, AsyncStorage) useTodoStore, i18n)     persistence PORT, …)
```

Hard rules, enforced by `npm run lint:arch` (dependency-cruiser):

1. **`core/` imports nothing external** — no npm package and no node builtin.
   New shared logic goes in `core/` behind a port, never a platform dep in core.
2. **`core/` never reaches up** into `mobile/` or `functions/`.
3. **`mobile/` never imports `functions/`** — it talks to the backend over HTTPS.
4. **`functions/` is standalone** — shipped server code imports neither `core/`
   nor `mobile/` (its tsconfig rootDir is `src`); it keeps its own copies,
   guarded by parity tests in `mobile/src/__tests__/*-parity.test.ts`.
5. **No circular dependencies.** Test files are exempt from 3–4.

The known-violations baseline (`.dependency-cruiser-known-violations.json`) is
empty — keep it that way; fix instead of re-baselining.

## Naming conventions

| Kind | Convention | Example |
|---|---|---|
| Pure modules / utils | `camelCase.ts` | `derive.ts`, `groups.ts` |
| React components | `PascalCase.tsx`, one component per file | `TaskItem.tsx` |
| Hooks | `useXxx.ts` | `useTodoStore.ts`, `useSyncedState.ts` |
| Port (interface) | noun + role, `PascalCase` | `StorageAdapter` |
| Adapter (port impl) factory | `make<Thing>Adapter` | `makeFirestoreAdapter` |
| Pure derive/mutation helper | `verbNoun` | `todoToggle`, `categoryAdd` |
| Boolean | `is` / `has` / `should` prefix | `isCategoryFilter` |
| Type vs value | type `PascalCase`, const `UPPER_SNAKE` | `Todo`, `SEED_CATEGORIES` |

- **`make*Adapter`** for anything implementing a `core/` port.
- **`verbNoun` pure helpers** live in `core/` and never touch React/platform —
  they are the unit-testable use-case layer.

## Deploy workflow — dev first, then main

**Every change lands on `dev` first. `main` is only updated after the user
verifies. Do not `git push origin main` directly.** This applies to all changes
— code, docs, CLAUDE.md, scripts, lockfiles. No docs-only carve-out.

Verification happens on a **dev-client build / TestFlight** (there is no web
staging environment). Backend changes (`functions/`, `firestore.rules`) are
deployed with `firebase deploy` from the repo root — it's one Firebase project,
so that is production; deploy deliberately. Promoting `dev` → `main` publishes
`docs/` (including the privacy policy) via GitHub Pages.

1. `git branch --show-current` — if on `main`, switch:
   ```sh
   git stash push --keep-index   # if needed
   git checkout dev
   git merge --ff-only main      # dev must fast-forward from main
   git stash pop                 # if you stashed
   ```
   If the fast-forward fails, stop and ask — don't force.
2. Commit and `git push origin dev`.
3. **Stop.** Tell the user it's on dev. Don't promote on your own.
4. When asked to promote: `git checkout main && git merge --ff-only dev && git push`.

Only commit directly to main when the user explicitly says "hotfix to main" /
"skip dev". When in doubt, ask.

## Other notes

- The app has no production users yet, so stored data is disposable — prefer
  clean schemas over backward-compatibility shims (but keep input validation:
  storage is untrusted).
- iOS release is held on the Apple org conversion; see `docs/REPOSITIONING-ROADMAP.md`
  (P5) and `docs/RELEASE-v2.0.0-TEST-MATRIX.md`.
- Update `docs/ARCHITECTURE.md` when the cross-package data flow changes.
