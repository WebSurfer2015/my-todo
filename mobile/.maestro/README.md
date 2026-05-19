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
brew install maestro
# or:
curl -Ls "https://get.maestro.mobile.dev" | bash
```

Both install to userspace (Homebrew prefix or `~/.maestro/bin/`); neither
needs sudo.

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
| `flows/03-toggle-done-and-strike.yaml` | Tap checkbox → strike-through + pebble flight | 4.7, 3.2 |
| `flows/04-swipe-to-trash-and-undo.yaml` | Swipe right → Move to trash → Undo via snackbar | 4.10 |
| `flows/05-defer-all-group.yaml` | Group header "Defer all →" → modal title check → Tomorrow | 7.5–7.7 |

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
