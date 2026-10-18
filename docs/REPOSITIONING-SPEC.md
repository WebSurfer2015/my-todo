# Repositioning Spec — "Emotional Safety" (Bet #1)

Turns Bet #1 from `docs/FEATURE-MAP-GAPS.md` into a concrete spec: new
positioning, taglines, App Store copy, onboarding, and the Mochi
utility→companion shift. **This is a design-phase artifact for sign-off**
(per `memory/feedback_design_phase_required.md`) — not an implementation.
2026-10-17. Source of truth remains `docs/POSITIONING.md` until this is approved
and merged into it.

## The bet, in one line
Own the empty column: **a warm companion that makes task overwhelm feel
survivable.** Nobody in the to-do field sells *emotional safety* — Sagely's
anti-scorekeeping DNA + Mochi are the assets to do it with.

## ✅ DECIDED (2026-10-17): ADHD-forward (stance A)
Subtitle locked to **`Calm ADHD to-dos & planner`**; keywords and community
marketing lead ADHD; the brand tagline stays universal/warm ("a busy mind"). The
two stances below are kept for the record.

**How explicitly do we name ADHD?** Two coherent stances:
- **(A) ADHD-forward (recommended):** say "ADHD" in the App Store subtitle,
  keywords, and community marketing — but keep *in-app* language universal
  ("busy minds," "when it's a lot"). This is the Tiimo/Structured model: ADHD is
  the paying beachhead and the ASO/community magnet; non-ND users self-recruit.
  Best ASO leverage; proven at scale.
- **(B) Soft-overwhelm:** keep the current "real life / easily overwhelmed"
  wide door, ADHD only implied. Lower health-claim/brand risk, but forfeits the
  strongest low-CAC keyword and community channel.

The spec below is written for **(A)**, with soft-variant copy noted inline.
Everything else (Mochi-as-companion, emotional-safety promise, onboarding) is
identical under either stance. **Health-claim guardrail (both stances):** name
ADHD/overwhelm *experientially* ("built for ADHD and easily-overwhelmed minds"),
never clinically ("treats," "therapy," "clinically proven"). Apple allows ADHD
framing (Tiimo, Structured, Marvin all do); it disallows medical claims.

---

## 1. Positioning statement
- **For** adults with ADHD/AuDHD (and anyone who gets anxious and overwhelmed by
  their to-do list — the wide door)
- **who** feel behind, ashamed, or frozen by scorekeeping productivity apps,
- **Sagely is** a calm to-do app with a warm companion, Mochi,
- **that** helps you capture, break down, and gently stay on top of real life —
  without ever making you feel like a failure.
- **Unlike** Tiimo/Structured (visual time-structure) or Goblin/neurolist (cold
  AI task-splitters), **Sagely leads with emotional safety** — the relationship
  with Mochi, not the planner or the splitter.

**Category reframe:** not "another to-do app / planner" → **"a kind task
companion."** The planner is table stakes; the companion is the product.

**Anti-positioning (unchanged, load-bearing):** no streaks, no quotas, no
scores; no exclamation marks (unit-tested); "carried over," not "late"; done is
reversible for 30 days; progress is ambient; reduce-motion respected; only
irreversible actions are red.

## 2. Taglines & subtitle

**Lead tagline (brand line — website hero, onboarding, marketing):**
> **Sagely — a warm companion for a busy mind.**
> *Gentle to-dos that never make you feel behind.*

Rationale: **"warm companion"** claims the empty column (a companion, not another
planner or AI splitter). **"a busy mind"** frames a full mind as *abundance* —
positive, dignifying, and already affectionate ADHD-community language ("busy
brain") — rather than labeling a *deficit*. The negative-but-precise words
("overwhelmed," "anxious," "behind") are reserved for **body copy**, where
empathy meets the reader already in the moment — never in the headline that
labels them on first contact. The supporting line carries the emotional-safety
promise.

Alternates if "busy" ever reads too productivity-flavored: `…for a full plate` ·
`…for all you're carrying`.

**App Store subtitle (≤30 chars) — keep it keyword-bearing (do NOT use the brand
line verbatim):** the tagline has no functional keywords, and the subtitle is
prime ASO real estate, so echo the warmth but carry keywords + the ADHD magnet
(per §0-A):
- `Calm ADHD to-dos & planner` (26) — max ASO (adhd / to-dos / planner) ← **CHOSEN**
- `Gentle to-dos for a busy mind` (29) — echoes the tagline; "to-dos" keyword, no ADHD
- `Gentle to-dos for ADHD minds` (28) — middle

**The split is deliberate (Tiimo model):** the brand tagline goes
**universal + warm** ("a busy mind"); the ASO subtitle, keywords, and community
marketing still lead **ADHD** — universal front door, ADHD where discovery
actually happens.

## 3. App Store copy (replaces the stale v1.3.0 metadata)
**Promotional text (≤170, editable without review):**
> Sagely is the calm to-do app for busy, easily-overwhelmed minds. Mochi, your
> gentle companion, breaks big things into small steps, remembers where you left
> off, and never makes you feel behind.

**Description — opening (the part that converts):**
> Most to-do apps push you — streaks, scores, red "overdue" badges. Sagely
> steadies you. Meet Mochi, a warm little companion who helps you get what's on
> your mind out of your head, break the scary stuff into small steps, and gently
> keep *today* in view. Nothing here is ever "late" — just "carried over," and
> always reversible. Built for ADHD and easily-overwhelmed minds; loved by
> anyone tired of feeling behind.

**Keywords (ASO):** adhd planner, adhd to do list, gentle planner, calm to do,
overwhelm, executive function, neurodivergent, anxiety, focus, task breakdown,
mochi, carried over. *(Soft variant drops "adhd"/"neurodivergent," adds "busy,
real life.")*

**Screenshots** should lead with *feeling* (Mochi, the gentle "carried over,"
the calm palette), not feature lists — the brief's growth note.

## 4. Onboarding — warmth inside the first capture (speed first)
*(Revised per dual-lens UX #2: three preamble screens delay time-to-value, and
ADHD/overwhelmed users have the highest drop-off. The aha — "this app is kind
and won't judge me" — must arrive **with** the first task, not before it.)*

**Minimize preamble — first task in under ~15s.**
1. **One warm screen, skippable.** Mochi waves: *"Hi, I'm Mochi. I'll help you
   keep track of life — gently. No streaks, no scores, no guilt."* Then straight
   to capture — a prominent **"Add my first thing"** and a quiet "Skip."
2. **Teach safety by doing, not by slides.** The "carried over," "reversible,"
   and "break-it-down" lessons land as gentle *inline* moments the first time
   each is relevant (first completion → firework + warm line; first overdue →
   "carried over, no worries"; first big task → "want to break this down?").
3. Keep the deeper tour in **Guides** for anyone who wants it (already built).

## 5. Mochi: utility → **quiet companion** (the core product shift)
**Reframe (dual-lens #1, both lenses): a *quiet* companion, not a chatty one.**
Warmth is delivered through tone, microcopy, the completion firework, and the
existing day-stable mascot lines — **ambient, not talkative.** "Companion" must
never mean "a bot that says more": for an overwhelmed mind, more words = more
noise, which breaks the calm promise (`memory/feedback_lower_cognitive_load.md`).

**Local-first rule (this is also the AI-cost guardrail):** ~90% of the
companion's warmth runs on **device logic + templated / day-stable lines — zero
model calls.** Reserve the LLM (Haiku) for genuine *capture and breakdown* only.
This is what keeps a de-metered Mochi (§6) economically sane and honors
`memory/feedback_ai_token_efficiency.md`.

| Dimension | From (utility) | To (quiet companion) — LOCAL unless noted |
|---|---|---|
| Memory | per-session, stateless | **local** context only: greet by name + a glanceable "a few carried over" line; no server round-trip |
| Tone | functional prompt | warm, soft, consistent — **templated** day-stable mascot voice |
| Overwhelm | performs a breakdown | acknowledge *first* (**templated**), then offer help; the breakdown itself is the one LLM call |
| Presence | only when summoned | **default OFF**; any check-in is user-scheduled, framed as *availability* not a prompt; never streak/guilt language |
| Setbacks | neutral | **templated** kind reframes: overdue → "carried over, no worries"; stalled → offer to shrink/defer |
| Completion | firework | firework + a **templated** warm line honoring *showing up* |
| Depth | — | ambient; invisible for plain-list users; warmth never forced |

**Mochi must NOT:** be verbose or interrupt; talk more to seem "warmer"; pretend
to be human or a therapist; give mental-health/medical advice; make an LLM call
for routine warmth; or be metered (§6).

### 5a. Guardrails (gates — non-negotiable for this positioning)
1. **Accessibility is the product.** The audience is neurodivergent, so the app
   must be exemplary on VoiceOver, Dynamic Type, reduce-motion, and low sensory
   load. ⚠️ Known issue: RN `<Modal>` sheets flatten the a11y tree on iOS
   (`memory/project_rn_modal_a11y_flatten.md`) — and Mochi lives in a sheet.
   **Fixing Mochi-sheet accessibility is a gate before the companion ships;** a
   companion ND users can't navigate with VoiceOver fails the brand at its core.
2. **AI-cost ceiling:** warmth is local; LLM only for capture/breakdown; Haiku +
   minimal context + tight max_tokens. De-metering (§6) is only safe because
   routine warmth costs nothing.
3. **Privacy framing:** "remembers you" must feel safe, not surveilled — keep
   memory local and visible; never imply hidden tracking.

## 6. Hard dependency — fix the monetization contradiction first
A companion you can **run out of** is incoherent with "emotional safety." This
spec **requires** resolving the quota/meter problem (`PRODUCT-REVIEW-v1.7.0.md`
#1, `COMPETITIVE-BRIEF.md`): **never meter Mochi's presence, warmth, or basic
help.** Gate advanced *capability* (weekly planning, bulk AI ops) or volume via
an *abundance* frame — not a depleting daily counter. If Mochi guilt-trips you
toward a top-up, the entire repositioning collapses.

## 7. Success metrics (requires enabling analytics — PRODUCT-REVIEW #2)
- **Activation:** % completing a first Mochi interaction **and** first task in session 1.
- **Emotional-safety proxy:** reactivation rate after a lapse (do people return
  *without* guilt?), and a drop in "deleted because it nagged me" churn.
- **Companion engagement:** repeat Mochi conversations/week; review sentiment
  mentioning "kind," "calm," "doesn't judge," "Mochi."
- **Conversion quality:** does the *companion* (not the quota wall) drive
  trials/upgrades?

## 8. What changes vs. current POSITIONING.md
- **Keep:** calm stance, full anti-positioning, Mochi voice, the "real life" wide door.
- **Sharpen:** target narrows to a *paying* beachhead (ADHD/overwhelm); Mochi is
  promoted from a feature to the **heart of the product**; the promise moves from
  "calm" (ambient) to "emotional safety" (active).
- **Change:** ASC metadata (stale v1.3.0 → §3); self-concept (planner →
  companion); monetization (de-meter Mochi, §6).

## 9. Next steps
- ✅ §0 decision signed off (ADHD-forward).
- ✅ PM + UX dual-lens run → `docs/REPOSITIONING-DUAL-LENS.md`; must-fixes folded
  in (§4 speed, §5 quiet/local-first, §5a guardrails).
- **Three gates before any Mochi-companion build:** (1) de-meter Mochi (§6),
  (2) analytics on (§7), (3) Mochi-sheet accessibility fixed (§5a).
- **Sequence for a solo dev:** ship the cheap/high-value parts first — copy, ASO
  subtitle/keywords, onboarding microcopy; phase the Mochi-companion rebuild
  behind the three gates.
- On approval, fold this into `POSITIONING.md` as the new source of truth and
  rewrite all 6 locales of the ASC metadata.
- Everything remains parked behind the Apple Individual→Org conversion
  (`memory/project_v1_7_0_release_hold`).
