# Privacy Policy

_Last updated: 2026-05-23_

This policy explains what **Todos for Everyone** ("the app") collects, how it's used,
and your choices. The app is offered on iOS, Android, and the web.

## What we collect

We collect only what's needed to make the app work.

| Data | When collected | Why |
|---|---|---|
| **Email address** | When you create an account | To identify your account and let you sign in |
| **Password (hashed)** | When you create an account | Authentication. We never see or store your raw password — Firebase Authentication handles this. |
| **Apple ID identifier** | If you use Sign in with Apple (iOS) | Authentication only |
| **Your todos, categories, and profile** (name, optional quote, optional photo, language preference) | While using the app | To sync your data across your devices |
| **Profile photo** (optional) | If you choose to set one | Stored as an image you uploaded; never shared |
| **AI assistance turns** (optional) | Only when you enable AI assistance and send a turn to Mochi | Processed by Anthropic to draft a reply or suggested actions. Off by default. |

We do **not** collect:
- Location
- Contacts
- Health or fitness data
- Advertising identifiers (IDFA, GAID)
- Analytics on your in-app behavior
- Any data that would identify you beyond your account email

## Where data is stored

- **Authentication**: [Firebase Authentication](https://firebase.google.com/docs/auth) (Google).
- **Your todos and profile**: [Cloud Firestore](https://firebase.google.com/docs/firestore) (Google), encrypted in transit and at rest.
- Servers are operated by Google. Data is segmented per user — only you can read or write your own data, enforced by Firestore security rules.
- A copy of your data is also cached on your device (localStorage on web, AsyncStorage on mobile) so the app works offline.

## AI assistance (optional, off by default)

Sagely includes an optional AI helper called Mochi, powered by Anthropic's
Claude models. AI assistance is **off by default**. You can turn it on or off
at any time from your profile settings.

When it's on, the following happens **only when you initiate a turn** (e.g.
asking Mochi to draft a to-do or break a task into steps):

- The text of that turn is sent to a Sagely Cloud Function, which forwards it
  to Anthropic for processing.
- A small amount of context is sent alongside the turn: today's date and the
  list of your category names. **Your full to-do history is never sent.**
- Anthropic processes the turn and returns a reply or a set of suggested
  actions. You review and confirm before anything is changed.
- Per Anthropic's API terms, prompts and completions sent through the API
  are not used to train Claude.

We do not log the content of turns server-side. We do record the number of
turns per day per account for rate-limiting (a daily cap protects against
runaway costs).

## Photo library and camera access

If you choose to set a profile photo, the app asks for access to your photo
library, or the camera if you choose to take a new photo. The selected image
is uploaded to Firestore as part of your profile, only visible to you, and
only used as your in-app avatar. We don't access any other photos and we
don't read EXIF metadata.

## What we share

**Nothing without your action.** We do not sell, rent, or share your data
with third parties. We use two service providers acting on our behalf:

- **Google** (Firebase Authentication, Cloud Firestore) — hosts your
  authentication and data.
- **Anthropic** (Claude) — processes a single turn at a time, only when you
  have enabled AI assistance and sent a turn to Mochi. See the AI assistance
  section above for what's included in each turn.

## Your rights

You can:
- **Delete your account** by signing in and choosing _Delete account_ in your
  profile, or by emailing us at the address below. Deletion permanently
  removes your todos, categories, and profile from our servers.
- **Export your data** by emailing us at the address below.
- **Stop using the app** at any time. Uninstalling deletes the local cache;
  to also delete cloud data, use Delete account first.

If you live in the EU/EEA, UK, or California, you have additional rights
under GDPR / UK GDPR / CCPA, including the right to access, correct, or
delete your data, and the right to object to processing. Contact us at the
address below to exercise these rights.

## Children

The app is not directed at children under 13 (or the age required by your
local law). We do not knowingly collect data from children. If you believe a
child has created an account, contact us and we'll remove it.

## Changes

If we change this policy, we'll update the "Last updated" date. Material
changes will be announced in-app on next sign-in.

## Contact

Questions or requests: **yingqin@comcast.net**
