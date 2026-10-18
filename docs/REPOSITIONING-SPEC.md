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

## 4. Onboarding redesign (3 screens → companion + safety from first open)
Goal: the aha is **"this app is kind and won't judge me,"** reached before any
task UI. Keep it 3 screens, skippable.
1. **Meet Mochi (the companion).** Mochi waves. *"Hi, I'm Mochi. I'll help you
   keep track of life — gently. No streaks, no scores, no guilt."* Establishes
   companion + emotional safety in one line.
2. **How it feels different.** Show "carried over" (not "late") and a reversible
   done-tap, calm palette. *"Fall behind? We just carry it over. Change your
   mind? Everything's reversible."* Establishes safety as a mechanic, not a slogan.
3. **Mochi helps with the hard part.** *"Something too big to start? Tell Mochi —
   we'll break it into tiny steps, together."* CTA: **"Add my first thing"**
   (→ Mochi capture) / "I'll explore first."

## 5. Mochi: utility → companion (the core product shift)
Today Mochi is a **summoned tool** that performs operations (capture, breakdown)
and is largely stateless and functional. The repositioning makes Mochi a
**character with continuity and warmth.** Concretely:

| Dimension | From (utility) | To (companion) |
|---|---|---|
| Memory | per-session, stateless | greets by name + context ("Morning, Ying — a few things carried over; want to peek?"); remembers recent context |
| Opening tone | functional prompt | warm, soft, consistent personality (extend the day-stable mascot voice into chat) |
| Overwhelm | performs a breakdown | acknowledges *first*, helps *second* ("that's a lot — want to start with one tiny piece?") |
| Presence | only when summoned | optional gentle daily check-in (max 1/day, opt-in), framed as care: "No pressure — here if you want to plan today" |
| Setbacks | neutral | reframes kindly: overdue → "carried over, no worries"; stalled task → offers to shrink/defer, never scolds |
| Completion | firework | firework + a warm Mochi line that honors *showing up*, not throughput |
| Depth | — | ambient: stays out of the way for plain-list users; warmth is opt-in, never forced |

**Mochi must NOT:** be verbose or interrupt; pretend to be human or a therapist;
give mental-health/medical advice; or **be metered** (see §6).

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
1. **Sign off the §0 decision** (ADHD-forward vs soft-overwhelm).
2. Run the **PM + UX dual-lens** (`memory/feedback_dual_lens_review.md`) on this spec.
3. Sequence **after** the monetization de-metering (§6 is a prerequisite, not a follow-up).
4. On approval, fold this into `POSITIONING.md` as the new source of truth and
   rewrite all 6 locales of the ASC metadata.
