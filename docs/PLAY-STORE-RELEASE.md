# Google Play Store release runbook

Mirror of the iOS release flow, adapted for Android + Play Console. Use
this each time you submit a new Sagely AAB. The iOS counterpart is the
EAS + ASC API key flow documented in `mobile/CLAUDE.md`.

## Current Play Store state (2026-05-20)

- **App package**: `com.websurfer.mytodo`
- **App version**: 1.3.0 (matches iOS; `versionCode: 1` in `mobile/app.json`)
- **Status**: not yet listed in Play Console — account-verification
  pending (Google requires hands-on test from a real Android device
  for new developer accounts)
- **AAB build**: ✅ Unblocked. Path B was taken in commit `302c1ac`:
  `react-native-reanimated@3.17.5` is patched via `patch-package`
  (`mobile/patches/react-native-reanimated+3.17.5.patch`), reapplied
  on every `npm install` / EAS build. `expo run:android` produces a
  working APK on Pixel_10 in ~32s. Old arch retained
  (`newArchEnabled: false`) for parity with iOS 1.3.0. See "Build
  pipeline" below for the patch contents and the deferred Path A
  cleanup.
- **Submit pipeline**: NOT wired in `eas.json`. First upload will be
  manual via Play Console until a Google Cloud service account is in
  place.
- **Listing copy**: source of truth in `docs/POSITIONING.md` →
  "Play Store metadata" section (English + zh/es/fr/de/ja short
  descriptions, tags, category, "What's new" v1.3.0 in 6 locales).
  Full descriptions reuse the App Store text in the same file.

## One-time setup (do before the first submission)

### 1. Developer account verification

Google requires every developer to verify identity for new accounts. As
of 2026, that includes:
- Government ID via Google's third-party verifier
- Sometimes: hands-on test from a real Android device (the verifier
  scans a QR code and asks you to install + launch the dev-test app)
- D-U-N-S number if registering as a company

Status check: log into the Play Console at <https://play.google.com/console>
and look for a "Verify your identity" banner.

### 2. Create the app listing in Play Console

- "Create app" → name "Sagely", default language English (United States),
  app or game = App, free or paid = Free, declarations checked
- App content: complete every section in the Console sidebar
  - **Privacy Policy URL**: <https://websurfer2015.github.io/my-todo/PRIVACY.html>
    (already published via GitHub Pages — see `docs/PRIVACY.md`)
  - **App access**: provide the demo login (same `sagely.todo@gmail.com`
    test account used for iOS review)
  - **Ads**: No ads
  - **Content rating**: complete the IARC questionnaire → expected
    rating "Everyone" since there's no UGC or harm content
  - **Target audience and content**: 13+ (no children's content)
  - **Data safety**: see "Data safety form" below — most demanding part
  - **Government apps**: No
  - **Financial features**: No

### 3. Service account for automated submission (optional but recommended)

To enable `eas submit --platform android`, set up a Google Cloud
service account with Play Console upload permissions:

1. Google Cloud Console → IAM & Admin → Service Accounts → Create
   - Name: `sagely-play-publisher`
   - Role: skip (granted in Play Console instead)
2. Generate a JSON key → download → save as
   `~/.googleplay/sagely-publisher.json` (do NOT commit)
3. Play Console → Setup → API access → link the Google Cloud project →
   grant the service account the "Release apps to production" and
   "Manage testing track" permissions for `com.websurfer.mytodo`
4. Wire it into `mobile/eas.json`:
   ```json
   "submit": {
     "production": {
       "android": {
         "serviceAccountKeyPath": "/Users/yingnming/.googleplay/sagely-publisher.json",
         "track": "internal"
       },
       "ios": { ... existing ... }
     }
   }
   ```

`track: "internal"` is the safest first-upload destination. You can
promote to closed/open testing or production from Play Console once the
AAB processes.

## Build pipeline — Path B in place (was the blocker)

The original blocker: `eas build --platform android --profile production`
aborted with three Java compile errors in
`react-native-reanimated@3.17.5` against RN 0.81. Path B was taken in
commit `302c1ac` to unblock Android without forcing a new-arch
migration on iOS in the same release.

### Path B (current, shipped) — old arch + `patch-package` on Reanimated 3.17.5

Implemented:
- `react-native-reanimated` pinned to `3.17.5` (was `~3.17.0`).
  Reanimated 4 requires `newArchEnabled` which we explicitly want to
  avoid until a dedicated migration cycle.
- `patch-package` + `postinstall-postinstall` added as devDependencies.
  `npm install` runs `patch-package` via `postinstall`, so the patch
  reapplies automatically on fresh installs and inside EAS builders.
- `mobile/patches/react-native-reanimated+3.17.5.patch` applies three
  targeted edits in
  `node_modules/react-native-reanimated/android/src/main/java/com/swmansion/reanimated/`:
  - `ReanimatedPackage.java` — swap `Systrace.TRACE_TAG_REACT_JAVA_BRIDGE`
    (removed in RN 0.81) for `Systrace.TRACE_TAG_REACT`, 2 sites
  - `BorderRadiiDrawableUtils.java` — adapt to RN 0.81's
    `LengthPercentage.resolve(Float): Float` signature; the old API
    returned a wrapper with `.toPixelFromDIP().getHorizontal()`, the
    new one returns a Float in DIP, so we convert via
    `PixelUtil.toPixelFromDIP()` to preserve the old semantics.
- `npx expo install --fix` realigned SDK 54 deps that had drifted
  (`expo-constants`, `expo-notifications`, `babel-preset-expo`,
  `expo-*` packages back to `~54.x.y` from a stray `55.x` cluster).

Verified: `expo run:android` produces a working APK on Pixel_10 in
~32s. Legacy-architecture deprecation warnings during the build are
expected and not a regression.

Brittle: any future Reanimated bump re-breaks the patch. Treat the
patch file as load-bearing infra, not docs noise. The remaining
permanent fix is Path A.

### Path A (deferred) — new-arch migration

For a future release cycle, retire the patch by migrating both
platforms to `newArchEnabled: true`:

- Set `newArchEnabled: true` in `mobile/app.json`
- Upgrade `react-native-reanimated` to `~4.1.x` and add
  `react-native-worklets@~0.5.x` as its peer
- `npx expo install --fix`
- `expo prebuild --clean` for both iOS and Android
- Test iOS thoroughly on new arch in the sim (gestures, sticky
  filters, sheets, Mochi pebble flight) before the next App Store
  build
- Test Android dev client end-to-end (sign-in, todos, groceries)

This is the path Expo SDK 54 expects long-term. The first attempt
during the v1.3 cycle worked locally for Android once Expo deps were
aligned. iOS hasn't been retested on new arch since the rollback.

## Data safety form — what Sagely declares

Sagely collects **only** the data Firebase Auth + Firestore need to
sync per-user state:

| Data category | Collected? | Why | Shared? | Optional? |
| --- | --- | --- | --- | --- |
| Name | Yes | First/last name from Apple, Google, or user input. Stored in profile doc. | No | Yes (can sign in via email-only path) |
| Email | Yes | Account identifier (Firebase Auth). | No | No |
| User IDs | Yes | Firebase auth UID. | No | No |
| App activity (in-app actions) | Yes | Todos, categories, groceries — all user content. | No | No |
| Photos | Yes (optional) | Avatar image upload. Stored as base64 in profile. | No | Yes |
| App info and performance (crash logs, diagnostics) | Yes | Firebase Crashlytics for unhandled errors + JS rejections (see `mobile/src/crashReporting.ts`). | No | No |

Encryption: data in transit is encrypted (HTTPS to Firebase). Data at
rest is encrypted by Firebase. Users can delete their account in-app
via Profile → Delete account, which removes their Firestore data and
auth record. Mark this in the "Data deletion" section of the form.

## Listing assets

Required:

| Asset | Spec | Status |
| --- | --- | --- |
| App icon | 512×512 PNG | Expo prebuild auto-generates from `mobile/assets/icon.png` (1024×1024 source) ✓ |
| Adaptive icon foreground | any safe-zone PNG | `mobile/assets/adaptive-icon.png` (1024×1024) ✓ |
| Feature graphic | **1024×500 JPG/PNG** | Generated via `python3 mobile/scripts/screenshots/generate_feature_graphic.py` → output at `mobile/screenshots/feature-graphic.png`. Composes brand-color bg + Mochi mascot + "Sagely" wordmark + tagline. Tweak the script's color/font constants to iterate. ✓ |
| Phone screenshots | 2-8 per language, portrait, 320–3840px per side | **Preferred (native)**: capture via `mobile/scripts/screenshots/capture-android.sh <slot 1-8> [adb-serial]` against a Pixel AVD or real device, then `python3 mobile/scripts/screenshots/process.py mobile/screenshots/android-phone` to copy through to `processed/`. **Fallback**: iPhone 6.7" set at `mobile/screenshots/iphone-67/processed/*.png` (1290×2796) — dimensionally valid but reads as iOS-on-Android. |
| 7" tablet screenshots | 2-8 per language, portrait, 320–3840px per side | **Required** by Play. Reuse the Android phone set at `mobile/screenshots/android-phone/processed/*.png` (1080×2424) — Play accepts them in all three device slots and scales to fit. True tablet-optimized shots are a v1.4+ polish item (requires creating a 7" tablet AVD via Android Studio → Device Manager). |
| 10" tablet screenshots | same | **Required** by Play. Same Android phone set as above. |

### Android screenshot capture flow

1. **Pre-capture device prep** (do once per session for a coherent set):
   - System clock to 9:41 (marketing convention — matches iOS Sagely shots)
   - Battery 100%, Wi-Fi connected, notifications cleared, airplane mode off
   - Gesture navigation enabled (no on-screen back/home pill cluttering the bottom)
   - Sagely dev client running with humane seeded data signed into `sagely.todo@gmail.com` — sample data IS marketing
2. **Capture each slot** (1..8 match the same v1.3 narrative as the iOS set):
   ```sh
   cd mobile
   for n in 1 2 3 4 5 6 7 8; do
     ./scripts/screenshots/capture-android.sh "$n"
     # ... navigate the app to the next slot's screen ...
   done
   ```
   Raw PNGs land in `mobile/screenshots/android-phone/raw/<slot>-<name>.png` at the device's native resolution (Pixel 7-10 family: 1080×2400, 1080×2424, 1280×2856, or 1344×2992 — all pass through `process.py` unmodified).
3. **Process into Play-ready folder**:
   ```sh
   python3 mobile/scripts/screenshots/process.py mobile/screenshots/android-phone
   ```
   Pass-through copies to `processed/`. Sizes outside Play's 320–3840px-per-side bounds get flagged but still copied so you can decide.
4. **Upload** `mobile/screenshots/android-phone/processed/*.png` to Play Console → Store listing → Phone screenshots.

Slot plan canonical in `mobile/scripts/screenshots/capture-android.sh` and `mobile/scripts/screenshots/capture.sh` (they share the same 1..8 mapping).

Listing copy lives in `docs/POSITIONING.md`:
- App Store + Play Store metadata are deliberately aligned where the
  fields overlap (Full description, localized descriptions).
- Play-specific fields (Short description ≤80 chars, Tags, Category,
  "What's new" ≤500 chars) live in their own
  "Play Store metadata" section, with English + zh-Hans/es/fr/de/ja
  variants for short descriptions and v1.3.0 "What's new."
- ASC-length "What's new" copy (≤4000 chars, used by ASC's release
  notes field) lives in `mobile/scripts/asc/whats_new.json` and is too
  long to paste into Play. The Play-sized variants in
  `docs/POSITIONING.md` are the ones to paste into Play Console for
  v1.3.0; future versions should copy that pattern into a
  `mobile/scripts/play/whats_new.json` once submission is automated.

## Releasing a new version

Once the one-time setup is done AND the build pipeline is unblocked:

```sh
# from mobile/
eas build --platform android --profile production
# wait for the AAB build link, then either:
eas submit --platform android --latest         # if eas.json submit is wired
# or download the .aab and upload manually via Play Console → Releases
```

EAS bumps `versionCode` automatically because `autoIncrement: true` and
`appVersionSource: remote`. Don't bump `versionCode` in `app.json`.

After the AAB is processed (Play takes ~30 min to a few hours):
- Internal testing track: visible to up to 100 invited testers
- Closed/open testing: broader rollout, still gated
- Production: full release; Play also adds a manual review step

## What's actually ready right now

- ✅ Build pipeline — `expo run:android` produces a working APK on
  Pixel_10 in ~32s via Path B (see "Build pipeline" above)
- ✅ Feature graphic (1024×500) — generated via
  `mobile/scripts/screenshots/generate_feature_graphic.py`, output at
  `mobile/screenshots/feature-graphic.png`
- ✅ `app.json` android config (package, `googleServicesFile`, blocked
  permissions, edge-to-edge)
- ✅ Firebase android config (`google-services.json`) refreshed with
  the production keystore SHA-1 (commit `d2e5da9`) so Google Sign-In
  works in both dev and EAS-signed prod builds
- ✅ Privacy policy live at GitHub Pages URL
- ✅ Phone + tablet screenshots captured at the right resolutions
- ✅ Data-safety questionnaire answers drafted (above table)
- ✅ Store listing copy + tags + "What's new" v1.3.0 in 6 locales —
  `docs/POSITIONING.md` § "Play Store metadata"
- ❌ Service account JSON for `eas submit android` (manual upload via
  Play Console is fine for the first submission)
- ❌ Play Console listing itself (not created)
- ❌ Developer account verification step (real-device hands-on test
  blocking)

Note: localized listing slots in Play Console **do not** require a
manual "Manage translations" click — the Play Developer API's
`edits.listings.update` (used by `mobile/scripts/play/play_release.py
set-listings`) has create-or-update semantics, so locale slots
materialize the first time content is pushed to them.

## After publishing

- Crashlytics dashboard at <https://console.firebase.google.com/project/_/crashlytics>
  for unhandled errors (separate from Play Console's native crash stats)
- Play Console "App quality" → "Vitals" shows ANRs, crash-free rate,
  startup time — Sagely's targets: crash-free ≥ 99.5%, ANR-free ≥ 99.7%
- Review responses: Play Console → Ratings & reviews. Reply within 48h
  for negative reviews (Play surfaces response rate in store listing
  trust signals)
