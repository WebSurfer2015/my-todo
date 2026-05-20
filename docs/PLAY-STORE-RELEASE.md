# Google Play Store release runbook

Mirror of the iOS release flow, adapted for Android + Play Console. Use
this each time you submit a new Sagely AAB. The iOS counterpart is the
EAS + ASC API key flow documented in `mobile/CLAUDE.md`.

## Current Play Store state (2026-05-20)

- **App package**: `com.websurfer.mytodo`
- **Status**: not yet listed in Play Console (account-verification
  pending — Google requires hands-on test from a real Android device
  for new developer accounts)
- **AAB build**: BLOCKED on Android. `react-native-reanimated@3.17.5`
  fails to compile against RN 0.81 with three Java errors
  (`LengthPercentage.resolve` signature change + two removed
  `Systrace.TRACE_TAG_REACT_JAVA_BRIDGE` references in the
  Reanimated source). Reanimated 4.x fixes them but requires
  `newArchEnabled: true`. iOS 1.3.0 shipped with `newArchEnabled:
  false`. Two unblock paths in "Build pipeline" below.
- **Submit pipeline**: NOT wired in `eas.json`. Uploads are manual until
  a Google Cloud service account is in place.

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

## Build pipeline — current blocker

`eas build --platform android --profile production` aborts with three
Java compile errors in `react-native-reanimated@3.17.5` against
RN 0.81. The two unblock paths:

### Path A — enable the new architecture across the codebase

- Set `newArchEnabled: true` in `app.json`
- Upgrade `react-native-reanimated` to `~4.1.x` and install
  `react-native-worklets@~0.5.x` as its peer
- Bump `expo-constants` + `expo-notifications` to SDK-54-aligned
  versions via `npx expo install --fix`
- `expo prebuild --clean` for both iOS and Android
- Test iOS thoroughly on new arch in the sim (gestures, sticky
  filters, sheets, Mochi flight) before the next App Store build
- Test Android dev client end-to-end (sign-in, todos, groceries)

This is the path Expo SDK 54 expects long-term. The first attempt
during the v1.3 cycle worked locally for Android once Expo deps were
aligned. iOS hasn't been retested on new arch since the rollback.

### Path B — stay on old arch by patching Reanimated 3.17.5

- Use `patch-package` to apply three targeted edits in
  `node_modules/react-native-reanimated/android/src/main/java/com/swmansion/reanimated/`:
  - `ReanimatedPackage.java` — replace `Systrace.beginSection(
    Systrace.TRACE_TAG_REACT_JAVA_BRIDGE, ...)` with the no-tag
    overload (removed in RN 0.81)
  - `BorderRadiiDrawableUtils.java` — adapt the
    `LengthPercentage.resolve(width, height)` call to the single-arg
    form
- Commit the patch file under `mobile/patches/` so the patch survives
  `npm install`
- Brittle: any future Reanimated bump re-breaks. Buys time but isn't
  a long-term home.

Recommendation: Path A on the next release cycle. Stay on the iOS-only
1.3.0 release until Android is ready.

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
| Phone screenshots | 2-8 per language, 9:16 to 16:9, 320–3840px per side | Reuse iPhone 6.7" captures at `mobile/screenshots/iphone-67/processed/*.png` (1290×2796) ✓ |
| 7" tablet screenshots | 1-8, same constraints | Optional; reuse iPad captures at `mobile/screenshots/ipad-129/processed/*.png` (2048×2732) ✓ |
| 10" tablet screenshots | 1-8, same constraints | Same iPad set ✓ |

Localized listing copy lives in `docs/POSITIONING.md`. Reuse those
strings — the App Store and Play Store text are deliberately aligned.

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

- ✅ app.json android config (package, googleServicesFile, blocked
  permissions, edge-to-edge)
- ✅ Firebase android config (`google-services.json`) present and
  pointing at the right project
- ✅ Privacy policy live at GitHub Pages URL
- ✅ Phone + tablet screenshots captured at the right resolutions
- ✅ Data-safety questionnaire answers drafted (above table)
- ✅ Listing copy in `docs/POSITIONING.md` and `docs/release_copy.json`-
  adjacent files
- ❌ Build pipeline (reanimated incompat, see Path A/B)
- ❌ Feature graphic (1024×500) — needs design
- ❌ Service account JSON for `eas submit android`
- ❌ Play Console listing itself (not created)
- ❌ Developer account verification step

## After publishing

- Crashlytics dashboard at <https://console.firebase.google.com/project/_/crashlytics>
  for unhandled errors (separate from Play Console's native crash stats)
- Play Console "App quality" → "Vitals" shows ANRs, crash-free rate,
  startup time — Sagely's targets: crash-free ≥ 99.5%, ANR-free ≥ 99.7%
- Review responses: Play Console → Ratings & reviews. Reply within 48h
  for negative reviews (Play surfaces response rate in store listing
  trust signals)
