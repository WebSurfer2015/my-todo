# Test automation — coverage & enforcement

Living scorecard for the test/QA program. Updated 2026-06.

## Scorecard (before → after)

| Area | Before | After | What changed |
|---|---|---|---|
| Core domain logic | A− | **A** | already strong (recurrence R1–R7, derive, filters, groceries, coordinators) + migration golden-fixtures + migrateLocalToCloud gating |
| CI enforcement | C− | **A−** | `lint:arch`, ESLint (web+mobile), and the Firestore **emulator** job (rules + adapter) now gate every PR. *Coverage threshold still pending the vitest-workspace migration — the one gap keeping this off full A.* |
| Sync / persistence | F | **A−** | emulator integration tests (adapter round-trip, `{value,updatedAt}` shape, onSnapshot cross-client, delete-denied contract) + `migrateLocalToCloud` extracted & unit-tested (per-key data-bleed guard). *`deleteAccount` ordering still relies on manual QA.* |
| Migrations | C | **A** | golden-fixture suite: legacy-shape promotion, dedup, seed-on-garbage, caps, empty→undefined |
| Mobile unit | D | **A−** | 2 → 6 test files: envelope (cross-device contract), authErrors (full branch table), reminder-id scheme, + a11y guard. *Component render covered by E2E, not RNTL — see below.* |
| AI cost discipline | — | **A** | server `MODES` cost guards tested: hot paths on Haiku, no Opus, tight max_tokens |
| E2E (Maestro) | C | **B+** | 18 flows green (16 seeded + 2 emptied) + #15 a11y regression guard + nightly CI scaffold. *testIDs / emulator-backed / deeper persistence asserts = remaining polish.* |
| Non-functional | F | **B** | a11y regression guard (caught a real miss) + versioned manual-QA checklist (OAuth, VoiceOver, sync, offline, visual). *Visual-regression baselines + perf not yet automated.* |

## What CI now gates (every PR, `.github/workflows/ci.yml`)

- **arch** — `lint:arch` (dependency-cruiser Clean-Architecture rule)
- **core** — `tsc`
- **web** — ESLint (errors fail) + 618 unit tests + coverage artifact + build
- **mobile** — ESLint (errors fail) + `tsc` + 52 unit tests
- **functions** — `tsc` + 48 tests (incl. AI cost guards)
- **rules** — Firestore emulator: 22 security-rules + 7 adapter integration tests (JDK 21)
- **E2E (nightly, scaffold)** — `.github/workflows/e2e-nightly.yml`, macOS, manual+scheduled (needs secrets)

## Test counts

| Suite | Count |
|---|---|
| web unit (vitest) | 618 |
| mobile unit (vitest) | 52 |
| functions (vitest) | 48 |
| Firestore emulator (rules + adapter) | 29 |
| Maestro E2E flows | 18 |

## Deliberate non-goals (documented decisions)

- **RNTL / jest-expo mobile component tests** — not stood up. The component
  tree pulls in 5 Firebase modules + google-signin + apple-auth + 10+ expo
  native modules; an RNTL harness would be a brittle wall of native mocks
  for marginal gain. Component render/behavior is covered by the 18 Maestro
  E2E flows; mobile *logic* is unit-tested (core via web + 6 mobile files).
- **Native OAuth + VoiceOver automation** — not scriptable; covered by the
  versioned [QA-CHECKLIST.md](./QA-CHECKLIST.md) (pragmatic-A).

## Remaining to reach straight-A everywhere

1. **Coverage gate** — repo-root vitest workspace so core/ coverage is
   measurable + thresholded (CI enforcement → A).
2. **`deleteAccount` ordering test** — light Firebase mock (sync → A).
3. **E2E hardening** — stable `accessibilityIdentifier` testIDs, point E2E
   at the emulator (off prod), assert persistence-across-relaunch, and a
   first green nightly run (E2E → A).
4. **Visual-regression baselines** + a perf/scroll smoke (non-functional → A).
