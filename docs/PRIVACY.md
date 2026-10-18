# Sagely — Privacy Policy

**Last updated**: October 17, 2026

This policy describes what Sagely does with your data, who has access to it,
and what choices you have. We've tried to keep it short and plain.

If anything here is unclear, write to: **yingqin@comcast.net**.

---

## Who we are

Sagely is built by Ying Qin (sole developer). The app helps you manage your
own to-do list. There is no marketing team, no analytics team, and no ad
network. It's just one person and your tasks.

---

## What data we collect, and why

Sagely collects only what's needed to make the app work for you across your
devices.

### When you create an account

| Data | Why | Where it's stored |
| --- | --- | --- |
| Email address | To sign you in | Firebase Authentication |
| Display name (optional) | To greet you ("Good morning, Ying") | Firebase Firestore, your private subtree |
| Apple/Google ID token | To verify your identity with Apple/Google when signing in | Not stored by us — passed directly to Firebase Auth |

### When you use the app

| Data | Why | Where it's stored |
| --- | --- | --- |
| Your to-dos and steps | The whole point of the app | Firebase Firestore, your private subtree |
| Categories (custom + default) | To organize your to-dos | Firebase Firestore, your private subtree |
| Profile settings (theme, daily check-in time, etc.) | To remember your preferences | Firebase Firestore, your private subtree |
| Pebble counts (your daily completion tally) | To show your cairn progress | Firebase Firestore, your private subtree |
| Optional avatar image you upload | To personalize the app | Firebase Firestore, your private subtree (compressed) |

### When you use Mochi (the AI assistant)

Mochi is optional. When you send Mochi a message, or ask it to fill in or
break down a task, the app sends what that request needs to **Anthropic**
(the company that makes the Claude AI model) through our server:

| Data | Why | Where it goes |
| --- | --- | --- |
| Your message and the conversation so far | So Mochi can understand and reply | Sent to Anthropic for that request |
| Today's date, your category names, the text of your to-dos (open and in the bin, up to 100), your shopping-list items and store names | So Mochi can find, add, or change the right items ("move the dentist to Friday") | Sent to Anthropic for that request |
| How many Mochi requests you've made | To keep a fair-use limit on AI costs | Firebase Firestore, your private subtree |

- We do **not** send your name, email, or account ID to Anthropic.
- We do not save your Mochi conversations, on our servers or in your account.
- Anthropic processes this data on our behalf under its commercial terms,
  which do not allow it to train its models on this data. Anthropic deletes
  it within 30 days; if a request is flagged under Anthropic's Usage Policy, it
  may be kept for up to 2 years for safety review. See
  [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy).
- If you never use Mochi, nothing is sent to Anthropic.

### When you subscribe

Purchases are handled by Apple through the App Store. **We never see your
payment card or billing details.** We use **RevenueCat** to manage
subscriptions:

| Data | Why | Where it's stored |
| --- | --- | --- |
| Your account ID (a random identifier, not your email) | To link your subscription to your account across devices | RevenueCat |
| Purchase and subscription status (plan, start/renewal/expiry dates, trial, refunds), as reported by Apple | To unlock Premium and keep it in sync | RevenueCat, plus your plan and expiry date in Firebase Firestore, your private subtree |
| Basic device and app info (app version, OS version, device model, language, App Store country and currency) | To show the correct price and handle the purchase | RevenueCat |
| A device identifier Apple assigns per app developer ("identifier for vendor"). **Not** the advertising identifier — Sagely doesn't use that | To recognize your device when restoring or syncing purchases | RevenueCat |

### Simple usage dates

| Data | Why | Where it's stored |
| --- | --- | --- |
| The date your account was first used, the date you last opened the app, and the date you first completed a to-do | So we can count, **in aggregate only**, how many people keep using Sagely (e.g. "how many people opened the app this week") | Firebase Firestore, your private subtree (a small separate record, not your profile) |

That's the whole list: three dates stored with your account. They are never sold,
shared, or used for ads, and we never look at one person's dates to study how
they use the app. We do **not** record which screens you visit or what you
tap.

### Diagnostics

| Data | Why | Where it's stored |
| --- | --- | --- |
| Crash reports | To fix bugs we'd otherwise never know about | Firebase Crashlytics |
| JavaScript errors caught by the in-app error boundary | Same | Firebase Crashlytics |

Crash reports include the device model, OS version, and a stack trace of
where the crash happened. They do **not** include the contents of your
to-dos or any text you've written.

---

## What we do NOT collect

- We do not use any analytics or advertising SDKs (no Google Analytics /
  Firebase Analytics, no ad trackers). We don't log what you tap or which
  screens you visit, and we don't track you across apps or websites.
- We do not run ads.
- We do not share, sell, or rent your data to anyone.
- We do not have a marketing email list. You will not receive promotional
  email from us.
- We do not use your data to train AI models, and neither does Anthropic
  (see "When you use Mochi" above).
- We do not collect your location.
- We do not collect contacts, photos, calendars, or anything from elsewhere
  on your device.

---

## Where your data lives

Your data is stored in Google's Firebase platform (Firebase Authentication
+ Firestore + Crashlytics). Firebase is operated by Google LLC and is
covered by [Google's privacy policy](https://policies.google.com/privacy).
Firebase servers are located primarily in the United States. Mochi requests
are processed by Anthropic and subscription records by RevenueCat, both in the
United States.

**Access is restricted to you.** Firestore security rules (visible in this
project's source repository) enforce that only a user signed in with a
specific Firebase user ID (`uid`) can read or write data under their own
subtree (`users/{uid}/...`). Ying Qin, as the developer, technically has
administrative access to Firebase for debugging, but does not read user
data as a routine practice.

---

## Your choices

### Export your data

The app has an "Export my data" button in Profile → Privacy. It produces a
JSON file containing every to-do, category, and profile setting on your
account. You can save this anywhere.

### Delete your account

Profile → Privacy → "Delete account" wipes everything:

- Your Firebase Authentication account
- Everything stored under your account in Firestore: to-dos, categories,
  shopping list, profile, usage dates, Mochi usage counts, and your
  subscription status

This is irreversible. There is no 30-day grace period for account deletion
(unlike the in-app 30-day bin for individual to-dos).

**Deleting your account does not cancel a subscription.** Cancel it first in
iOS Settings → your name → Subscriptions. Apple and RevenueCat keep records
of past purchases as required for billing, tax, and refunds, under their own
privacy policies.

### Sign out

Sign out from Profile. Your data stays in the cloud; your local cache on
this device is cleared so the next user signing in on this device sees a
clean state.

### Skip cloud sync (signed-out mode)

If you don't sign in, your data stays on the device only (in the iOS local
storage). It's not sent anywhere. The trade-off is that it doesn't sync
across devices.

---

## Children

Sagely is intended for adults managing their own tasks. We do not knowingly
collect data from children under 13 (or the equivalent minimum age in your
jurisdiction). If you believe a child has used Sagely with a real email
account, contact us at the email above and we'll delete the account.

---

## Your rights (GDPR, CCPA, and similar)

You have the right to:

- **Access** the data we hold about you (use the in-app Export).
- **Correct** any inaccurate data (edit it in the app, or ask us).
- **Delete** your data (use the in-app Delete Account, or ask us).
- **Portability** of your data (use the in-app Export — it's standard JSON).
- **Object** to processing (sign out and stop using the app).
- **Lodge a complaint** with a supervisory authority in your country.

Because we don't run marketing or do automated decision-making, several
typical GDPR articles (right to opt out of marketing, right to object to
automated profiling, etc.) don't have anything to apply to here. There is
none of that.

---

## Sub-processors

Sagely uses these third-party services to deliver the app:

| Service | What it does | Their policy |
| --- | --- | --- |
| Firebase Authentication (Google LLC) | Verifies your sign-in | https://policies.google.com/privacy |
| Cloud Firestore (Google LLC) | Stores your to-dos and settings | https://policies.google.com/privacy |
| Firebase Crashlytics (Google LLC) | Collects crash reports | https://policies.google.com/privacy |
| Cloud Functions for Firebase (Google LLC) | Runs our server code (Mochi requests, subscription updates) | https://policies.google.com/privacy |
| Anthropic, PBC | Powers Mochi, the optional AI assistant | https://www.anthropic.com/legal/privacy |
| RevenueCat, Inc. | Manages subscriptions and purchase status | https://www.revenuecat.com/privacy |
| Apple Sign In (Apple Inc.) | Optional sign-in provider | https://www.apple.com/legal/privacy/en-ww/ |
| Google Sign-In (Google LLC) | Optional sign-in provider | https://policies.google.com/privacy |
| Expo Application Services (Expo, Inc.) | Builds the app + delivers over-the-air updates | https://expo.dev/privacy |
| Apple App Store (Apple Inc.) | Distributes the app and processes in-app purchases | https://www.apple.com/legal/privacy/en-ww/ |

---

## Changes to this policy

If we change this policy, the "Last updated" date at the top will change.
Material changes (new data we collect, new sub-processors, new sharing
practices) will be announced in the app's release notes for the next
version, so you can decide whether to keep using the app.

---

## Contact

Questions, requests, complaints, or a polite "hi":

**Ying Qin** — yingqin@comcast.net
