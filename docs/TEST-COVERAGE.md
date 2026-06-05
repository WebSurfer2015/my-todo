# Test automation — coverage & enforcement

Living scorecard for the test/QA program. Updated 2026-06.

## Scorecard (before → after)

| Area | Before | After | What changed |
|---|---|---|---|
| Core domain logic | A− | **A** | already strong (recurrence R1–R7, derive, filters, groceries, coordinators) + migration golden-fixtures + migrateLocalToCloud gating |
| CI enforcement | C− | **A** | `lint:arch`, ESLint (web+mobile), Firestore **emulator** job (rules + adapter), AND a gated **core coverage** job (repo-root vitest workspace; thresholds lines 88 / stmts 85 / funcs 88 / br 76) all gate every PR. |
| Sync / persistence | F | **A** | emulator integration tests (adapter round-trip, `{value,updatedAt}` shape, onSnapshot cross-client, delete-denied contract) + `migrateLocalToCloud` (per-key data-bleed guard) + `runDeleteAccount` (wipe-then-delete-user order) extracted & unit-tested. |
| Migrations | C | **A** | golden-fixture suite: legacy-shape promotion, dedup, seed-on-garbage, caps, empty→undefined |
| Mobile unit | D | **A−** | 2 → 7 test files: envelope (cross-device contract), authErrors (full branch table), reminder-id scheme, a11y guard. *Component render covered by E2E, not RNTL — see below.* |
| AI cost discipline | — | **A** | server `MODES` cost guards tested: hot paths on Haiku, no Opus, tight max_tokens |
| E2E (Maestro) | C | **B+** | 18 flows green (16 seeded + 2 emptied) + #15 a11y regression guard + nightly CI workflow. *Remaining for A: stable testIDs, emulator-backed (off prod), deeper persistence asserts, first green nightly run (needs secrets).* |
| Non-functional | F | **B+** | a11y regression guard (caught a real miss) + derive-path perf guard + versioned manual-QA checklist (OAuth, VoiceOver, sync, offline, visual). *Remaining for A: visual-regression baselines.* |

## What CI now gates (every PR, `.github/workflows/ci.yml`)

- **arch** — `lint:arch` (dependency-cruiser Clean-Architecture rule)
- **core** — `tsc`
- **coverage** — gated **core/ coverage** (`npm run test:coverage`, repo-root vitest; thresholds in `vitest.config.ts`)
- **web** — ESLint (errors fail) + unit tests + coverage artifact + build
- **mobile** — ESLint (errors fail) + `tsc` + unit tests
- **functions** — `tsc` + tests (incl. AI cost guards)
- **rules** — Firestore emulator: security-rules + adapter integration tests (JDK 21)
- **E2E (nightly, scaffold)** — `.github/workflows/e2e-nightly.yml`, macOS, manual+scheduled (needs secrets)

## Test counts

| Suite | Count |
|---|---|
| web unit (vitest) | 655 |
| core coverage run (vitest, root) | 577 |
| mobile unit (vitest) | 52 |
| functions (vitest) | 48 |
| Firestore emulator (rules + adapter) | 29 |
| Maestro E2E flows | 18 |

Core coverage: **lines 89.7 / stmts 86 / funcs 90 / branches 78** (gated).

## Deliberate non-goals (documented decisions)

- **RNTL / jest-expo mobile component tests** — not stood up. The component
  tree pulls in 5 Firebase modules + google-signin + apple-auth + 10+ expo
  native modules; an RNTL harness would be a brittle wall of native mocks
  for marginal gain. Component render/behavior is covered by the 18 Maestro
  E2E flows; mobile *logic* is unit-tested (core via web + 6 mobile files).
- **Native OAuth + VoiceOver automation** — not scriptable; covered by the
  versioned [QA-CHECKLIST.md](./QA-CHECKLIST.md) (pragmatic-A).

## Remaining to reach straight-A everywhere

Closed: ~~coverage gate~~ ✅ (CI → A), ~~deleteAccount ordering~~ ✅ (sync
→ A), ~~perf smoke~~ ✅. Still open (each needs a resource I can't drive
from here):

1. **E2E → A** — needs a sim session: add stable `accessibilityIdentifier`
   testIDs to FAB/gear/funnel/sheets and repoint the flows off point-taps;
   wire the dev client to the Firestore emulator (so E2E stops mutating the
   prod demo account); deepen flows to assert persistence-across-relaunch.
2. **E2E nightly → green** — add the 3 repo secrets
   (`SAGELY_FIREBASE_WEB_API_KEY` / `DEMO_EMAIL` / `DEMO_PASSWORD`) and let
   the workflow run once (USER action — I can't add GitHub secrets).
3. **Non-functional → A** — capture visual-regression baselines (needs a
   booted sim/browser) + add the pixelmatch diff step described in
   [QA-CHECKLIST.md](./QA-CHECKLIST.md).

Mobile unit is A− by design (no RNTL — see non-goals); E2E/non-functional
A items above are the last mile.
