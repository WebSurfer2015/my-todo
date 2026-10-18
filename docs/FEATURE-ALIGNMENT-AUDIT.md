# Feature Alignment Audit — shipped features vs. the repositioning

Every shipped feature (from the page-by-page inventory) scored against the
2026-10 direction in `POSITIONING.md`: *warm quiet companion · emotional safety
· de-metered Mochi · anti-scorekeeping · low cognitive load · ND/overwhelm
beachhead.* 2026-10-17.

Verdict key: ✅ aligned (the brand core) · ⚠️ tension (revise/watch) ·
❌ conflict (must change) · 🕳️ gap (build to deliver the promise).

## ❌ Conflicts — contradict the repositioning, must change
| Feature | Why it conflicts | Fix |
|---|---|---|
| **Mochi usage meter** (ChatSheet) | a depleting counter on the thing users bond with = scoreboard pointed at the wallet; breaks "never meter the companion" | remove the visible meter (`MOCHI-MONETIZATION-MODEL.md`) |
| **Top-up packs** (`topup.150/500`) | pay-as-you-go micro-transactions, bought while overwhelmed — the most off-brand surface | drop entirely; graceful local fallback replaces them |
| **Out-of-requests → paywall** trigger | punitive upsell at the moment of need | make the paywall *aspirational* (fires on reaching for a superpower), never on a wall |
| **Mochi as an all-LLM multi-turn chatbot** | the repositioning is a *quiet* companion, ~90% local; a chatty, every-turn-LLM Mochi is both "more noise" and unbounded cost | shift warmth to local/templated; reserve LLM for capture/breakdown |

## ⚠️ Tensions — keep, but revise or watch
| Feature | Tension | Note |
|---|---|---|
| **Overall feature breadth** (filters, pinned filters, status/priority customization, series-edit dialogs, custom recurrence w/ bySetPos, multi-reminders, store management, themes) | this is the deepest tension: the ADHD/overwhelm user needs *less*; the app has grown toward "does everything," which is Amazing-Marvin territory — the exact thing the wedge says we're the opposite of | run a dedicated **complexity pass**: what can be hidden, defaulted, or progressively disclosed so the first-run surface is calm? |
| **Onboarding (3 screens)** | delays time-to-value for low-patience users | revise to 1 warm screen + warmth *inside* first capture (`REPOSITIONING-SPEC.md` §4) |
| **Groceries tab** (departments, stores, AI inference) | breadth that dilutes focus until the "Connected" thesis ships | keep, don't expand; verify weekly usage once analytics are on |
| **Series-edit dialogs** ("recreate all vs keep modified," segmented this/all) | cognitively heavy for the audience | fine for power moments, but ensure gentle defaults; don't surface complexity upfront |
| **Priority/status customization, pinned filters, drag-reorder** | power-user/customization = off-wedge (Marvin's lane) | don't lead with it; keep as quiet depth, not a headline |
| **"YOUR JOURNEY" lifetime count + Recalibrate/reset** | a *count* brushes "no scores"; a *reset* is odd for an only-grows metric | OK *if* framed as ambient progress (it only grows); reconsider the reset affordance |
| **Reminders / notifications** | table-stakes, but can nag/induce guilt | aligned & free (good retention lever) — but give them a *gentle voice* (see gaps) |
| **Tier model remnants (Max)** | Free/Premium/Max adds choice load | collapse to Free + Premium (already dropped from paywall) |

## ✅ Strongly aligned — the brand core, protect these
- **"Carried over," not "late"** · **reversible done (30-day bin)** · **defer / snooze / "defer all overdue"** — the literal emotional-safety mechanics. The heart of the wedge.
- **Completion firework + chime** — warm, ambient celebration of *showing up*; reduce-motion/sound honored.
- **Reduce-motion toggle + calm palette + only-irreversible-is-red** — lives the calm promise.
- **Today-first Home** — "what's now," not the whole backlog shouting.
- **Notes, Steps/subtasks** — externalize + break-the-scary-into-doable (ADHD-aligned).
- **AI capture / suggest-steps / field pills / grocery inference** — "real task help"; these are the *earned* AI, cost-appropriate as single calls.
- **Unified empty states, gentle copy, Mochi daily line** — the warmth, already ambient.
- **Delete/export reversibility + confirms** — gentle on destructive actions.

## 🕳️ Gaps — missing pieces the promise now requires
| Gap | Why it's needed |
|---|---|
| **Ambient Mochi presence** (home greeting by name/context, kind reframes on overdue, opt-in gentle check-in) | today Mochi only exists as a *summoned* chatbot; the "companion beside you" promise needs the quiet, local, always-there layer |
| **Graceful local fallback** for AI beyond free fair-use | the de-metered model's core mechanic — task still succeeds, no wall |
| **Gentle reminder voice** | reminders currently just fire; an encouraging, non-nagging tone is an ownable micro-wedge |
| **Mochi-sheet accessibility** (RN `<Modal>` a11y flatten) | the audience is ND; a companion they can't navigate with VoiceOver fails the brand (`REPOSITIONING-SPEC.md` §5a) |
| **Analytics** | can't verify any of this lands (activation, reactivation-without-guilt, "deleted because it nagged me") |

## The two headline themes
1. **Monetization mechanics conflict with the brand** — already solved on paper
   (`MOCHI-MONETIZATION-MODEL.md`); it's now an implementation change (remove
   meter + top-ups, de-meter, capability gates, graceful fallback).
2. **Accumulated complexity vs. the low-cognitive-load promise** — the newer,
   harder realization. The app quietly became feature-broad (the general-audience
   pull), which fights the calm wedge for an overwhelmed/ADHD user. The highest-
   leverage *product* work isn't adding — it's a **subtraction / progressive-
   disclosure pass** so the first-run surface feels as calm as the positioning claims.

## Recommended sequence (aligns with the release hold)
1. Ship the paper fixes first — **de-meter** (remove meter + top-ups), **paywall → aspirational**, **collapse to Free+Premium**.
2. Build the **quiet Mochi presence** + **graceful fallback** (the companion layer).
3. Run the **complexity/subtraction pass** (biggest calm-wedge lever).
4. **Gentle reminder voice**, **Mochi-sheet a11y**, **analytics** — the enabling gaps.
5. Onboarding revise (§4). All behind the Apple org conversion.
