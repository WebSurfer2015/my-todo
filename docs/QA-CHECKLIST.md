# Manual QA checklist

The automated suites (unit + emulator + Maestro E2E) cover the bulk of the
app. This checklist covers what **can't** be reliably automated — the
"pragmatic-A" surfaces — plus a visual spot-check pass. Run it before a
release (App Store submission / `main` promotion).

Keep it versioned: when a flow here becomes automatable, move it into the
relevant suite and delete the row.

> Legend: ☐ untested · ✅ pass · ❌ fail (file an issue)

## 1. Native OAuth sign-in (not scriptable — native sheets live outside the app)

Maestro/unit can't drive the Apple/Google native account sheets; the
email/password path IS covered (unit: `mapAuthError`; E2E: manual flow).

- ☐ **Apple — first ever sign-in**: fresh account → name is captured and
  shown in the greeting. (Apple sends `fullName` only once — verify the
  profile seed worked.)
- ☐ **Apple — returning sign-in**: existing account → lands on Dashboard,
  data hydrates.
- ☐ **Apple — cancel**: dismiss the sheet → no error UI (code 1001 is
  silent), stays on SignIn.
- ☐ **Google — sign-in**: account picker → Dashboard, data hydrates.
- ☐ **Google — cancel**: dismiss → no error toast.
- ☐ **Email — wrong password**: shows "That email or password isn't right."
- ☐ **Sign out → sign in as a different user**: no data bleed from the
  previous user (todos/categories/profile cleared locally on sign-out).

## 2. VoiceOver / accessibility (Maestro can't drive VoiceOver)

The #15 fix + the source guard keep sheets from flattening; verify the
lived experience:

- ☐ Enable VoiceOver (Settings → Accessibility). Each **sheet** (Compose,
  Task details, Filter, Profile, Defer, Manage Store, grocery compose)
  reads its controls **individually** — not as one concatenated blob.
- ☐ Swipe-actions (Defer / Not Do / Delete) are reachable + announced.
- ☐ Tab bar announces Dashboard / Todos / Shopping with selected state.
- ☐ Dynamic Type: bump text size to XXL — rows/sheets don't clip or overlap.

## 3. Cross-device sync (needs 2 devices — not in CI)

- ☐ Sign in on device A + device B (same account). Add a todo on A →
  appears on B within a couple seconds (onSnapshot).
- ☐ Toggle done on B → reflects on A.
- ☐ Edit the same todo on both quickly → last-write-wins, no crash/dupe.
- ☐ Clear data on A → B's list empties (setItem-empty cloud strategy).

## 4. Offline / flaky network

- ☐ Airplane mode → app still launches from cache (persistentLocalCache),
  shows last-synced data.
- ☐ Add/edit offline → changes queue → reconnect → they sync up.
- ☐ Cold-start offline → no infinite spinner; usable from local cache.

## 5. Notifications / reminders (native scheduling)

- ☐ Set a one-shot reminder → fires at the set time (foreground + locked).
- ☐ Set a recurring reminder → fires repeatedly at the interval.
- ☐ Delete a todo with reminders → its notifications are cancelled.
- ☐ Permission denied → app degrades gracefully (no crash, no nag loop).

## 6. Visual spot-check (until visual-regression baselines land — see below)

- ☐ **Light + dark mode**: Dashboard, Todos, Shopping, each sheet —
  colors/contrast correct, no unreadable text.
- ☐ Theme-from-avatar on/off: accent + background follow the avatar.
- ☐ Empty states render centered + on-brand (Dashboard welcome, empty
  Shopping "Start shopping.", empty Todos "You're all caught up.").
- ☐ Pebble/cairn animation on task completion (reduce-motion off) and that
  reduce-motion ON suppresses it.
- ☐ Long content: very long todo title, many categories, many stores —
  layout holds.

## 7. Destructive / one-way actions

- ☐ Delete account → Firestore docs gone, returns to SignIn, can't log
  back into the deleted account.
- ☐ "Delete all permanently" in the Done bin → bin empties; undo not
  offered (it's permanent — confirm the Alert copy says so).

---

## Visual-regression automation (chosen approach: lightweight in-repo)

Decision (QA program P6): **Maestro screenshot capture + committed-baseline
pixel diff** for mobile; no SaaS (Chromatic/Percy) — keeps it free + in-repo.

Status: **approach chosen, baselines not yet captured.** Standing it up
needs a booted sim to generate the first baselines, then a `pixelmatch`-
based differ in CI comparing fresh captures against the committed PNGs.
The Maestro flows already `takeScreenshot` at key states; the remaining
work is (1) commit baseline PNGs per flow/state, (2) add a diff step that
fails on >N-pixel drift, (3) a `--update-baselines` escape hatch for
intentional design changes. Until then, section 6 above is the manual
gate.
