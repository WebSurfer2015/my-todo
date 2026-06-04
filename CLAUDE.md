# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the repo-level guide. The two app workspaces have their own deeper guides:

- `web/CLAUDE.md` — Vite + React 18 web app architecture, Firestore sync, hosting
- `mobile/CLAUDE.md` — Expo SDK 54 + React Native 0.81, EAS build/submit, native auth quirks

## Layout

```
my-todo/
├── core/      Pure TypeScript, organized into Clean Architecture rings:
│              domain/ (types, priorities, statuses), logic/ (derive, groups,
│              selection, utils, filters), ports/ (persistence, agentTools),
│              data/ (categories, profile, i18n, exporter, groceries),
│              store/ (createTodoStore, coordinators); index.ts is the barrel
├── web/       Vite + React 18 + TypeScript
├── mobile/    Expo SDK 54 + React Native 0.81 + TypeScript
├── docs/      ARCHITECTURE.md (Mermaid + FigJam mirrors)
├── scripts/   asc_upload_screenshots.py (App Store Connect uploader)
├── amplify.yml  AWS Amplify monorepo build spec (appRoot: web)
├── package.json            root — holds ONLY the cross-package arch check (no workspaces)
└── .dependency-cruiser.cjs Clean Architecture rules (+ .dependency-cruiser-known-violations.json baseline)
```

`web/` and `mobile/` import `core/` via relative paths to the ring (e.g. `'../../core/src/domain/types'`, `'../../core/src/logic/derive'`), or from the `'../../core/src'` barrel. No path aliases, no monorepo tooling — the root `package.json` exists solely so `dependency-cruiser` can see all three packages at once.

## Clean Architecture — the dependency rule (enforced)

Source dependencies point **inward**, never outward:

```
frameworks/drivers  →  interface adapters     →  use cases / domain
(web/, mobile/:         (firestoreAdapter,         (core/src: types, derive,
 React, RN, Expo,        useTodoStore,              groups, persistence PORT,
 Firebase, AsyncStorage) i18n bindings)             categories, profile, …)
```

Hard rules, enforced by `npm run lint:arch` (dependency-cruiser) at the repo root:

1. **`core/` imports nothing external** — no npm package (React, Firebase, Expo) and no node builtin (`fs`, `path`). It is platform-pure so both web and React Native can run it. New shared logic goes in `core/` behind a port (e.g. `StorageAdapter`), never a platform dep added to core.
2. **`core/` never reaches "up"** into `web/` or `mobile/`.
3. **`web/` and `mobile/` never import each other** — anything both need lives in `core/`. *Scoped to shipped code:* `*.test.*` files are exempt (they don't ship), because a few web tests exercise mobile React hooks via web's `happy-dom`/`renderHook` — mobile's node-only vitest can't render them.
4. **No circular dependencies** anywhere.

How to run / extend:

- `npm run lint:arch` — the authoritative gate. **Wire this into CI alongside `tsc`.** Add it to any pre-merge check.
- `.dependency-cruiser.cjs` holds the rules; edit there to tighten/add rules.
- Each app's `eslint.config.js` also has a `no-restricted-imports` **warn** (editor-time squiggle when you type a cross-platform import). The hard, baseline-aware gate is `lint:arch`, not eslint.

**Known-violations baseline** (`.dependency-cruiser-known-violations.json`): a snapshot mechanism so the gate fails only on *new* debt. **It is currently empty (`[]`) — the codebase is fully clean** (the original 5 violations were burned down: the `PebbleFlight ↔ useTodosSlice` cycle was broken by extracting `components/pebbleTiming.ts`, and the 4 cross-platform *test* imports are now covered by the production-scoping in rule 3). If you ever need to introduce debt deliberately, `npm run lint:arch:baseline` re-snapshots — but prefer fixing. Do **not** grow the baseline.

## Naming conventions

Match the surrounding code; when adding new files/symbols, follow these:

| Kind | Convention | Example |
|---|---|---|
| Pure modules / utils | `camelCase.ts` | `derive.ts`, `groups.ts` |
| React components | `PascalCase.tsx`, one component per file | `TaskItem.tsx` |
| Hooks | `useXxx.ts` | `useTodoStore.ts`, `useSyncedState.ts` |
| Port (interface) | noun + role, `PascalCase` | `StorageAdapter` |
| Adapter (port impl) factory | `make<Thing>Adapter` | `makeFirestoreAdapter` |
| Pure derive/mutation helper | `verbNoun` | `todoToggle`, `categoryAdd`, `groceryEdit` |
| Boolean | `is` / `has` / `should` prefix | `isCategoryFilter` |
| Type vs value | type `PascalCase`, const `UPPER_SNAKE` | `Todo`, `SEED_CATEGORIES` |

Two that carry weight beyond style:

- **`make*Adapter`** for *anything* implementing a `core/` port — keeps the adapter ring greppable and the dependency-inversion boundary obvious.
- **`verbNoun` pure helpers** live in `core/` and never touch React/platform — they are the unit-testable use-case layer. A mutation that can't be named `verbNoun` without reaching for `useState`/`adapter` belongs in the React glue, not core.

## Deploy workflow — dev first, then main

**Every change in this repo lands on the `dev` branch first. `main` is only updated after the user verifies on the Amplify dev environment. Do not `git push origin main` directly.**

This applies to *all* changes — web code, mobile code, core, docs, CLAUDE.md edits, scripts, lockfile bumps. There is no docs-only carve-out.

### Why

AWS Amplify auto-deploys both branches:

- `dev` → `dev.dhcuxhzauzw4c.amplifyapp.com`
- `main` → `main.dhcuxhzauzw4c.amplifyapp.com` (production traffic + custom domain)

The dev environment exists so the user can sanity-check changes — including ones that look risk-free — before they hit production. Treating "docs only" as exempt erodes the gate.

### How

1. Check the current branch with `git branch --show-current`. If it's `main`, switch to `dev` first:
   ```sh
   git stash push --keep-index   # if needed; preserves staged changes
   git checkout dev
   git merge --ff-only main      # dev should always be a fast-forward of main
   git stash pop                 # if you stashed
   ```
   If the fast-forward fails, dev has commits that main does not — stop and ask the user how to reconcile, do not force.
2. Commit and push to `dev`:
   ```sh
   git add <files>
   git commit -m "..."
   git push origin dev
   ```
3. **Stop.** Tell the user the change is on dev so they can verify at the dev Amplify URL. Do not promote to main on your own.
4. When the user asks you to promote:
   ```sh
   git checkout main
   git merge --ff-only dev
   git push
   ```
   Use `--ff-only` so a non-fast-forward (which would imply parallel work has landed on main) fails loudly instead of producing a merge commit.

### Exceptions

The only times to commit directly to main: the user explicitly says "hotfix to main", "skip dev", or similar. When in doubt, ask.

## Other repo-wide notes

- The `core/` package is pure TypeScript with no React or platform deps. Add new shared logic there, not in `web/src/` or `mobile/src/` shims.
- iOS production submission is wired via EAS + ASC API key (see `mobile/CLAUDE.md`); Android Play Store submission is parked on Google's account-verification step (real device required).
- Architecture and workflow diagrams are in `docs/ARCHITECTURE.md`. Update them when the cross-package data flow changes.
