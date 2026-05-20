# Play Console release helper

Mirror of `mobile/scripts/asc/asc_release.py` for Google Play. Pushes
localized listings (title / short description / full description) and
per-release release notes via the Google Play Developer API. AAB upload
is left to `eas submit --platform android` (or manual Play Console
upload); this script doesn't touch binaries.

```sh
/usr/bin/python3 mobile/scripts/play/play_release.py <subcommand>
```

System Python on macOS has `pyjwt` + `cryptography` already installed —
same path as the ASC counterpart.

## One-time setup

Before this script can do anything:

1. **Developer account verified** in Play Console (Google's identity
   check, real-device test). This is the longest-running gate.
2. **App listing created** in Play Console (Create app → Sagely →
   English / Free) so a record exists for `com.websurfer.mytodo`.
3. **Service account** at `~/.googleplay/sagely-publisher.json` —
   Google Cloud Console → IAM → Service Accounts → Create, then in
   Play Console → Setup → API access link the project and grant the
   service account the "Release apps to production" role.
4. **First AAB on the target track** (internal at minimum). Upload
   manually the first time or via `eas submit --platform android
   --track internal` once the service account is wired into `eas.json`.

After all of that, the script is one command per release.

**Locale slots auto-create.** `edits.listings.update` (called by
`set-listings` and `prepare`) has create-or-update semantics, so the
seven Play locales — en-US, es-419, es-ES, fr-FR, de-DE, zh-CN, ja-JP —
materialize the first time content is pushed to them. No "Manage
translations" UI click required.

## Per-release workflow

1. `eas build --platform android --profile production`
2. Upload the AAB to the target track (Play Console manual upload for
   the first release, `eas submit` after).
3. Edit `whats_new.json`: add a new top-level key for the new version
   string with per-locale release notes (≤500 chars each).
4. Run:
   ```sh
   /usr/bin/python3 mobile/scripts/play/play_release.py prepare \
     --version 1.3.0 --track internal
   ```
   This will, in a single atomic edit:
   - Push title + shortDescription + fullDescription to every locale
     in `release_copy.json` (fullDescription resolved from
     `../asc/release_copy.json` via the `ascLocaleMap`).
   - Find the matching release on the target track, attach per-locale
     `releaseNotes` from `whats_new.json`.
   - Commit the edit.
5. Open Play Console, eyeball the diff, then promote internal →
   closed/open testing → production from the Console UI.

The script is **idempotent**: re-run any subcommand safely. Each
command opens a fresh edit, makes changes, and commits or discards.

## Sub-commands

```text
status                 listing locales (configured vs live) +
                       track release state. Read-only.
list-tracks            tracks + releases summary. Read-only.

set-listings           push title + shortDesc + fullDesc per locale
                       (atomic edit, committed).
                       --locale <X>   only push a single locale

set-release-notes      push per-locale release notes for --version
                       to --track.
                       --version 1.3.0    (required)
                       --track internal   (default; alpha/beta/production)

prepare                set-listings + set-release-notes in one
                       atomic edit.
                       --version / --track same as above

discard-edit           safety: throw away a dangling edit by id
                       --edit-id <id>
```

## Config files

### `release_copy.json`

Play-specific text + the locale mapping back to ASC.

```jsonc
{
  "packageName": "com.websurfer.mytodo",
  "title": "Sagely — Calm To-Dos",
  "websiteUrl": "...",
  "privacyPolicyUrl": "...",
  "ascLocaleMap": {
    "en-US": "en-US",
    "zh-CN": "zh-Hans",
    "es-419": "es-MX",
    "es-ES": "es-ES",
    "fr-FR": "fr-FR",
    "de-DE": "de-DE",
    "ja-JP": "ja"
  },
  "locales": {
    "en-US": {
      "shortDescription": "A calm to-do app for days you can't be a productivity person."
    },
    "...": { ... }
  }
}
```

`title` is the same string in every locale; the script applies it
across all locales when pushing listings.

`shortDescription` is per-locale, ≤80 chars (Play's limit).

`fullDescription` is **not** in this file — it comes from
`../asc/release_copy.json` via `ascLocaleMap`. Keeping the long-form
copy in one place prevents ASC/Play drift.

### `whats_new.json`

Per-version, per-locale Play release notes. ≤500 chars per locale (Play's
limit; ASC accepts 4000 so its file has longer entries).

```jsonc
{
  "1.3.0": {
    "en-US": "A more accessible, more polished Sagely.\n\n• ...",
    "zh-CN": "...",
    "es-419": "...",
    "es-ES": "...",
    "fr-FR": "...",
    "de-DE": "...",
    "ja-JP": "..."
  }
}
```

Add a new top-level key per release. Translate from `en-US` as needed.

## Locale codes

Play and ASC use different locale conventions for some languages.
`release_copy.json`'s `ascLocaleMap` is the bridge — never hardcode the
mapping anywhere else.

| Language | Play code | ASC code |
| --- | --- | --- |
| English (US) | `en-US` | `en-US` |
| Spanish (Latin America) | `es-419` | `es-MX` |
| Spanish (Spain) | `es-ES` | `es-ES` |
| French (France) | `fr-FR` | `fr-FR` |
| German (Germany) | `de-DE` | `de-DE` |
| Chinese (Simplified) | `zh-CN` | `zh-Hans` |
| Japanese | `ja-JP` | `ja` |

## When something goes wrong

- **"Service account key not found"** → set up the JSON per
  one-time-setup #4, chmod 600.
- **HTTP 401** → access token expired in-process or the service account
  doesn't have permission. A fresh script invocation re-mints the
  token; if it persists, check Play Console → Setup → API access for
  the service account's role.
- **HTTP 403** → service account lacks `Release` permission on this app.
- **HTTP 404 on a locale PUT** → check that `packageName` matches the
  Play Console app and that the edit hasn't expired. The PUT itself
  creates the locale slot if needed (create-or-update semantics), so a
  404 here means the parent resource (app, edit) is wrong, not the
  locale.
- **"Track has no releases"** on `set-release-notes` / `prepare` → no
  AAB on that track. Upload one first.
- **Multiple edits open** → discard them via `discard-edit --edit-id`.
  Each command auto-creates and commits its own edit, so dangling edits
  only happen if a command crashes mid-way.

## Files

```
mobile/scripts/play/
├── play_release.py    main runner
├── release_copy.json  Play title + per-locale shortDescription + map
├── whats_new.json     per-version per-locale release notes (≤500 chars)
└── README.md          this file
```

Service-account key path is hard-coded to
`~/.googleplay/sagely-publisher.json`, matching the path documented in
`docs/PLAY-STORE-RELEASE.md`.
