# App Store privacy label — Sagely v2.0.0

Source of truth for **App Store Connect → App Privacy** (the "nutrition label"),
derived from the code on `dev` on 2026-10-18 and matching `docs/PRIVACY.md`.
Update this file whenever data collection changes, then re-enter it in ASC.

> **Why manual:** the App Store Connect API has no endpoint for App Privacy
> answers (our `mobile/scripts/asc/asc_release.py` can only set the privacy
> policy *URL*). Enter these in the ASC web UI with your Apple ID.

> **When:** the label is **app-level, not version-level** — "Publish" makes it
> live immediately for the version already in the store. Publishing the v2.0.0
> answers now is fine: they're a superset of what the live app collects
> (over-disclosure is allowed; under-disclosure is the review problem). Mochi →
> Anthropic is likely already live, so the current label may be under-disclosing.

## Where
App Store Connect → **Apps → Sagely → App Privacy** (left sidebar, under
"General") → **Edit** next to Data Types → tick the types below → **Next** →
answer each type → **Publish**.
Privacy Policy URL on the same page: `https://websurfer2015.github.io/my-todo/PRIVACY.html`

## Top-level answers
- **Do you or your third-party partners collect data from this app?** → **Yes**
- **Tracking** (used to track users across other companies' apps/websites, or
  shared with data brokers)? → **No, for every data type.** No ad SDKs, no
  analytics SDK, no data sold/shared for ads.

## Data types to tick

| ASC category → type | Why we collect it (code) | Linked to the user? | Used for tracking? | Purposes to tick |
|---|---|---|---|---|
| **Contact Info → Email Address** | Firebase Auth sign-in (email / Apple / Google) | **Yes** | No | App Functionality |
| **Contact Info → Name** | Optional display name in the profile (greeting); Apple/Google provide it on first sign-in | **Yes** | No | App Functionality |
| **User Content → Photos or Videos** | Optional avatar, picked from the library or camera, compressed and stored in Firestore | **Yes** | No | App Functionality |
| **User Content → Other User Content** | To-dos, steps, categories, shopping list, stores, and Mochi messages (sent to **Anthropic** to process each Mochi request) | **Yes** | No | App Functionality |
| **Identifiers → User ID** | Firebase uid; also sent to **RevenueCat** as the subscriber id | **Yes** | No | App Functionality |
| **Identifiers → Device ID** | **RevenueCat sends the IDFV** (identifier for vendor) on every request — verified in the SDK (`HTTPClient.swift`: `X-Apple-Device-Identifier`). No IDFA (no AdSupport / ATT). No push token is collected — all notifications are local | **Yes** | No | App Functionality |
| **Purchases → Purchase History** | Subscription status/plan/expiry via **RevenueCat** (Apple processes payment — we never see card details) | **Yes** | No | App Functionality |
| **Usage Data → Product Interaction** | Three dates — first use, last app open/foreground, first completed to-do — in `users/{uid}/state/signals`, counted **in aggregate only** by `metricsRollup` | **Yes** (stored under the account) | No | **Analytics** |
| **Diagnostics → Crash Data** | Firebase Crashlytics native crashes | **No** (Crashlytics never gets a user id) | No | App Functionality |
| **Diagnostics → Other Diagnostic Data** | JS errors / unhandled rejections forwarded to Crashlytics (stack traces, device model, OS) | **No** | No | App Functionality |

## Do NOT tick (not collected)
Health & Fitness · Financial Info (payment is Apple's; we only get subscription
status) · Location · Sensitive Info · Contacts · Emails or Text Messages ·
Audio Data (microphone disabled) · Gameplay Content · Customer Support ·
Browsing History · Search History · Advertising Data · Other Usage Data ·
Performance Data · Physical Address · Phone Number · Other Contact Info ·
Credit Info · Other Financial Info.

## Notes / judgment calls
- **Linked vs not linked:** anything stored under `users/{uid}` is linked
  (it's tied to the account). Crashlytics reports carry no user id → not linked.
- **Usage Data → Analytics:** the dates are stored per account, so "linked" is
  the honest answer even though only aggregate counts are ever read
  (`metrics/{day}`, no uids). Don't tick "Product Personalization".
- **Device ID is required, not optional:** RevenueCat's iOS SDK sends the IDFV
  with every request (verified 2026-10-18 in `Pods/RevenueCat`). Keep it
  ticked. (No push token is collected — notifications are all local.)
- **Third-party SDKs count as "you":** Anthropic (via our Cloud Function),
  RevenueCat, Firebase (Auth/Firestore/Crashlytics), Google Sign-In, Sign in
  with Apple — all covered by the rows above.
- **Google Play Data safety** asks the same questions in different words; reuse
  this table (Play: "collected" + "shared" with Anthropic/RevenueCat as service
  providers, "encrypted in transit", "users can request deletion" → yes, in-app).
