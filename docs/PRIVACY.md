# Sagely — Privacy Policy

**Last updated**: May 16, 2026

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

- We do not run any third-party analytics SDKs that track your behavior
  across apps.
- We do not run ads.
- We do not share, sell, or rent your data to anyone.
- We do not have a marketing email list. You will not receive promotional
  email from us.
- We do not use your data to train AI models.
- We do not collect your location.
- We do not collect contacts, photos, calendars, or anything from elsewhere
  on your device.

---

## Where your data lives

Your data is stored in Google's Firebase platform (Firebase Authentication
+ Firestore + Crashlytics). Firebase is operated by Google LLC and is
covered by [Google's privacy policy](https://policies.google.com/privacy).
Firebase servers are located primarily in the United States.

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

- All to-dos and categories in Firestore
- Your profile document in Firestore
- Your Firebase Authentication account itself

This is irreversible. There is no 30-day grace period for account deletion
(unlike the in-app 30-day bin for individual to-dos).

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
| Apple Sign In (Apple Inc.) | Optional sign-in provider | https://www.apple.com/legal/privacy/en-ww/ |
| Google Sign-In (Google LLC) | Optional sign-in provider | https://policies.google.com/privacy |
| Expo Application Services (Expo, Inc.) | Builds the app + delivers over-the-air updates | https://expo.dev/privacy |
| Apple App Store (Apple Inc.) | Distributes the app to you | https://www.apple.com/legal/privacy/en-ww/ |

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
