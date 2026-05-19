# Sign-in recovery runbook

When Apple or Google sign-in starts failing in the Sagely mobile app, this
is the playbook. The most common cause is a stale Firebase config file
shipped inside the installed `.app` bundle — every time it has happened so
far, the root cause was that `mobile/GoogleService-Info.plist` got
re-downloaded but the iOS/Android build artifacts were never re-synced and
re-built, so the running app kept booting with an expired API key.

## Symptoms

| What the user sees | Likely cause |
| --- | --- |
| Red banner: `Google sign-in handshake failed. The OAuth web client ID in this build doesn't match what Firebase expects. (auth/internal-error)` | Stale `GoogleService-Info.plist` in the build (expired API key), OR `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / hardcoded fallback in `AuthContext.tsx` no longer matches Firebase Console |
| Red banner: `Apple sign-in handshake failed. The Apple Service ID or Sign-in-with-Apple key in Firebase Console may be out of sync. (auth/internal-error)` | Apple Service ID, App ID, Team ID, or Sign-in-with-Apple `.p8` key in Firebase Console no longer matches what Apple has, OR same stale-plist scenario |
| `Sign-in is misconfigured for this build. (auth/invalid-api-key)` | API key was rotated; build needs a re-sync from the current plist |
| `This sign-in method is currently disabled. (auth/operation-not-allowed)` | The provider (Apple or Google) is turned off in Firebase Console → Authentication → Sign-in method |
| `Apple Sign-In is not available. Sign in to iCloud on this device and try again. (1000)` | Simulator has no iCloud account — not an app bug; sign into iCloud in Settings |

If the user reports a different message, the error mapper in
`mobile/src/authErrors.ts` will surface the raw Firebase/Apple/Google code
in parens — that code is the source of truth for diagnosis.

## Prevention rules

1. **Never delete the iOS App or Android App registration in Firebase
   Console.** Deleting and re-creating invalidates the API key for the old
   one, breaks every installed build, and forces a re-download cycle.
2. **After replacing any Firebase config file, always run
   `npm run check:firebase` from `mobile/` before rebuilding.** It probes
   every key against Identity Toolkit and flags root↔build drift.
3. **After replacing `mobile/GoogleService-Info.plist`, always do a clean
   `npm run ios` (or `npm run android`).** A hot reload won't re-init
   Firebase native — the new key only takes effect on app launch from a
   freshly built bundle.
4. **If you must rotate a key**, schedule the user-facing rebuild + reinstall
   first; the old API key dies the moment a new one is generated, so any
   installed build with the old key is bricked until updated.

## Files that must stay in sync

| Purpose | Path |
| --- | --- |
| iOS source of truth (what Expo reads at prebuild) | `mobile/GoogleService-Info.plist` |
| iOS build artifact (what Xcode bundles into `.app`) | `mobile/ios/TodosforEveryone/GoogleService-Info.plist` |
| Android source of truth | `mobile/google-services.json` |
| Android build artifact | `mobile/android/app/google-services.json` |
| Google OAuth web client ID (hardcoded) | `mobile/src/AuthContext.tsx:92-94` |
| Google OAuth iOS client ID (hardcoded) | `mobile/src/AuthContext.tsx:95-96` |
| iOS URL scheme for Google redirect | `mobile/ios/TodosforEveryone/Info.plist` → `CFBundleURLTypes` (`com.googleusercontent.apps.<REVERSED_CLIENT_ID>`) |
| Firebase project ID, bundle ID | `mobile/app.json` → `expo.ios.bundleIdentifier`, `expo.android.package` |

The four config files in the top half are *paired*: root vs build. Both
plists must contain the same `API_KEY` and `CLIENT_ID`; both JSON files
must contain the same `current_key` and `oauth_client.client_id`. The
check script verifies this.

## Recovery procedure

Run from `mobile/` unless otherwise noted.

1. **Diagnose.** Reproduce the failure, read the red banner. If the code
   is anything other than `auth/internal-error` or `auth/invalid-api-key`,
   jump to the matching row in *Symptoms* — the runbook below is for the
   stale-config case.

2. **Inspect the bundled API key.** This confirms whether the build is
   shipping an expired key:

   ```sh
   APP=$(find ~/Library/Developer/CoreSimulator/Devices -name "Sagely.app" -path "*/Bundle/Application/*" 2>/dev/null | head -1)
   /usr/libexec/PlistBuddy -c "Print :API_KEY" "$APP/GoogleService-Info.plist"
   ```

   Then test it:

   ```sh
   curl -sS -w "\nHTTP %{http_code}\n" \
     "https://identitytoolkit.googleapis.com/v1/recaptchaParams?key=<PASTE_KEY>"
   ```

   - `HTTP 200` with a `recaptchaSiteKey` → key is live; problem is elsewhere
     (check Apple Service ID, OAuth client ID, or `auth/operation-not-allowed`).
   - `HTTP 400` with `"API key expired"` or `API_KEY_INVALID` → confirmed
     stale; continue.

3. **Re-download the current plist (only if it's actually rotated).** If
   `mobile/GoogleService-Info.plist` itself contains an expired key, fetch
   a fresh copy:

   - Firebase Console → Project Settings → Your apps → iOS app
     (`com.websurfer.mytodo`) → `GoogleService-Info.plist` button.
   - Save it as `mobile/GoogleService-Info.plist`, overwriting the old one.
   - Do the same for Android (`google-services.json`) if Android is also
     broken.

   If the root plist already has the live key (most common — the May 2026
   incident was exactly this), skip this step.

4. **Sync the build artifacts.**

   ```sh
   cp mobile/GoogleService-Info.plist mobile/ios/TodosforEveryone/GoogleService-Info.plist
   cp mobile/google-services.json mobile/android/app/google-services.json
   ```

   (Or run `npx expo prebuild --platform ios --no-install` —
   it does the same copy under the hood but also regenerates other native
   project state. Pure `cp` is faster and safer for a hotfix.)

5. **Verify with the check script.**

   ```sh
   cd mobile
   npm run check:firebase
   ```

   It must report **`Firebase config OK.`** before you continue. If it
   reports an `OAuth client_id drift`, your hardcoded values in
   `src/AuthContext.tsx` and the live Firebase Console settings don't
   match — go fix those before rebuilding.

6. **Rebuild and reinstall.**

   ```sh
   npm run ios     # or 'npm run android'
   ```

   `expo run:ios` runs prebuild → xcodebuild → installs and launches.
   When it launches, Firebase native re-reads the now-fresh plist.

7. **Hotfix variant (faster, lasts until the next reinstall).** If the
   user is unblocked-now-rebuild-later, you can hot-patch the installed
   app bundle without a full Xcode build:

   ```sh
   APP=$(find ~/Library/Developer/CoreSimulator/Devices -name "Sagely.app" -path "*/Bundle/Application/*" 2>/dev/null | head -1)
   cp mobile/GoogleService-Info.plist "$APP/GoogleService-Info.plist"
   xcrun simctl terminate booted com.websurfer.mytodo
   xcrun simctl launch booted com.websurfer.mytodo
   ```

   The next `npm run ios` (or any clean install) overwrites this, so the
   permanent fix in step 6 is still required.

8. **Verify in the app.** Tap Apple sign-in and Google sign-in. Both
   should complete and land on the Home tab. The error banner from step 1
   should not return.

## Production builds

The same drift applies to EAS production builds — `mobile/eas.json`
profiles use the repo-root `GoogleService-Info.plist` via the
`googleServicesFile` path in `app.json`. If sign-in breaks for App Store
users:

1. Confirm `mobile/GoogleService-Info.plist` has a live key (`npm run check:firebase`).
2. `git commit` the synced files (the build artifact in
   `mobile/ios/TodosforEveryone/` should be in sync with the root).
3. `eas build --platform ios --profile production --auto-submit` produces
   a new build that ships with the live key. There is no way to remote-patch
   an installed App Store build's config — the rotation requires a new
   release.

This is why **prevention rule 1** matters so much. Never delete the iOS
App in Firebase Console; the resulting API-key rotation hard-bricks every
installed build until users update.

## What changed on 2026-05-19 (the incident this doc was created for)

- `mobile/GoogleService-Info.plist` was refreshed 2026-05-18 with key
  `AIzaSyD9FQ...`, but `mobile/ios/TodosforEveryone/GoogleService-Info.plist`
  was last touched 2026-05-15 with key `AIzaSyBJatu...`.
- That stale plist was bundled into `Sagely.app`, so Firebase native
  init at app launch used the expired key.
- `signInWithCredential` → Identity Toolkit → `API_KEY_INVALID`, surfaced
  as `auth/internal-error` because the underlying error wasn't mapped.
- Fixed by syncing the build artifact + installed-bundle plist, then
  shipping `mobile/src/authErrors.ts` so the next time this happens the
  banner names the specific provider and code.
