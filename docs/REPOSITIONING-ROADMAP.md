# Repositioning Roadmap

Turns `FEATURE-ALIGNMENT-AUDIT.md` into prioritized, concrete work. Ordering =
(impact on the wedge × unblocks-other-work) ÷ effort. 2026-10-17.

## Key reframe: the org conversion blocks *submitting*, not *building*
The Apple Individual→Org conversion (`memory/project_v1_7_0_release_hold`) holds
the *release*, not the engineering. **Use the wait to execute the repositioning**
on `dev`. Only Phase 5 is actually blocked. Effort: S ≈ hours, M ≈ days, L ≈ 1–2+ wks.

## Critical path (minimum coherent repositioning)
If moving fast matters, the smallest shippable-coherent set is:
**P0 measurement → P1 de-meter → P2 quiet-Mochi presence → P4 Mochi-sheet a11y →
P5 ASC copy + submit.** The subtraction pass (P3) is the biggest quality lever
but is large — it can trail the first repositioned release.

---

## P0 — Measurement (privacy-preserving; do first) 🟢 not blocked
*Re-scoped 2026-10-17: Firebase Analytics stays OFF — it's a third-party
behavioral SDK that contradicts `PRIVACY.md` and the not-surveilled brand.
Measure first-party + aggregate instead (`MEASUREMENT-PLAN.md`). Note: the event
instrumentation already exists (14 call sites in `analytics.ts`) — the work is
redirecting the sink, not adding tracking.*
| # | Item | Why | Effort |
|---|---|---|---|
| 0.1 | **Tier 1 — RevenueCat** as the monetization-funnel source of truth (trial→paid, churn, LTV) | already integrated; zero new tracking | S (doc only) |
| 0.2 | **Tier 2 — derive activation & retention** from stored Firestore data: add `lastActiveDate`; a scheduled CF rolls up **aggregate** counts to `metrics/{date}` (server-only) | answers activation/retention/reactivation with no behavioral logging | M |
| | &nbsp;&nbsp;↳ **Schema foundation: DONE** (commit `448e688`) — `createdAt`/`lastActiveDate`/`activatedAt` on Profile + migration + tests; `metrics/*` already covered by default-deny (no rule change). **Client capture-wiring: DONE** — pure `stampProfileSignals` in core (unit-tested) called once per app open from both `useTodoStore`s (mobile+web); not yet runtime-verified. **Deferred to near-launch:** the aggregation CF — nothing to roll up until there are users. | | — |
| 0.3 | **Tier 3 (optional)** — anonymous daily counters for Mochi-used / paywall-shown / CTA, by repurposing the `analytics.ts` wrapper to a `recordMetric` CF | product-signal granularity | M |
| 0.4 | Remove `@react-native-firebase/analytics`; one-line honest `PRIVACY.md` transparency note | keeps the privacy promise true | S |

## P1 — De-meter Mochi (brand-coherence prerequisite) 🟢 not blocked
*(Resolves the ❌ conflicts. `MOCHI-MONETIZATION-MODEL.md`.)*
> **Mostly DONE (typecheck + unit-tests green; NOT runtime-verified — no device/
> StoreKit/CF runtime, no users).** Shipped the whole vertical atomically: removed
> top-ups (core/adapter/context/UI/webhook + tests), removed the usage meter UI,
> removed the **Max** tier (its `aiPlanning` superpower folded into Premium),
> repriced the fallback to $4.99/$29.99. The free 90/3 + premium 250 allowances
> became INVISIBLE fair-use ceilings. **P1.4 + P1.5 now done in code:** over the
> ceiling the Mochi send path gracefully hands the raw text to manual Compose
> (`onReviewCreateTodo`) — no wall, no paywall; the one punitive paywall trigger
> is gone (the other two — locked-theme tap, Settings→Membership — were already
> aspirational). **Still runtime-unverified** (no device/StoreKit/users) — verify
> the fallback UX + purchase flows on device before launch. Edge: if client and
> server disagree, the server `RESOURCE_EXHAUSTED` path still shows the gentle
> error block (which offers "Enter manually") rather than auto-falling-back.
| # | Item | Effort |
|---|---|---|
| 1.1 | Remove the **usage meter** UI from ChatSheet | S |
| 1.2 | Remove **top-up** packs/flows; retire `topup.*` (and `max.*`) from the plan/paywall | S–M |
| 1.3 | Collapse tiers to **Free + Premium** (fold Max's superpowers into Premium) | M |
| 1.4 | Cloud Function quota → **invisible fair-use ceiling + graceful local fallback** (task still succeeds, no wall; one-time gentle note) | M |
| 1.5 | **Paywall → aspirational** triggers (fires on reaching for a superpower, never on a wall) | S–M |
| 1.6 | Reprice to **$4.99/mo · $29.99/yr**, annual-led, keep 7-day trial, **no lifetime** | S |

## P2 — The quiet companion (the heart) 🟢 not blocked
*(`REPOSITIONING-SPEC.md` §5. Gate: most warmth must be local/templated.)*
| # | Item | Effort |
|---|---|---|
| 2.1 | **Ambient Mochi presence** — local home greeting (name + "a few carried over"), kind reframes on overdue ("carried over, no worries"), templated completion lines | M |
| 2.2 | Shift warmth to **local/templated**; LLM only for genuine capture/breakdown | M |
| 2.3 | **Opt-in gentle check-in** — default OFF, user-scheduled, framed as availability (never a prompt) | S–M |
| 2.4 | **Gentle reminder voice** — encouraging, non-nagging copy on notifications | S |

## P3 — The subtraction / calm pass (biggest quality lever) 🟢 not blocked
*(The deepest tension: feature breadth vs. low-cognitive-load. This is where the
app earns "calm." Large — can phase or trail the first repositioned release.)*
| # | Item | Effort |
|---|---|---|
| 3.1 | **Progressive-disclosure pass** — hide/default power features so the first-run surface is calm (status/priority customization, pinned-filter management, series-edit dialogs) | L |
| 3.2 | **Simplify series-edit** defaults (gentle default, complexity on demand) | M |
| 3.3 | **Groceries decision** — verify weekly usage (needs P0); keep/demote; don't expand until the "Connected" thesis | M |
| 3.4 | **Onboarding revise** — 1 warm skippable screen + warmth inside first capture; teach safety inline (`REPOSITIONING-SPEC.md` §4) | M |

## P4 — Accessibility & polish (gate for the ND audience) 🟢 not blocked
| # | Item | Effort |
|---|---|---|
| 4.1 | **Mochi-sheet accessibility** — fix the RN `<Modal>` a11y flatten so VoiceOver reads it (`memory/project_rn_modal_a11y_flatten`) | M |
| 4.2 | VoiceOver / Dynamic Type / reduce-motion sweep across sheets (`QA-CHECKLIST` §2,6) | M |
| 4.3 | Reconsider the lifetime-count **reset/recalibrate** affordance (odd for an only-grows metric) | S |

## P5 — Store & submit 🔴 blocked on the Apple org conversion
| # | Item | Effort |
|---|---|---|
| 5.1 | Rewrite **ASC metadata to the new direction, all 6 locales** (English done in `POSITIONING.md`; zh/es/fr/de/ja + Play still need it — do NOT machine-translate) | M |
| 5.2 | **Screenshots lead with feeling** (Mochi, "carried over," calm palette), not feature lists | M |
| 5.3 | Create final **IAP products** in ASC (`premium.monthly` / `premium.annual` only) | S |
| 5.4 | Run **`RELEASE-v1.7.0-TEST-MATRIX.md`** on device (incl. de-metered paywall via StoreKit config) | M |
| 5.5 | Promote `dev`→`main`, tag `v1.7.0` (or `v2.0.0` given the scope), `eas build --auto-submit` | S |

---

## The three hard gates (from the spec) — must be true before the monetized launch
1. **De-meter Mochi** → P1
2. **Privacy-preserving measurement on** → P0 (RevenueCat + first-party aggregate; NOT Firebase Analytics)
3. **Mochi-sheet accessibility** → P4.1

## Honest notes for a solo dev
- This is a large body of work; **P3 (subtraction) is the highest-quality lever
  but the heaviest** — don't let it block the coherent core (P0–P2, P4.1, P5).
- The version is arguably a **v2.0.0**, not v1.7.0 — the product's self-concept
  changes (planner → companion), monetization changes, and copy changes. Worth a
  clean version break.
- Sequence respects the hold: **P0–P4 can all happen now on `dev`**; only P5
  waits on Apple.
