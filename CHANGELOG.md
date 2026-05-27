# Changelog

Internal changelog covering web, mobile, and core. App Store user-facing copy lives in `mobile/RELEASE_NOTES.md`.

## Unreleased

Test-coverage + CI pass. No user-visible behavior changes besides one small bug fix.

- **Tests** — 248 new Vitest tests covering pure helpers (`core/utils`, `core/profile`, `core/groceries`, `core/statuses`, `core/persistence`, `core/agentTools`, `mobile/backgrounds`, `mobile/authErrors`) and three React hooks (`useSyncedState`, `useSuggestSteps`, `useTodoFieldSuggestions`).
- **Refactor** — extracted `useSuggestSteps` and `useTodoFieldSuggestions` from their panel files into standalone modules so they're testable without React Native. Panels re-export for back-compat.
- **Bug fix** — `useSuggestSteps` filter is now `trim().length > 0`; was `length > 0`, which let whitespace-only AI suggestions render as blank steps.
- **CI** — GitHub Actions runs on push to `main` + `dev` and on every PR: core typecheck, web build + test + coverage artifact, mobile typecheck + test, Cloud Functions typecheck.
- **Tooling** — added `@testing-library/react`, `@testing-library/dom`, `happy-dom` for hook tests via per-file `// @vitest-environment happy-dom` pragma.

## v1.5.0 — 2026-05-27

Dashboard + Shopping + AI-surface release.

- **Dashboard** — renamed from "Today". Customizable stat tiles via Manage Dashboard Tiles sheet (unlimited, horizontal scroll). "What's Next?" inline expansion cycles through Todos' time buckets. Sticky tile row pinned to bottom.
- **Shopping (renamed from Groceries)** — multi-store data model: `GroceryItem.stores: string[]` (legacy `store: string` migrated on read). Items appear in every linked store's filtered view. Manage Store sheet for store curation; Departments are now AI-managed and hidden in compose/edit.
- **AI store linking** — new Cloud Function mode `link-store-to-items`. Adding a new store via Manage Store dispatches Haiku to find items the store would carry; chips auto-tag.
- **AI multi-store recommendation for new items** — `classify-grocery-dept` extended with `recommendedStores: string[]` (3 max, filtered server-side against the user's configured stores). Chips auto-select.
- **Unified Mochi-thinking indicator** — `MochiThinking` component (animated mochi PNG + sparkles fade + italic label) used across every AI textbox. Replaces ad-hoc spinners in compose, edit, store-link, suggest-steps trigger.
- **Unified empty states** — `EmptyStateCard` (white card, italic hint, soft-purple pill action) used by Todos / Trash / Shopping empties.
- **Avatar library refresh** — added elephant / whale / squirrel / rabbit; dropped cloud / moon / sun / leaf / tree. Themed glyphs + nouns (rabbit→carrot, owl→books, whale→spouts, etc.) localized across all 6 languages.
- **Animation polish** — `PebbleFlight` 1800ms→2400ms with two-beat squash-and-stretch + wiggle; bundled Mochi PNG flies instead of emoji. LoadingScreen renders the user's avatar with pulse.
- **Compose / Edit** — header `Done` / `Save` only, no in-body duplicates. Multi-row textbox in Add Item. "Add" bottom button removed (`Done` covers it). Department row hidden in Edit Item (AI-managed).
- **Profile** — "You're signed in as <email>" line above avatar. Sign Out promoted to ProfileSheet header (top-left, red, replacing Cancel). YOUR JOURNEY card with lifetime count + Reset action (recalibrates to current done-items count instead of zeroing).
- **Header chrome** — transparent. Filter row hides entirely when no filter is selected and no pinned pills would render.
- **Min-height rule** — all bottom sheets ≥ 30% of screen height.
- **Settings restructure** — CONFIGURATION section groups Manage Dashboard Tiles / Manage Todos / Manage Store / Manage Animation & Sound. New `ManageAnimationSoundSheet` split from Settings.
- **Fixes** — Done pill clipped after Home → Todos nav; FAB overlap with sticky tile row on Home; Apple sign-in flow-specific error guidance; iOS Modal layering (in-sheet banners replace snackbars where the snackbar was hidden behind the open modal).

## v1.4.0 — 2026-05-19

AI surface + reminders + ASC pipeline.

- **Mochi agent (`agentChat` Cloud Function)** — Sonnet + multi-turn `tool_use` loop. Ships with `createTodo` tool. ChatSheet conversational surface.
- **Reminders** — one-shot + interval reminder spec. `expo-notifications` wired with permission flow.
- **App Store Connect pipeline** — `scripts/asc_upload_screenshots.py` for automated screenshot uploads. EAS auto-increment + auto-submit.
- **Bottom-tab navigation** — replaces stack-based nav. Search top-sheet per tab.
- **Defer modal + bulk-defer** helpers in `useTodoStore`.
- **Architecture doc** rewritten (`docs/ARCHITECTURE.md`).
- **Suggest Steps** refactored into hook + trigger + review primitives.

## v1.3.0 — 2026-04 (approximate)

Shopping + collectibles + Mochi brand.

- **Groceries tab** + items + stores + departments.
- **Pebbles** — today + lifetime counters on the surface.
- **Mochi mascot** replaces the turtle. Themed avatar presets.

## v1.0.1 (iOS Build 20) — 2026-05-13

Second submission. Brand rename + auth polish.

- **Brand** — renamed to "Todos for Everyone" across all user-visible surfaces (home-screen label, page title, i18n title across 6 locales, sign-in card, profile placeholder, privacy policy, landing page).
- **Auth UX** — sign-in pages now show social providers on the landing only; the email page is clean (no provider buttons). Email/password page only carries forgot-password + create-account toggles. "Don't have an account?" CTA promoted to the landing alongside "Sign in with email".
- **i18n** — 12 new sign-in keys × 6 locales (tagline, field labels, submit buttons, social-provider labels, mode toggles, error message, language-picker aria-label). All hardcoded English on the auth pages is gone.
- **Facebook removed** — code paths, deps, and UI all gone. The native module (`react-native-fbsdk-next`) is no longer linked, so the iOS bundle is slightly smaller.
- **Sign-out placement** — moved out of the mid-sheet position in the profile editor to immediately under the avatar row. Easier to find without scrolling past edit fields.
- **CSS fixes (web)** — defined the `--separator` and `--card` CSS variables that were previously referenced but never declared, restoring the visible input borders and sign-in card background that were silently being dropped.
- **Domain** — `app.technologyforhumanity.net` now points at the Amplify app; marketing landing lives at the apex via GitHub Pages.

## v1.0 (iOS Build 16) — 2026-05-13

First public release on the App Store.

- **Auth** — Apple, Google, Facebook, email/password. Forgot-password flow. First/last name capture on signup. Apple-name seeding on first sign-in only.
- **Sync** — Per-uid Firestore adapter with `onSnapshot` subscribe + 400ms debounced writes. Per-key gated cloud migration so stale local todos can't clobber cloud.
- **Core** — UUID ids, `updatedAt` for last-write-wins, `endOfWeekLocal` Sunday fix, 32 new tests covering migrate/derive/buildGroups.
- **UX** — Calendar picker in AddTask, header identity row, profile derived from firstName, 6-language auth page.
- **Security** — Firestore rules locked to `request.auth.uid == uid`, emulator-tested. Default deny on root collections.
- **Tooling** — ASC screenshot uploader (`scripts/asc_upload_screenshots.py`), EAS auto-submit, AWS Amplify web hosting.
- **Deps** — `fast-uri` 3.1.2 (host confusion fix), Crashlytics pinned to 22.4.0.
