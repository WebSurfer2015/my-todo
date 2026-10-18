# Measurement Plan — privacy-preserving (re-scoped P0)

Replaces "turn Firebase Analytics on." Firebase/Google Analytics is a
third-party behavioral SDK; enabling it would contradict `docs/PRIVACY.md`
("We do not run any third-party analytics SDKs that track your behavior") and
the not-surveilled emotional-safety brand, and raise EU consent issues. So:
**measure with first-party, aggregate, anonymized signals we already hold — no
behavioral profiles, no third-party tracker.** 2026-10-17. Design-phase.

## Principle
"Not surveilled" ≠ "flying blind." It means: no third-party SDK building
behavioral profiles tied to identity/ads. **Aggregate counts we hold in our own
Firestore — never "who did what," only "how many" — are compatible** with the
brand and the existing privacy policy. Design for anonymity by construction.

## Keep Firebase Analytics OFF
**DONE 2026-10-17:** `@react-native-firebase/analytics` is removed; the
`mobile/src/adapters/analytics.ts` wrapper is now a dependency-free no-op
(user-id attribution dropped) that Tier 3 can repurpose. No console action, no
plist re-download, no privacy-policy contradiction.

## Three tiers (do the cheap, high-value ones first)

### Tier 1 — RevenueCat (already integrated; zero new code) 🟢
RevenueCat's dashboard already gives the **entire monetization funnel** with no
added tracking: trial starts, trial→paid conversion, churn, MRR/LTV, renewal
cohorts, by product. This covers "does the companion (not a quota) drive
upgrades" at the subscription layer. **Action: just use it** — it's live the
moment IAP ships. **Adopted 2026-10-18 (roadmap 0.1 ✅).**

### Tier 2 — Derive activation & retention from data we ALREADY store 🟢
No new behavioral logging — compute cohorts from existing Firestore state:
- **Activation** = "of users who signed up this week, what % have ≥1 completed
  task." Todos + completion already live in `users/{uid}/state`. Derivable by a
  scheduled Cloud Function that writes only an **aggregate** daily roll-up
  (counts, no uids) to a `metrics/{date}` doc.
- **Retention (D1/D7/D30) & reactivation-after-lapse** = from a single
  `lastActiveDate` on user state (add if not present — one date field, not an
  event stream). The roll-up counts actives per cohort; the emotional-safety
  proxy "do people come back without guilt" falls straight out of lapse→return.
- Output is **aggregate counts only**; the roll-up function reads per-user state
  server-side and stores no identifiable event log.

### Tier 3 — A few product-signal tallies (optional) 🟡
For signals not derivable from stored data (Mochi used, paywall shown + reason,
empty-state CTA), keep anonymous **daily counters**, not per-user events:
- **Repurpose the existing wrapper** — `analytics.ts` already has a clean
  taxonomy and 14 call sites. Swap its implementation from RNFB `logEvent` to an
  **increment of an aggregate counter** (via a Cloud Function, so clients can't
  write arbitrary shared docs — avoids the abuse surface). The 14 call sites and
  the event names don't change; only the sink does.
- Store as `metrics/{date}.counts.{event}` — a tally, never a row-per-user.

## What this answers (vs. the original funnel goals)
| Goal | How, privately |
|---|---|
| Monetization funnel (trial→paid, churn, LTV) | Tier 1 (RevenueCat) |
| Activation (first task created + completed) | Tier 2 (derive from stored todos) |
| Retention D1/D7/D30, reactivation after lapse | Tier 2 (`lastActiveDate` roll-up) |
| Mochi engagement, paywall-shown, CTA taps | Tier 3 (aggregate counters) |
| "Deleted because it nagged me" churn reason | later: optional gentle in-app prompt (first-party), not analytics |

## Privacy-policy consistency
This **does not contradict** `PRIVACY.md` (no third-party SDK, no behavioral
profiling, aggregate-only). Add one honest transparency line — e.g. *"We keep
anonymous, aggregate counts (never tied to you) to see which features help, and
we use RevenueCat to manage subscriptions"* — rather than the heavy
third-party-analytics disclosure the Firebase path would have forced. No opt-out
toggle strictly required for aggregate/anonymous data, though a Settings note is
on-brand.

## Build steps (after sign-off)
1. ~~**Tier 1:** document the RevenueCat dashboard as the monetization source of
   truth (no code).~~ Done 2026-10-18 — this section is the record.
2. **Tier 2:** ~~signals + capture~~ (done 2026-10-17; **moved 2026-10-18** from the Profile to their own `users/{uid}/state/signals` doc via core `refreshUsageSignals`, stamped on open + every foreground + first completion — stamping the profile rewrote the whole profile doc, see `core/src/store/usageSignals.ts`).
   **Roll-up built 2026-10-18** (`functions/src/metricsRollup*.ts`): daily
   at 06:15 UTC it writes `metrics/{yesterday}` = `{ users {total, activated},
   signups, active {d1,d7,d30}, cohorts {d1,d7,d30: cohortDay, size, returned,
   activated} }` — counts only, no uids. Signup cohort comes from Firebase Auth
   creation time (profile `createdAt` is stamped lazily, so it would bunch all
   pre-existing users into one day). Retention is "returned on/after day N"
   (one `lastActiveDate` can't show every active day); reactivation-after-lapse
   is NOT derivable from a single date — needs a `previousActiveDate` if
   wanted. `metrics/*` is server-only via the default-deny rule. Read it in the
   Firebase Console → Firestore → `metrics`.
3. **Tier 3 (if chosen):** add a `recordMetric` callable CF; repurpose
   `analytics.ts` to call it; keep the 14 call sites.
4. ~~Remove `@react-native-firebase/analytics` dep in cleanup.~~ Done 2026-10-17.
5. ~~`PRIVACY.md` transparency note.~~ Done 2026-10-17 (usage-dates section + no-analytics-SDK statement).

## Open decision (scope)
How far to build now: **Tier 1+2** (RevenueCat + derive-from-data — covers
activation, retention, and the whole money funnel) is the recommended minimum;
**Tier 3** adds product-signal granularity but is the most build. Recommend 1+2
now, 3 only if a specific question needs it.
