# Dual-Lens Review — Emotional-Safety Repositioning Spec

PM + UX review of `docs/REPOSITIONING-SPEC.md` (per
`memory/feedback_dual_lens_review.md`). 2026-10-17. Must-fixes have been folded
back into the spec (§4, §5, §5a, §9).

## 🧭 PM lens
**Strengths:** claims a genuinely unoccupied position (emotional safety /
companion); maps to a validated, reachable, high-WTP beachhead (ADHD); leverages
an asset competitors lack (Mochi); the universal-brand / ADHD-ASO split is the
proven Tiimo model.

**Top risks (ranked):**
1. **Cost economics collide with the companion vision.** A Mochi that remembers,
   greets, proactively checks in, and emotionally attunes = far more LLM calls
   per user — right as you *de-meter* it (§6). De-metered + chattier + remembering
   = unbounded AI cost, breaking the cost-aligned monetization thesis and the
   token-efficiency principle. → Fix: ~90% of warmth must be **local/templated**;
   LLM only for capture/breakdown. *(Folded into §5.)*
2. **"Companion" is a thin moat for a solo dev** — a mascot/warmth is copyable by
   funded incumbents (Tiimo, Structured). Real moat = brand love + execution.
3. **Can't measure if it's working** — analytics off; every §7 metric is
   currently unmeasurable.
4. **Scope risk** — repositioning + Mochi rebuild + de-meter + onboarding +
   6-locale ASO is a large solo lift on top of a held release.

**PM verdict:** Proceed — positioning is sound — gated on three prerequisites
(de-meter, analytics, local-first warmth) and phased (cheap copy/ASO first,
Mochi rebuild funded/phased).

## 🎨 UX lens
**Strengths:** "name the load, not a flaw" is excellent and rare; reversibility /
"carried over" / reduce-motion already live the promise; the firework is a good
ambient reward.

**Top risks (ranked):**
1. **"Warm companion" fights "calm / low-cognitive-load" — the core paradox.** A
   companion can mean more presence/personality/copy = more noise, the opposite
   of calm for an overwhelmed mind. → Reframe to **"quiet companion"**: warmth via
   tone, microcopy, and the one firework, not a bot that talks more. *(Folded into §5.)*
2. **Onboarding delays time-to-value** — 3 preamble screens before first capture;
   ADHD/overwhelmed users drop off fastest. → Warmth *inside* the first capture,
   first task <15s, skippable. *(Folded into §4.)*
3. **The proactive check-in is a nag in disguise** — even opt-in 1/day can read as
   pressure for a rejection-sensitive audience. → Default OFF, user-set timing,
   framed as availability. *(Folded into §5.)*
4. **Anthropomorphization / quasi-therapy risk** — "attunes to feelings" can get
   uncanny or stray into mental-health advice (safety + health-claim). → Mochi is
   a gentle helper, never a therapist; warmth via templated character. *(§5 must-NOT.)*
5. **Dogfood accessibility — it IS the positioning.** ND audience needs
   exemplary VoiceOver / Dynamic Type / reduce-motion; RN `<Modal>` a11y flatten
   affects Mochi's sheet. → Accessibility gate. *(Folded into §5a.)*
6. **"Remembers you" can feel surveilled** to an anxious audience → local, visible
   memory; transparent framing. *(Folded into §5a.)*

**UX verdict:** Proceed, but reframe companion → *quiet* companion; fix
onboarding speed, check-in defaults, and Mochi-sheet accessibility first.

## 🔴 Both lenses agree (high-confidence must-fixes — all folded into the spec)
1. **Quiet, mostly local/templated Mochi** — PM (cost) + UX (noise) converge. #1 change.
2. **De-meter Mochi is a true prerequisite** — PM coherence + UX trust.
3. **Analytics on** — neither lens can validate the bet without it.

## ⚖️ Lens conflicts (judgment calls)
- **Onboarding:** PM wants speed-to-value; UX wants to establish companion/safety.
  → Resolved: warmth *inside* the first capture, minimal preamble.
- **ADHD-forward ASO vs. universal brand line:** PM loves discovery; UX wants one
  voice. → The split works but is two voices to maintain; watch for store↔in-app
  incoherence.

## Net recommendation
Strategically sound and worth doing. Adopt one reframe (**quiet** companion) and
three gates (de-meter · analytics · Mochi-sheet a11y). Sequence for a solo dev:
copy + ASO + onboarding microcopy first (cheap, high-value); Mochi-companion
rebuild phased behind the gates. All parked behind the Apple org conversion.
