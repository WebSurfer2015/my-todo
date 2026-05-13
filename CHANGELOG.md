# Changelog

Internal changelog covering web, mobile, and core. App Store user-facing copy lives in `mobile/RELEASE_NOTES.md`.

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
