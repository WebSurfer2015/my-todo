# De-Metered Mochi — Monetization Model

The prerequisite (`REPOSITIONING-SPEC.md` §6): monetize Mochi **without** a
depleting counter, pay-as-you-go top-ups, or a wall that hits an overwhelmed
user mid-task — while keeping **AI cost < revenue**. 2026-10-17. Design-phase;
sign-off + dual-lens before build.

## The problem in one line
A companion you can "run out of" is incoherent with emotional safety — but LLM
calls cost real money, so *something* has to be bounded. The trick is **what** you
bound, and **how it feels** when a limit is near.

## The core unlock: meter the heavy lifting, never the companion
Split Mochi into two things that were previously conflated:

1. **Mochi the companion** — greetings, reframes, check-ins, warmth, completion
   lines, the relationship. Per `REPOSITIONING-SPEC.md` §5 this is **~90% local /
   templated, zero model calls.** → **Always free, always unlimited, never
   metered.** You can never run out of Mochi.
2. **Mochi's AI heavy-lifting** — the LLM-powered work (capture parsing,
   task breakdown, planning). This has marginal cost, so it's where the paid line
   is drawn — **as a capability, not a counter.**

Because the companion is free and local, "de-metered" is honest: the thing users
emotionally attach to is genuinely unlimited. Only the expensive AI *operations*
are bounded, and they're bounded by **capability tier**, not a depleting meter.

## The capability line: "one thing at a time" (free) vs "the whole picture" (Premium)
This single line is brand-coherent *and* cost-aligned — cheap single calls are
free; expensive high-context bulk work is paid.

| | **Free** | **Premium** |
|---|---|---|
| Companion (local warmth) | ✅ unlimited | ✅ unlimited |
| All productivity (tasks, recurrence, reminders, groceries) | ✅ | ✅ |
| **Everyday AI** — capture one thing, break down *a* task | ✅ (graceful fallback, see below) | ✅ effectively unlimited |
| **AI heavy-lifting** — plan my week, triage my whole list, bulk breakdowns, proactive review | ❌ | ✅ |
| Themes / customization | ❌ (Sage+Sky only) | ✅ |
| *(optional)* multi-device sync | — | ✅ |

Free = *Mochi helps you with **this**, one thing at a time* (inherently calmer).
Premium = *Mochi helps you with **everything** — the zoom-out.* The expensive,
high-value, high-context work (weekly planning, bulk) is exactly what costs the
most to run, so the gate aligns cost with price automatically.

## How "no counter" and "cost < revenue" coexist
There is still a server-side limit — but it is an **invisible anti-abuse /
fair-use ceiling**, never a product surface:

- **Free tier:** a generous, invisible fair-use ceiling on everyday AI calls,
  sized so ~99% of genuine users never approach it (it exists to stop
  automation/abuse, not to pressure humans). **No counter is ever shown.**
- **Graceful fallback (the mechanic that replaces the wall):** if a free user
  *does* exceed fair use on a heavy day, Mochi **silently falls back to local
  capture** — the task still gets added, just without the AI breakdown flourish —
  with at most a *single, one-time* gentle note that breakdown is a Premium
  nicety. Never a "you're out" wall, never repeated. **The app always works; only
  the AI enhancement degrades.** That's the entire anxiety-free design.
- **Premium:** user-facing **"unlimited"**, with an anti-abuse soft cap set *far
  above* any real human use (only catches runaway/automation). Framed as
  unlimited because, for every real person, it is.

The counter still exists in the Cloud Function — it just moves **off the screen**
and becomes a cost-control backstop, not a scoreboard.

## Pricing & packaging
- **Two tiers only: Free + Premium.** Drop "Max" from the model (already dropped
  from the paywall); fold its AI superpowers into Premium. Fewer choices =
  lower cognitive load (`memory/feedback_lower_cognitive_load.md`).
- **Drop top-ups / pay-as-you-go entirely** — the single most off-brand surface
  (metering + micro-transactions + buying-while-overwhelmed). Graceful fallback
  replaces the need for them.
- **Price up:** Premium **$4.99/mo, $29.99/yr** (from $2.99 / $19.99), annual-led
  (already default), **7-day free trial** (keep the existing eligibility logic).
  $29.99/yr matches Structured's anchor and the competitive brief's "room to
  raise"; annual is ~50% off monthly to steer to annual.
- **❌ No lifetime plan.** Lifetime + ongoing per-user AI marginal cost = you lose
  money on your heaviest power users forever. Structured/Marvin can offer lifetime
  because their marginal cost ≈ 0; an AI app's isn't. Subscriptions only.

## The paywall is aspirational, never punitive
Upgrade prompts fire on **reaching for a superpower**, never on **hitting a
wall**:
- ✅ Tap "Plan my week" / "Break down my whole list" / a locked theme → "That's a
  Premium thing — want Mochi to take the whole week off your plate?"
- ❌ Never: a counter at 0, or an upsell surfaced while the user is mid-overwhelm
  asking for help with one task.

The upgrade moment is a door to *more capability*, shown when the user is
curious/ambitious — not a toll gate when they're struggling.

## Economics check (directional)
The prior model's loss-safety math (premium worst-case ~$1.25 AI vs ~$1.42/mo
net; free ~$0.45/mo acquisition cost) **holds with more margin now**, because:
- local-first (§5) removes ~90% of calls before any tier logic applies;
- Haiku + minimal context + tight max_tokens + prompt caching
  (`memory/feedback_ai_token_efficiency.md`);
- the free fair-use ceiling + local fallback hard-bounds free-tier cost;
- the price rise to $29.99/yr widens net-per-user.
*(These are illustrative — the fair-use ceiling must be tuned against real usage
once analytics are on; see dependency below.)*

## What changes vs. the currently-built v1.7.0 model
The built model is quota + top-ups + visible meter (Free/Premium, Max dropped).
This model requires:
- **Remove:** the visible usage meter; top-up packs (`topup.150` / `topup.500`);
  the daily/monthly *displayed* caps.
- **Change:** Cloud Function quota → invisible fair-use ceiling + a
  fallback-signal to the client; client → graceful local fallback instead of a
  wall; redraw Premium as **capability gates** (weekly planning, bulk, themes).
- **IAP products (ASC):** keep `premium.monthly` / `premium.annual`; **retire**
  `topup.*` and `max.*`. (Convenient: ASC products don't exist yet — blocked on
  the org conversion — so the final set can be defined here *before* creation.)

## Sequencing
**Rework to this model before the first *monetized* launch** — do not ship the
metered model and immediately contradict it with early payers. The Apple
Individual→Org conversion delay (`memory/project_v1_7_0_release_hold`) is the
window: get the model right while no real money or ASC products exist yet.

## Dependencies & open decisions
- **Measurement on** (`MEASUREMENT-PLAN.md`; the daily roll-up is live) — required to tune the invisible fair-use
  ceiling to real usage; shipping a ceiling you can't observe is guessing.
- **Confirm the Free↔Premium capability split** — is "plan my week / bulk triage"
  the right premium line, or should everyday single-task breakdown also be
  Premium? (Recommend: keep single-task breakdown free — it's the lovable
  companion core and Goblin Tools gives it away; gate only the bulk/zoom-out.)
- **Fair-use ceiling numbers** — set once analytics exist; until then, a
  conservative placeholder.
- **Price test** — $29.99 vs higher, once conversion is measurable.
