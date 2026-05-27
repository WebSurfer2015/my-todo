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
3. Home tab is the active tab (cold-launch lands here — flow `01` asserts
   that).

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
| `flows/01-cold-launch-lands-on-home.yaml` | App launches to Home tab; TODAY section renders | 1.1, 3.1 |
| `flows/02-add-todo.yaml` | FAB → Compose → Done → row appears in list | 4.1–4.3 |
| `flows/03-toggle-done-and-strike.yaml` | Tap open row → toggles done → drops from Open filter | 4.7, 3.2 |
| `flows/04-swipe-to-trash-and-undo.yaml` | Swipe-right → Not Do → snackbar Undo restores row | 4.10 |
| `flows/05-defer-all-group.yaml` | Group header "Defer all →" → modal title check → Tomorrow | 7.5–7.7 |
| `flows/06-pebble-rises-on-completion.yaml` | Complete a today task → pebble appears on Home strip | 3.2, 3.3 |
| `flows/07-defer-single-via-swipe.yaml` | Swipe-right → Defer → modal "Defer to" → Tomorrow | 7.1–7.3 |
| `flows/08-recurring-rolling.yaml` | Tap recurring → snapshot in Done bin + rolled-forward instance | 9.1–9.3 |
| `flows/09-shopping-add-item.yaml` | Shopping FAB → Add Item → header Done → item appears | (v1.5) |
| `flows/10-shopping-no-store-empty-state.yaml` | Zero-store empty state → Add Store CTA → inline-add row opens | (v1.5) |
| `flows/11-shopping-add-store.yaml` | Manage Store → + Add store → header Done → new store persists | (v1.5) |
| `flows/12-todos-empty-state.yaml` | Empty Todos → EmptyStateCard → Add a to-do → compose opens | (v1.5) |

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
