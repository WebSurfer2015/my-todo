# Principal PM Review — Sagely (v1.7.0)

Strategy-level product review, grounded in `docs/POSITIONING.md`,
`docs/POSITIONING-BRIEF.md`, the entitlements model, and the shipped feature
set. Written 2026-10-17, ahead of the v1.7.0 monetization launch.

## Verdict
Clear, differentiated brand and a cost-honest monetization architecture,
wrapped around a product that is **over-built on breadth and about to launch
paid revenue while blind to its own funnel**. The biggest issue isn't a
feature — it's a **strategic contradiction between how you monetize and what
your brand promises.** Fix that and the measurement gap before shipping
v1.7.0; the rest is tuning.

---

## 🔴 1. Monetization violates the anti-positioning
Brand stance: *"No streaks, no quotas, no 'X days in a row'… Progress =
ambient stones, not a counter that resets."* But v1.7.0 monetizes on exactly
that: a **daily Mochi quota (3/day) that resets**, a **depleting usage meter**
in chat, and **pay-as-you-go top-ups**. That recreates the scoreboard, pointed
at the wallet. The moment of monetization pressure (hitting the wall) is
engineered to create the anxious feeling the brand exists to remove.

The cost-alignment logic is smart; the *mechanic and framing* fight the brand.
Options, most on-brand first:
- **Reframe quota → abundance:** monthly pool, no daily reset; never show a
  depleting countdown — surface it only when genuinely near the limit, gently.
- **Gate on capability, not count:** Free gets Mochi-capture; Premium unlocks
  the magical stuff (bulk ops, weekly planning, breakdowns). Capability gates
  don't meter, so they don't scorekeep.
- If keeping top-ups, remove the micro-transaction feel — the most off-brand
  surface in the app.

Resolve before the paywall ships (hard to walk back once users anchor).

## 🔴 2. Launching subscriptions with no funnel instrumentation
If Firebase Analytics is still disabled in the plist
(`IS_ANALYTICS_ENABLED=false`), activation, paywall funnel, and retention are
unmeasurable — the three numbers that decide whether a consumer subscription
lives. RevenueCat covers *subscription* analytics (trial→paid, churn, LTV) but
not paywall-impression→trial, activation, or D1/D7/D30 retention.

**Enable analytics + instrument the core funnel as a hard gate on launch.**
Minimum events: onboarding_complete, first_task_created,
first_task_completed, mochi_used, paywall_shown(reason), trial_started,
subscribed.

## 🟠 3. Is AI the right thing to gate?
All productivity features (recurring, reminders, categories, multi-reminders,
series editing) are **free on every tier** — correct for retention. But the
only reason to pay is **more Mochi**, so the business rests on one bet:
conversational AI capture becomes a daily paid habit. Risk: for many users,
typing a task is faster than a chat turn. The conversion case only holds if
Mochi does what typing can't — break overwhelm into steps, bulk-triage, plan
the week. Make those magic moments the hero in onboarding + paywall, and
measure **Mochi D7 retention among free users** — if they don't come back to
Mochi, no quota converts them.

## 🟠 4. Platform & launch readiness
- **Web can't monetize** — no paywall/Stripe/RevenueCat on web; iOS-only. Every
  web-first user is Free forever. Decide deliberately: web as acquisition/
  retention surface (fine — say so) vs. needs web billing.
- **ASC metadata is stale** — live store copy is v1.3.0 "hard days" framing;
  subtitle/description/keywords across 6 locales don't reflect "calm to-dos for
  real life" or the AI/monetization story. The store listing is the top
  conversion surface — revise it *with* the v1.7.0 submission, not after.

## 🟡 5. Focus: groceries is a second app bolted on
Groceries (departments, stores, AI inference, store management) is heavy
surface for a calm *to-do* app. The thesis that justifies it — the deferred
**"Connected"** cross-reference (todos↔groceries↔events) — isn't built, so it
reads as scope creep that splits design/QA/support and dilutes the "one calm
place" story. Until Connected ships, resist adding to groceries; verify (once
measurable) what % of users touch Shopping weekly before investing more.

## 🟡 6. Pricing may be under-set
$2.99/mo / $19.99/yr. The brief notes Todoist at $4–6 (raised 25–40%) and
calm-pro tools sustaining $30–50/yr. In a trust/wellness category, a very low
price can signal low value. Don't raise blind — once conversion is measurable,
**test $19.99 vs $29.99 annual**, leading with annual (already the default —
good).

---

## Faster wins
- **Activation:** obsess over time-to-first-completed-task; the firework/chime
  reward loop is good — keep it.
- **Retention vs calm:** a no-nag brand risks soft retention. Reminders are the
  one sanctioned re-engagement lever and they're free — lean into *helpful*
  notifications (gentle "here's today," not streak guilt) as the habit engine.
- **Growth:** organic/ASO + niche-keyword plan is right for CAC. Lead store
  screenshots with *feeling* ("productivity apps make me anxious"), not feature
  lists.

---

## If I owned the roadmap, next cycle
1. Resolve the quota-vs-calm contradiction (reframe meter → abundance, or gate
   on capability). *Blocks paywall.*
2. Enable analytics + instrument the funnel. *Blocks monetization launch.*
3. Rewrite ASC metadata to current positioning + AI story, all locales. *Ships
   with v1.7.0.*
4. Make Mochi's magic (not capture) the hero in onboarding + paywall.
5. Decide web's role explicitly (acquisition vs. needs billing).
6. Then promote, submit, measure → price/packaging tests.

The craft is excellent and the strategy is unusually thought-through. The gap
is the last mile of consumer monetization discipline: don't let the money
mechanic betray the brand, and don't fly blind into the first paid release.
