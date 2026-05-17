# ASC release helper

Idempotent App Store Connect prep that does the things the ASC web UI
makes you click through manually for every release. Run from this
directory (or anywhere — paths are absolute):

```sh
/usr/bin/python3 mobile/scripts/asc/asc_release.py <subcommand>
```

The system Python (`/usr/bin/python3`) has `pyjwt` installed — that's the
one to use. Homebrew's `python3` does not (PEP 668 blocks
`pip install`). Same pattern as `asc_upload_screenshots.py`.

## Per-release workflow

1. `eas build --platform ios --profile production --auto-submit`
   (the existing flow — see `mobile/CLAUDE.md`).
2. Wait until the EAS build finishes and the IPA has uploaded to ASC.
3. Edit `whats_new.json`: add an entry for the new version string with
   per-locale "What's New" copy. Translate from `en-US` as needed.
4. Run:
   ```sh
   /usr/bin/python3 mobile/scripts/asc/asc_release.py prepare
   ```
   This will, on the editable in-flight version:
   - Push the privacy policy URL to every locale of the app info.
   - Push description / keywords / promotional text / support URL to
     every locale of the version, from `release_copy.json`.
   - Push the per-locale "What's New" for this version, from
     `whats_new.json`.
   - Wait for the latest build to be `VALID` on Apple's side, then
     PATCH the version's build relationship to point at it.
5. Open ASC, confirm screenshots are correct, set **Version Release** →
   "Automatically release this version", click **Add for Review** →
   **Submit**.

The script is **idempotent**: re-run any step safely after fixing a
typo or a missing locale; ASC just accepts the new values.

## Sub-commands

```text
list-versions          App's appStoreVersions with state.
list-builds            Recent builds with processingState.
status                 Current readiness of the editable version
                       (linked build, locale completeness, privacy URL).

set-privacy            Push privacyPolicyUrl from release_copy.json
                       to every appInfo locale.
                       --url <X>   override
set-copy               Push description / keywords / promo / support
                       from release_copy.json to every version locale.
                       --skip-en   leave en-US alone
                       --version <uuid>
set-whats-new          Push per-locale What's New for the editable
                       version's versionString from whats_new.json.
                       --version <uuid>
link-build             Wait for build to be VALID then PATCH the
                       version's build relationship.
                       --build <N>  pin to a specific build number
                       --timeout <S> default 900
                       --poll <S>    default 30
                       --version <uuid>

prepare                All of the above in order — typical
                       per-release one-liner.
                       --build / --timeout / --poll same as link-build
                       --version <uuid>
```

`--version` is optional everywhere. When omitted, the script picks the
single in-flight (editable) version automatically. Pass an explicit
UUID when there are multiple in flight.

## Config files

### `release_copy.json`

Stable per-locale long-form copy. Edit only when positioning shifts.

```jsonc
{
  "appId": "6767378689",
  "supportUrl": "https://websurfer2015.github.io/my-todo/",
  "privacyPolicyUrl": "https://websurfer2015.github.io/my-todo/PRIVACY",
  "locales": {
    "en-US": {
      "description": "Sagely is a calm to-do app …",
      "keywords": "todo,task,planner,…",
      "promotionalText": "A calm to-do app …"
    },
    "es-MX": { … }
  }
}
```

Locale lookup is `locales[full]` → `locales[<root>]` (e.g. `es-MX`
falls back to `es`). Add new locales by extending `locales`.

### `whats_new.json`

Per-version, per-locale What's New copy. Add a new entry per release.

```jsonc
{
  "1.1.0": {
    "en-US": "A calmer Sagely. New Mochi pebble flight …",
    "es-MX": "Una Sagely más tranquila. …",
    …
  },
  "1.2.0": {
    "en-US": "…",
    …
  }
}
```

ASC has a 4000-char limit on whatsNew; aim for short scannable bullets.

## When something goes wrong

- **"missing Privacy Policy URL"** in ASC → `set-privacy`.
- **"Description / Keywords / What's New / Support URL is required"
  on locale X** → check `release_copy.json` and `whats_new.json` have
  entries for X, then `prepare` (or just `set-copy` + `set-whats-new`).
- **Build not linked** → `link-build` (waits up to `--timeout`).
- **Multiple editable versions** error → pass `--version <uuid>` from
  `list-versions`.
- **HTTP 401** → JWT expired or key file path wrong. The script caches
  the token in-process; a fresh `python3` invocation re-mints it.

## Files

```
mobile/scripts/asc/
├── asc_release.py    main runner
├── release_copy.json stable description/keywords/promo per locale
├── whats_new.json    per-version per-locale What's New
└── README.md         this file
```

Auth key path is hard-coded to `~/.appstoreconnect/AuthKey_QD85GLBAA2.p8`,
matching `mobile/scripts/asc_upload_screenshots.py`.
