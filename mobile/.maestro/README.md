# Maestro E2E flows

Light-touch smoke tests for the critical UI paths in Sagely. Run on the
booted iOS simulator with the dev client installed.

## Why Maestro (not Detox)

- YAML flows, no compiled test code, no second EAS build profile to
  maintain.
- Drives the existing dev client; no native config in `app.json`.
- Fast to write, fast to read, easy to update when copy changes.

What Maestro does NOT cover:

- **OAuth (Apple / Google sign-in)** — the native sheets and Apple ID /
  Google account state live outside the app process and aren't reliably
  scriptable. Use the email/password path for any auth-gated flow.
- **Cross-device sync** — would need two simulators + emulator
  orchestration. Manual.

## Install

```sh
curl -Ls "https://get.maestro.mobile.dev" | bash
# then either: source ~/.zshrc   (or open a new terminal)
```

Installs to `~/.maestro/bin/maestro` and adds it to your PATH. No sudo.

**Do NOT use `brew install maestro`** — that Homebrew cask is an
unrelated **Maestro GUI app** (no-code testing IDE) and won't give you
the `maestro` CLI this directory expects. If you'd rather use Homebrew,
the CLI lives in a tap:

```sh
brew tap mobile-dev-inc/tap
brew install --HEAD maestro
```

## Preconditions for every flow

1. iOS simulator booted with Sagely's dev client installed.
2. Signed in as `sagely.todo@gmail.com` with the seed dataset present
   (run `scripts/seed_sample_data.py` first).
3. Dashboard tab is the active tab (cold-launch lands here — flow `01`
   asserts that). v1.5 renamed Home → Dashboard.

## Run

```sh
# from mobile/
npm run e2e                 # runs every flow in .maestro/
npm run e2e:flow flows/02-add-todo.yaml   # one flow
```

`maestro studio` is also useful for interactive flow authoring — point it
at the running sim and it'll show element selectors live.

## Flows

| File | What it covers | Manual-plan test # |
| --- | --- | --- |
| `flows/01-cold-launch-lands-on-home.yaml` | App launches to Dashboard tab; TODAY section renders | 1.1, 3.1 |
| `flows/02-add-todo.yaml` | FAB → Compose → Done → row appears in list | 4.1–4.3 |
| `flows/03-toggle-done-and-strike.yaml` | Tap open row → toggles done → drops from Open filter | 4.7, 3.2 |
| `flows/04-swipe-to-trash-and-undo.yaml` | Swipe-right → Not Do → snackbar Undo restores row | 4.10 |
| `flows/05-defer-all-group.yaml` | Group header "Defer all →" → modal title check → Tomorrow | 7.5–7.7 |
| `flows/06-pebble-rises-on-completion.yaml` | Complete a today task → pebble appears on Home strip | 3.2, 3.3 |
| `flows/07-defer-single-via-swipe.yaml` | Swipe-right → Defer → modal "Defer to" → Tomorrow | 7.1–7.3 |
| `flows/08-recurring-rolling.yaml` | Tap recurring → snapshot in Done bin + rolled-forward instance | 9.1–9.3 |
| `flows/09-shopping-add-item.yaml` | Empty Shopping → Add CTA → GroceryComposeSheet renders (STORES section visible) | (v1.5) |
| `flows/10-shopping-no-store-empty-state.yaml` | Zero-store empty state → Add Store CTA → Manage Store inline-add row | (v1.5) ⚠ |
| `flows/11-shopping-add-store.yaml` | Gear → Manage Store renders → "Add a store" CTA visible | (v1.5) |
| `flows/12-todos-empty-state.yaml` | Empty Todos → EmptyStateCard → Add a to-do → compose opens | (v1.5) |
| `flows/13-tab-navigation.yaml` | Dashboard → Todos → Shopping → Dashboard all mount/switch | P0.3 |
| `flows/14-relaunch-persists-data.yaml` | Seeded row survives a cold stopApp/launchApp (hydration) | P0.4 |
| `flows/15-open-task-details-sheet.yaml` | Long-press row → TaskDetailsSheet "Steps" renders (render-only) | P1.6 |
| `flows/16-sign-out.yaml` | Avatar → ProfileSheet → Sign out → SignIn screen ⚠ destructive | P0.2 |
| `flows/17-clear-completed.yaml` | Complete row → Done filter → "Delete all permanently" → confirm ⚠ destructive | P1.8 |
| `flows/18-bulk-trash-restore.yaml` | Trash view → select rows → bulk Restore ⚠ **blocked until #15** | P1.7 |

> **Flows 13–18 were added for the architecture-refactor session and have
> NOT yet been run on a sim** — they're authored from the component source
> + the conventions above (real i18n strings, proven tab/row selectors).
> Expect to tune a selector or two on first `npm run e2e`; the failing
> line names the element. They exist to smoke-test the #4 store rewire +
> #7/#8 folder reorg, none of which is covered by `tsc`/Vitest.

### Session P0/P1 manual-plan → flow coverage

| Case | Covered by | Notes |
| --- | --- | --- |
| P0.1 app launches | `01` | ✅ |
| P0.2 sign in / out | `16` (sign-out only) | sign-IN stays manual (OAuth not scriptable; email needs a test cred) |
| P0.3 tab navigation | `13` | ✅ new |
| P0.4 relaunch hydration | `14` | ✅ new (needs seed) |
| P1.5 add task + toggle | `02`, `03` | ✅ |
| P1.6 subtasks / task-details | `15` | long-press → TaskDetailsSheet (confirmed in source); render-only (Modal a11y caps commit) |
| P1.7 trash + undo | `04` | ✅ undo covered |
| P1.7 trash bulk-select | `18` | ⚠ **blocked until #15** — Trash view is only reachable via the CategorySheet `<Modal>` |
| P1.8 clear completed | `17` | ✅ new |
| P1.9 reminders | — | manual: ReminderSheet is a `<Modal>`, commit not scriptable (→ #15) |
| P1.10 defer (single + all) | `05`, `07` | ✅ "Defer" = the swipe action → DeferModal (the store action is internally named `snooze`) |
| P1.10 recurrence / series-edit | `08` | rolling covered; series-edit dialogs are `<Modal>`, commit manual (→ #15) |
| P1.11 pebbles | `06` | ✅ |

**⚠ Flow 10 is skipped by default** — requires a sim with zero stores
configured. Run explicitly after deleting all stores via Manage Store,
or against a fresh install.

**⚠ Flow 18 is blocked until task #15** (RN `<Modal>` a11y fix) — the
Trash view is only reachable through the CategorySheet `<Modal>`, so the
"Trash" tap can't land. Authored + ready; skip it until #15 ships.

**⚠ Flows 03–08, 14, 15, 17, 18 require seed data** — they tap specific
rows produced by `scripts/seed_sample_data.py`: "Pick up dry cleaning",
"Take a 10-minute walk", "Email therapist about Friday", "Pay credit
card bill", "Yoga class". (Row selectors are aligned to the seed script's
actual output — it writes "Pick up dry cleaning" with no hyphen and has
no "Walk the dog" row.) On a fresh / empty sim they fail at the row-tap
step. Run the seed (writes to the demo account's cloud state — needs
`SAGELY_FIREBASE_WEB_API_KEY` + `SAGELY_DEMO_EMAIL` + `SAGELY_DEMO_PASSWORD`),
then sign in as `sagely.todo@gmail.com` on the sim so the data hydrates.

**⚠ Flows 16 + 17 are destructive** — `16` signs the sim out (run it
last/standalone, then sign back in manually); `17` permanently deletes
the completed row it acts on (reseed afterward).

**Runs cleanly on any empty signed-in sim:** 01, 02, 09, 11, 12, 13.
The others are precondition-gated (seed) or destructive.

### Known a11y limitation in v1.5 sheets

Flows 09 and 11 are scoped to "compose/sheet renders" rather than
fully exercising commit. `GroceryComposeSheet` and `StorePicker`
have a wrapping `<View accessible={true}>` that concatenates all
child accessibility labels into one parent string. Maestro's
`tapOn: text: ".*X.*"` then matches the parent and taps its
geometric center — not the specific button or chip — so commit
flows (selecting a store chip, tapping "Add another", tapping
header Done) don't reach the intended target.

The fix is in the components: set `accessible={false}` on the
outer wrapper and let per-element `accessibilityLabel`s be
independently discoverable. Tracked as future component a11y work.

### TODO flows (write when relevant)

- `signin-apple.yaml` / `signin-google.yaml` — native OAuth sheets aren't reliably scriptable; covered by manual QA today.
- `mark-done-pebble.yaml` — overlaps with 06; extend if pebble math changes.
- `add-grocery-mochi-thinking.yaml` — would assert "Mochi's thinking…" appears within 1s of typing. CF call latency is non-deterministic, so this needs a stub or generous timeout.
- `recalibrate.yaml` — Reset Lifetime Count → Recalibrate confirm dialog copy.
- `dark-mode.yaml` — toggle system dark → Dashboard chrome adapts.
- `voiceover.yaml` — Maestro doesn't natively drive VoiceOver; document manual approach.

## Tips when flows fail

- Maestro selectors use visible text by default. If a label was renamed,
  the matching `text:` or `assertVisible:` line will fail with the new
  text in the error — easy to fix.
- For elements without visible text (e.g. icons), use `id:` (the
  accessibilityIdentifier) or `index:` against the parent.
- `maestro hierarchy` from the CLI dumps the current screen tree so you
  can find the right selector.
- Each flow is independent; failures in one don't cascade to others. The
  set is designed so cleanup happens via the next cold-launch + reseed,
  not via in-flow rollback (keeps YAML readable).
