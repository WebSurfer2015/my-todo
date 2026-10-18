# Repositioning Roadmap

Turns `FEATURE-ALIGNMENT-AUDIT.md` into prioritized, concrete work. Ordering =
(impact on the wedge × unblocks-other-work) ÷ effort. 2026-10-17 (status
refreshed 2026-10-18).

## Key reframe: the org conversion blocks *submitting*, not *building*
The Apple Individual→Org conversion (`memory/project_v1_7_0_release_hold`) holds
the *release*, not the engineering. **Use the wait to execute the repositioning**
on `dev`. Only Phase 5 is actually blocked. Effort: S ≈ hours, M ≈ days, L ≈ 1–2+ wks.

**Status legend:** ✅ done · 🔶 done in code, NOT device-verified · ⏳ open ·
⏸ deferred (with trigger) · 🔴 blocked

## Critical path (minimum coherent repositioning)
If moving fast matters, the smallest shippable-coherent set is:
**P0 measurement → P1 de-meter → PC privacy/compliance → P2 quiet-Mochi presence →
P4 Mochi-sheet a11y → P5 ASC copy + submit.** The subtraction pass (P3) is the
biggest quality lever but is large — it can trail the first repositioned release.

## Next up (as of 2026-10-18)
1. **Deploy `onUserDeleted`** (C.1) — one command; makes the policy's deletion
   claim true. Must precede any `dev`→`main` promote.
2. **Device-verification checkpoint** (below) — closes the 🔶 rows in gates 1, 3
   and 4 in one session, instead of discovering them at 5.4.
3. **P2** — the next real code work on the critical path.
4. Gate-2 paperwork: confirm 0.1, set the 0.2 aggregation-CF trigger.

---

## P0 — Measurement (privacy-preserving; do first) 🟢 not blocked
*Re-scoped 2026-10-17: Firebase Analytics stays OFF — it's a third-party
behavioral SDK that contradicts `PRIVACY.md` and the not-surveilled brand.
Measure first-party + aggregate instead (`MEASUREMENT-PLAN.md`). The 14 typed
event call sites in `analytics.ts` remain as a no-op seam.*
| # | Item | Why | Effort | Status |
|---|---|---|---|---|
| 0.1 | **Tier 1 — RevenueCat** as the monetization-funnel source of truth (trial→paid, churn, LTV) | already integrated; zero new tracking | S (doc only) | ⏳ `MEASUREMENT-PLAN.md` has the Tier 1 section — confirm it's sufficient and mark done |
| 0.2a | **Tier 2 schema** — `createdAt`/`lastActiveDate`/`activatedAt` on Profile + migration + tests; `metrics/*` covered by default-deny | foundation for activation/retention | S | ✅ `448e688` |
| 0.2b | **Tier 2 capture** — pure `stampProfileSignals` in core, called once per app open from both `useTodoStore`s | records the signals | S | 🔶 `bca8e52` |
| 0.2c | **Tier 2 aggregation CF** — scheduled roll-up of **aggregate** counts to `metrics/{date}` (server-only) | answers activation/retention/reactivation with no behavioral logging | M | ⏸ **build when TestFlight external testing starts** (first real users) — must exist before the monetized launch |
| 0.3 | **Tier 3** — anonymous daily counters for Mochi-used / paywall-shown / CTA / **groceries-used**, by repointing the `analytics.ts` no-op seam to a `recordMetric` CF | product-signal granularity; **3.3 depends on it** | M | ⏳ optional — *unless* 3.3 is decided by data (see 3.3) |
| 0.4 | Remove `@react-native-firebase/analytics`; honest `PRIVACY.md` note | keeps the privacy promise true | S | ✅ `fc181f5` — wrapper kept as a no-op seam, user-id attribution dropped |

## P1 — De-meter Mochi (brand-coherence prerequisite) 🟢 not blocked
*(Resolves the ❌ conflicts. `MOCHI-MONETIZATION-MODEL.md`.)* Shipped the whole
vertical atomically (`7239359`, `fa651c5`). The free 90/3 + premium 250
allowances are now INVISIBLE fair-use ceilings. Typecheck + unit tests green;
**none of it is runtime-verified** (no device/StoreKit/users) → device checkpoint.
| # | Item | Effort | Status |
|---|---|---|---|
| 1.1 | Remove the **usage meter** UI from ChatSheet | S | 🔶 |
| 1.2 | Remove **top-up** packs/flows; retire `topup.*` (and `max.*`) from the plan/paywall | S–M | 🔶 core/adapter/context/UI/webhook + tests |
| 1.3 | Collapse tiers to **Free + Premium** (fold Max's `aiPlanning` into Premium) | M | 🔶 |
| 1.4 | Over the fair-use ceiling → **graceful local fallback** (raw text handed to manual Compose via `onReviewCreateTodo`; no wall, no paywall) | M | 🔶 |
| 1.5 | **Paywall → aspirational** triggers only (punitive "out of requests" trigger removed; locked-theme tap + Settings→Membership remain) | S–M | 🔶 |
| 1.6 | Reprice to **$4.99/mo · $29.99/yr**, annual-led, keep 7-day trial, **no lifetime** | S | 🔶 fallback prices in `PaywallSheet`; real prices live in ASC (5.3) |
| 1.7 | **Server `RESOURCE_EXHAUSTED` → auto-fallback.** Chat takes the same fallback as 1.4; step suggestions show a gentle localized "Mochi's resting" note; server ceiling copy de-metered (no counts / countdown / "pay as you go") | S | 🔶 `ac5437c` — server copy needs a functions deploy (with C.1) |

## PC — Privacy & compliance (launch gate) 🟢 not blocked
*Added 2026-10-18. App Review 5.1.1(v) requires in-app account deletion to
delete the user's data, and the privacy policy + App Store privacy label must
match what the app actually does. The policy is served by GitHub Pages from
`main:/docs`, so policy text goes live on promote — server changes it describes
must be deployed first.*
| # | Item | Effort | Status |
|---|---|---|---|
| C.1 | **Account deletion erases data** — `onUserDeleted` CF recursively deletes `users/{uid}`; RC webhook ignores events for deleted uids (client deletes were always denied by rules, so nothing was ever erased) | S | 🔶 `0a8e0df` on dev — **NOT DEPLOYED**: `cd web && firebase deploy --only functions` before promoting `main` |
| C.2 | **Orphan cleanup** — one-off, dry-run-first script to erase `users/{uid}` trees with no live auth user (accounts deleted before C.1) | S | ⏳ after C.1 deploy |
| C.3 | **Privacy policy accuracy** — analytics removed, usage dates, Anthropic (Mochi), RevenueCat (subscriptions), deletion scope | S | ✅ `fc181f5`, `e7c9a70`, `0a8e0df` — live on promote |
| C.4 | **Verify vendor claims in the policy** — Anthropic API retention period (or ZDR), RevenueCat device-data list | S | ⏳ check vendor terms/console |
| C.5 | **App Store privacy label** — add User Content (Mochi → Anthropic), Purchases (RevenueCat), User ID (uid → RevenueCat), Usage Data / Product Interaction (the 3 profile dates, analytics purpose); "not used for tracking" | S | ⏳ ASC — do alongside 5.1 |
| C.6 | **Stale `web/public/privacy/index.html`** — legacy "Todos for Everyone / WebSurfer" page (mentions Facebook Login); remove or redirect to the real policy | S | ⏳ |
| C.7 | Optional cleanup: drop the always-denied client-side wipe from `runDeleteAccount` (core + both `AuthContext`s) | S | ⏳ low priority |

## P2 — The quiet companion (the heart) 🟢 not blocked
*(`REPOSITIONING-SPEC.md` §5. Gate: most warmth must be local/templated.)*
| # | Item | Effort | Status |
|---|---|---|---|
| 2.1 | **Ambient Mochi presence** — local home greeting (name + "a few carried over"), kind reframes on overdue ("carried over, no worries"), templated completion lines. *The "CARRIED OVER" home section already exists (`HomeScreen.tsx`); the remaining work is the warm copy + greeting* | S–M | ⏳ |
| 2.2 | Shift warmth to **local/templated**; LLM only for genuine capture/breakdown | M | ⏳ |
| 2.3 | **Opt-in gentle check-in** — default OFF, user-scheduled, framed as availability (never a prompt) | S–M | ⏳ |
| 2.4 | **Gentle reminder voice** — encouraging, non-nagging copy on notifications | S | ⏳ |

## P3 — The subtraction / calm pass (biggest quality lever) 🟢 not blocked
*(The deepest tension: feature breadth vs. low-cognitive-load. This is where the
app earns "calm." Large — can phase or trail the first repositioned release.)*
| # | Item | Effort | Status |
|---|---|---|---|
| 3.1 | **Progressive-disclosure pass** — hide/default power features so the first-run surface is calm (status/priority customization, pinned-filter management, series-edit dialogs) | L | ⏳ |
| 3.2 | **Simplify series-edit** defaults (gentle default, complexity on demand) | M | ⏳ |
| 3.3 | **Groceries decision** — keep/demote; don't expand until the "Connected" thesis. **Dependency:** Tier 2 (0.2) only records profile dates, so it *cannot* measure groceries usage — deciding by data requires **0.3** (a groceries-used counter); otherwise decide by user interviews | M | ⏳ needs 0.3 or interviews |
| 3.4 | **Onboarding revise** — 1 warm skippable screen + warmth inside first capture; teach safety inline (`REPOSITIONING-SPEC.md` §4) | M | ⏳ |

## P4 — Accessibility & polish (gate for the ND audience) 🟢 not blocked
| # | Item | Effort | Status |
|---|---|---|---|
| 4.1 | **Mochi-sheet accessibility** — a11y flatten cured by the "#15" sibling-backdrop pattern (SheetShell + ChatSheet) + regression guard test; `accessibilityViewIsModal` for VoiceOver focus containment | S | 🔶 `185ecef` — remaining = device VoiceOver QA |
| 4.2 | VoiceOver / Dynamic Type / reduce-motion sweep across sheets (`QA-CHECKLIST` §2,6) | M | ⏳ device |
| 4.3 | Reconsider the lifetime-count **reset/recalibrate** affordance (odd for an only-grows metric) | S | ⏳ |

## ✋ Device-verification checkpoint (before P2 lands; not blocked on Apple)
Everything 🔶 above is verified only by typecheck + unit tests. Run ONE session
on a **dev client build with the StoreKit config** (`mobile/storekit/`) rather
than letting it all pile up at 5.4:
- [ ] De-metered paywall: purchase, restore, trial copy, fallback prices (1.1–1.6)
- [ ] Over-ceiling fallback hands text to Compose (1.4) — and when only the *server* rejects (1.7: e.g. lower the ceiling in the emulator or use a second device)
- [ ] VoiceOver reads each sheet's controls individually + focus is trapped (4.1)
- [ ] Profile gets `createdAt` / `lastActiveDate` / `activatedAt` after app open (0.2b)
- [ ] End-to-end account deletion with a **throwaway** account after C.1 deploys:
      `users/{uid}` tree gone, auth user gone — then remove the throwaway account

*(The Amplify dev URL only exercises web; this checkpoint is mobile.)*

## P5 — Store & submit 🔴 blocked on the Apple org conversion
| # | Item | Effort | Status |
|---|---|---|---|
| 5.1 | Rewrite **ASC metadata to the new direction, all 6 locales** (English done in `POSITIONING.md`; zh/es/fr/de/ja + Play still need it — do NOT machine-translate). Update the privacy label in the same pass (C.5) | M | 🔴 |
| 5.2 | **Screenshots lead with feeling** (Mochi, "carried over," calm palette), not feature lists | M | 🔴 |
| 5.3 | Create final **IAP products** in ASC (`premium.monthly` / `premium.annual` only) | S | 🔴 |
| 5.4 | Run the release test matrix on device (`RELEASE-v1.7.0-TEST-MATRIX.md` — carries over to **v2.0.0**; refresh it for the de-meter: no top-ups/Max) incl. de-metered paywall via StoreKit config | M | 🔴 |
| 5.5 | Promote `dev`→`main` (**after C.1 is deployed**), tag **`v2.0.0`**, `eas build --auto-submit` | S | 🔴 — `mobile/app.json` already at 2.0.0 |

---

## The four hard gates — must be true before the monetized launch
| Gate | Covered by | Status |
|---|---|---|
| 1. **De-meter Mochi** | P1 | 🔶 code done (incl. 1.7); device checkpoint pending |
| 2. **Privacy-preserving measurement on** (RevenueCat + first-party aggregate; NOT Firebase Analytics) | P0 | ⏳ 0.4 ✅, 0.2b 🔶; 0.1 unconfirmed; 0.2c deferred to TestFlight |
| 3. **Mochi-sheet accessibility** | P4.1 | 🔶 code done; device VoiceOver pending |
| 4. **Privacy & compliance** — deletion actually erases data; policy + privacy label match reality *(added 2026-10-18)* | PC | 🔶 C.1 needs deploy; C.2, C.4–C.6 open |

## Open decisions (owner: you)
- ~~Version~~ — **decided 2026-10-18: v2.0.0** (planner → companion is a clean
  version break). `mobile/app.json` bumped.
- **Is 0.3 optional?** Only if 3.3 (groceries) is decided by interviews rather
  than usage data.

## Honest notes for a solo dev
- This is a large body of work; **P3 (subtraction) is the highest-quality lever
  but the heaviest** — don't let it block the coherent core (P0–P2, PC, P4.1, P5).
- The release is **v2.0.0** (decided 2026-10-18) — the product's self-concept
  changes (planner → companion), monetization changes, and copy changes.
- Sequence respects the hold: **P0–P4 and PC can all happen now on `dev`**;
  only P5 waits on Apple.
- 🔶 is accumulating faster than ✅ — the device checkpoint is the cheapest way
  to turn code-complete into actually-done.
