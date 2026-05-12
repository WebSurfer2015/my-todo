# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the repo-level guide. The two app workspaces have their own deeper guides:

- `web/CLAUDE.md` — Vite + React 18 web app architecture, Firestore sync, hosting
- `mobile/CLAUDE.md` — Expo SDK 54 + React Native 0.81, EAS build/submit, native auth quirks

## Layout

```
my-todo/
├── core/      Pure TypeScript: types, derive, persistence, profile, categories, i18n, selection
├── web/       Vite + React 18 + TypeScript
├── mobile/    Expo SDK 54 + React Native 0.81 + TypeScript
├── docs/      ARCHITECTURE.md (Mermaid + FigJam mirrors)
├── scripts/   asc_upload_screenshots.py (App Store Connect uploader)
└── amplify.yml  AWS Amplify monorepo build spec (appRoot: web)
```

`web/` and `mobile/` import `core/` via relative paths (e.g. `'../../core/src/types'`). No path aliases, no monorepo tooling.

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
