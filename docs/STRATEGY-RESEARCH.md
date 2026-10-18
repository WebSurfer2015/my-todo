# Strategy research — competitive landscape, white space, market

Research inputs behind `POSITIONING.md` (the positioning source of truth) and
`REPOSITIONING-SPEC.md` (the product spec). Consolidated 2026-10-18 from four
docs; their full history is in git. Two review docs were **applied, then
retired**: the feature-alignment audit became `REPOSITIONING-ROADMAP.md`, and
the PM/UX dual-lens review was folded into `REPOSITIONING-SPEC.md`.

- [1. Competitive & positioning brief](#1-competitive--positioning-brief) (2026-10-17)
- [2. Feature map & white space](#2-feature-map--white-space) (2026-10-17)
- [3. Personas & market sizing](#3-personas--market-sizing) (2026-06-05)

## 1. Competitive & positioning brief

Decision question: should Sagely reposition from a special-needs focus to
serving **both** special-needs **and** a general audience (students → young &
older professionals who want to track to-dos without feeling overwhelmed)?

Built from a verified deep-research pass (108 agents, 25 sources fetched, 19
claims confirmed / 6 refuted via adversarial verification), 2026-10-17.
Complements `POSITIONING.md` and §3 below.

---

### Verdict
**Broaden the *message*, never the *core*.** The evidence validates a
"lead-with-overwhelm, generalize-by-discovery" strategy — but it refutes
"reposition *from* special-needs *to* general." The neurodivergent (ND) niche
is where the money is; the general audience is a halo, not a market. Abandoning
the ND anchor is the documented failure mode.

### The precedent: Tiimo = Sagely, ~3 years ahead
Tiimo (ADHD/autism visual planner) ran exactly this strategy:
- **Dual positioning** — ND core ("built by and for people who think
  differently," "for ADHD, Autism") wrapped in broadening copy ("Visual Planner
  for Every Neurotype," "Overwhelmed by to-dos?", FAQ "Do I have to be
  neurodivergent? Nope!").
- **It scaled:** 500k+ users, ~50k paying (**~10% free→paid**, strong for a
  to-do app), $4.8M raised, **Apple's 2025 iPhone App of the Year.**
  *(Company-self-reported, corroborated by Wikipedia + tech.eu; not audited.)*

**The decisive data point:** after broadening the message, **75%+ of Tiimo's
*paying* subscribers are still neurodivergent.** Broadening the funnel did not
dilute the ND concentration of revenue. At the capital level Tiimo *doubled
down* on ND (funding → ND growth, learning platform, web), not a general pivot.

### The curb-cut logic — and its warning
The "curb-cut effect" (disability-first features adopted by a far larger
mainstream — curb cuts, captions, Velcro) is a real, documented basis for
"design for ND, generalize by discovery." But the same literature warns:
framing accessibility primarily by *general* benefit "subordinates disability
accessibility" and leads to abandoning design for disabled users. **Broaden the
door; don't move the house.** (Evidence is conceptual/analogical — not a proven
ND-SaaS→general case; Tiimo's 75%-ND-payers is the one hard data point and it
argues for staying niche-anchored.)

### Two hard truths
1. **Mochi's AI task-breakdown is not a moat.** Tiimo gives AI subtask
   generation away free (rate-limited); Goblin Tools "Magic ToDo" — built for
   ADHD task-paralysis — is free/near-free and a community default. The feature
   is commoditized in exactly this niche. Price on the *whole calm system*
   (capture + gentle reminders + reversibility + habit), not the one feature.
2. **Sagely is underpriced.** Todoist Pro rose to $60/yr (Dec 2025, +25%),
   TickTick ~$50/yr, Twos $4.99/mo + $1.99 à-la-carte + $11.99 bundle, Tiimo Pro
   materially above Sagely (exact figure contested in sources — treat as
   unconfirmed, but clearly higher than $19.99/yr). Room to move toward
   **$29.99–$39.99/yr** once conversion is measurable.

### The threat I'd under-weighted
**Tiimo already occupies the position Sagely would broaden into** — ND-calm-
planner-going-mainstream — with funding, scale, and Apple's blessing. Sagely
cannot out-fund or out-feature them. Tiimo's wedge is **visual / time-blocking
(time-blindness).** Sagely's must be *different*: **emotional calm /
anti-scorekeeping / Mochi's warmth**, not visual time-structure. Pick it and
sharpen it — don't blur into "calm to-dos for everyone."

### Differentiation vs the floor and the power incumbents
- **vs Apple Reminders (free, default):** the only credible wedge is emotional —
  "an app that doesn't make me feel behind" — and it's only credible if Sagely
  *leads* with the overwhelmed identity. For a general, non-overwhelmed user,
  "free and pre-installed" wins.
- **vs Todoist / TickTick:** don't try to out-feature them; that's the muddy
  middle that kills "nicer general to-do apps."

### Recommendation
1. Adopt the Tiimo model deliberately: **lead with ND/overwhelm, let general
   self-recruit.** Keep the ND anchor in product design and brand credibility.
2. **Pick a distinct wedge vs Tiimo** — calm/emotional, not visual planning.
3. Stop treating Mochi's breakdown as the paid hook; sell the whole calm system.
4. Raise price toward $29.99–$39.99/yr once conversion is instrumented
   (first-party measurement: `MEASUREMENT-PLAN.md`).
5. Accept the ND niche as the **revenue core**, not a stepping stone.

### Data caveats
- Tiimo scale/conversion/75% figures are company self-reported (corroborated, not audited).
- Round 1 surfaced **no verified data** on Amazing Marvin, Structured, or
  beachhead CAC/ASO economics (→ follow-up pass running).
- No voice-of-customer (specific praise/complaints) survived verification —
  findings are positioning/pricing/traction, not review sentiment.
- Pricing is time-sensitive (late-2025/2026) and will drift.

### Key sources
Tiimo: tiimoapp.com, tiimoapp.com/resource-hub (freemium + funding), Wikipedia,
tech.eu (2024 $4.8M round). Goblin Tools: goblin.tools/About, datastudios.org.
Twos: twosapp.com/pricing, App Store. Pricing: todoist.com (2025 price update),
2sync.com (TickTick vs Todoist). Curb-cut: Wikipedia "Curb cut effect," Reid
SSRN 4262991.

---

### Gap-fill (round 2) — competitors + beachhead
Second verified pass (108 agents, 25 sources, 20 confirmed / 5 refuted).

#### Amazing Marvin — premium ADHD power-user tool
- **Positioning:** "The Customizable Task Manager for ADHD"; App Store title
  "Amazing Marvin: ADHD Planner." Built by an ADHD founder; named ADHD features
  (Procrastination Wizard, focus timers, brain dump). Maximally customizable
  (50+/300+ strategies), steep learning curve.
- **Pricing:** $11.99/mo, $96/yr ($8/mo annual, 33% off), 14-day trial (no
  card), **no free plan.** A ~$300 lifetime is third-party-reported but absent
  from the current pricing page (treat as discontinued/uncertain).
- **Read:** proves ND power users pay a premium ($96/yr ≈ 5× Sagely) — but it's
  the *opposite* of calm (complexity-maximalist). Not Sagely's lane; useful as a
  price ceiling and a "what overwhelmed users flee from" contrast.

#### Structured — mass-market visual planner, ADHD-leaning
- **Positioning:** "Built for ADHD minds, busy professionals, and students";
  "ADHD-friendly daily planning that actually sticks." Visual timeline
  day-planner selling "time-blindness" relief. ADHD is the **lead** segment
  within a broader audience — i.e. already running Sagely's proposed dual
  positioning, at scale.
- **Pricing:** freemium (generous free tier) + Pro $6.99/mo, $29.99/yr, $99.99
  lifetime (US, Sept 2026); regional variance.
- **Traction:** 4.8/5, ~168K ratings, ~1.5M active users, Editors' Choice (iOS).
- **Read:** strongest evidence that "lead-with-ADHD, broaden to general" works at
  mass scale — and a direct, well-resourced competitor.

#### The niche is CROWDED, not open
Beyond Tiimo/Goblin: Structured (~1.5M users), Amazing Marvin (premium),
**neurolist** ("neurodivergent task splitter," AI planner, 100K+ downloads,
~4.8/5 from ~910 ratings), ADHD Organizer: MindPilot. Incumbents cluster at two
poles: **(a) visual / time-blocking** (Tiimo, Structured) and **(b) AI
task-splitting** (neurolist, Goblin, Marvin's wizard). Sagely would enter late
and under-resourced against Apple's App of the Year (Tiimo: 4M+ downloads), a
1.5M-user Editors' Choice (Structured), and a free beloved tool (Goblin).

#### Beachhead: ADHD adults — strongest-evidenced, with a caveat
- **Market:** ~15.5M US adults with a current ADHD diagnosis (6.0%), ~half
  diagnosed as adults (CDC MMWR, Oct 2024).
- **WTP:** Tiimo 50K+ paying (3-of-4 ND); Marvin sustains $96/yr; Structured
  $29.99/yr at scale.
- **Low-CAC organic channels (inferred, not benchmarked):** Reddit r/ADHD
  word-of-mouth demonstrably drives app discovery (Goblin grew this way);
  TikTok #ADHD ~10.6B views.
- ⚠️ **Honest gap:** evidence substantiated ADHD adults heavily; "anxious
  professionals" and "students who freeze" were NOT separately evidenced. No
  hard CAC $ figures surfaced; ASO keyword-competition data not obtained. So
  "ADHD adults cheapest/most reachable" rests on evidence *volume*, not
  head-to-head data.

#### Sharpened recommendation: pick the UNOWNED wedge
ADHD adults is the right beachhead, but "ADHD planner" is crowded and the
incumbents own **visual time-structure** and **AI task-breakdown** (the two
things Sagely is NOT distinctively better at). The **open wedge is emotional
safety** — anti-scorekeeping, shame-free, "carried over" not "late,"
reversibility, Mochi's warmth. Nobody is leading with *"a to-do app that doesn't
make you feel like a failure."* That maps to the **anxious / overwhelmed slice
of ADHD & AuDHD** (rejection-sensitivity–adjacent), not the "I need to see my
time" slice.

**Net:** beachhead = ADHD adults who feel *shame/anxiety* about their to-do
lists; wedge = **emotional safety**, explicitly NOT visual planning or AI
breakdown (both owned). Price toward $29.99/yr (Structured's anchor), not the
current $19.99.

## 2. Feature map & white space

Maps the feature/experience surface of the main competitors, then finds the
gaps a *warm and calm* to-do app (Sagely) can own. Pairs with §1.

> **Confidence note:** positioning and pricing are from the two verified
> deep-research passes. Specific *feature* checkmarks mix that research with
> general product knowledge of each app — directionally reliable, but verify
> any single cell before betting on it. 2026-10-17.

### Axes that matter in this market
- **AI breakdown** — turn a vague/scary task into concrete steps
- **Warm/companion AI** — AI as a *character* that reassures, vs a cold utility
- **Visual time-blocking** — see the day as a timeline (time-blindness aid)
- **Calm framing** — anti-scorekeeping, gentle language, reversibility, no streaks
- **Rich free reminders** — multi/recurring reminders without paywall
- **Emotional warmth** — does using it *feel* kind/encouraging
- **Breadth** — beyond tasks (groceries, habits, notes)
- **Price (annual)** / **platforms**

### The map
Legend: ✅✅ core strength · ✅ present · ➖ partial/weak · ❌ absent

| App | AI breakdown | Warm/companion AI | Visual time-block | Calm framing | Free reminders | Emotional warmth | Price/yr |
|---|---|---|---|---|---|---|---|
| **Sagely** | ✅ (Mochi steps) | ✅✅ (Mochi character) | ❌ | ✅✅ (explicit) | ✅ (multi, free) | ✅✅ | $19.99 |
| Tiimo | ✅ (free, capped) | ➖ (Co-Planner) | ✅✅ | ✅ (ND-gentle) | ✅ | ➖ | ~$79 |
| Structured | ✅ (Pro) | ❌ | ✅✅ | ➖ | ✅ (free tier) | ➖ | $29.99 |
| Amazing Marvin | ➖ (wizard) | ❌ | ➖ (configurable) | ❌ (gamified/complex) | ✅ | ❌ | $96 |
| Goblin Tools | ✅✅ (the product) | ❌ (utility) | ❌ | ➖ (ND tone) | ❌ | ~free |
| neurolist | ✅✅ (splitter) | ➖ | ❌ | ➖ (single-task focus) | ➖ | n/a (unverified) |
| Todoist / TickTick | ➖ (some AI) | ❌ | ➖ (TickTick) | ❌ (throughput) | ✅ | ❌ | $50–60 |
| Apple Reminders | ❌ | ❌ | ❌ | ❌ (utilitarian) | ✅ | ❌ | free |
| *Finch (adjacent)* | ❌ | ✅✅ (pet) | ❌ | ✅✅ | n/a | ✅✅ | ~$40 |

*Finch is a self-care/habit app, not a to-do app — included because it proves a
warm, emotional, companion-led product wins at huge scale.*

### Where the white space is
Reading the columns, two are almost entirely empty across real to-do apps:
1. **Warm/companion AI** — only Sagely has AI as a *character* (Mochi).
   Everyone else treats AI as a cold utility (Goblin/neurolist splitters,
   Tiimo's capped generator). Finch proves a *companion* drives love and
   retention — but Finch does self-care, not tasks.
2. **Calm framing (anti-scorekeeping)** — only Sagely makes it the thesis.
   Structured/Tiimo are "ADHD-friendly" but still structure-first; Todoist/
   TickTick actively gamify; Apple is neutral.

**The intersection — "warm companion × calm framing × real task help" — is
unoccupied.** The incumbents own *visual time-structure* (Tiimo, Structured) and
*AI breakdown as a utility* (Goblin, neurolist). Nobody owns *emotional safety*:
a to-do app that feels like a kind friend and doesn't make you feel behind.

### Gaps → opportunity bets (ranked)
1. **Own "emotional safety" in ADHD/overwhelm to-dos** *(primary)* — lead with
   "a to-do app that doesn't make you feel like a failure." Mochi as a warm
   companion, not a utility. This is the one column no real competitor fills and
   it's Sagely's existing DNA. Target: the anxious/shame-prone slice of ADHD &
   AuDHD (RSD-adjacent).
2. **Fuse warmth + utility so free tools can't out-cheap you** — Goblin is free
   but cold and stateless (no memory, reminders, or warmth). Pair Goblin-grade
   breakdown *with* a companion that remembers you and reassures you. The moat is
   the relationship, not the splitter.
3. **Calm-aligned monetization as a differentiator** — nobody has cracked
   monetizing the calm/ND niche without quota anxiety (and it's Sagely's current
   self-inflicted problem). "The calm app that doesn't nickel-and-dime your
   focus" could be a *marketing* story, not just a fix. Abundance framing,
   capability gates, no depleting meter.
4. **Gentle reminders that don't nag** — reminders are table-stakes and free
   everywhere, but all of them can feel like guilt. A reminder *voice* that's
   encouraging ("no rush — here's today") is an ownable micro-wedge and plays to
   the companion angle.
5. **(Riskier) the overwhelmed-caregiver/parent adjacency** — ~25% of Tiimo's
   payers are non-ND, plausibly caregivers/parents. An emotional, non-clinical,
   large segment ("running a household is a lot") that the calm+warm frame fits.
   Watch scope — this is where the groceries breadth could finally earn its keep
   under a "whole life, gently" story (the deferred Connected thesis).

### What NOT to chase
- **Visual time-blocking** — Tiimo + Structured own it, funded and at scale; a
  late, under-resourced timeline is a losing fight.
- **AI breakdown as the headline paid feature** — commoditized (Goblin free,
  Tiimo free-capped). Keep it; don't price on it.
- **Power-user customization** — Amazing Marvin owns it and it's the opposite of
  calm.
- **"Calm to-dos for everyone"** — the undifferentiated middle; see the brief.

### One-line synthesis
The product should be the **warm companion that makes task overwhelm feel
survivable** — emotional safety is the empty column, Mochi is the asset no one
else has, and the free/visual/power lanes are already lost. Build the
relationship, not another planner.

## 3. Personas & market sizing

**One-pager: direction, personas, market sizing, and the strategic guardrail.**
The behavioral/voice rules and shipped store copy live in
[`POSITIONING.md`](./POSITIONING.md); this section is the *why* and *how big*
behind the current direction. Last updated 2026-06-05.

---

### Personas

**1 — The overwhelmed working professional** (primary)
Juggling work + family + event planning + social + self-care. Competent and
busy, but quietly burned out by scoreboard apps that add pressure instead of
removing it. Wants to move things forward without being graded. Pays for tools
that respect their attention.

**2 — The young professional** (secondary)
Similar load, earlier in career, mobile-first, price-sensitive but
willing to subscribe to something that feels made for them. Reached through
community/content, not paid ads.

**Shared psychographic — "done being optimized."** Both personas overlap
heavily with the burnout-adjacent / adult-ADHD / ambient-anxiety population,
which is now mainstream among knowledge workers, not a clinical edge case.

### Market sizing

> Third-party "market size" reports are unreliable for this decision — the
> *same* to-do market in 2025 is quoted anywhere from $1.0B to $3.2B depending
> on whether enterprise seats are bundled. Top-down numbers are directional
> context; the **bottom-up model** drives the call.

#### Top-down (directional context)

| Market | 2025 size | CAGR | Note |
| --- | --- | --- | --- |
| To-do / list apps (consumer slice) | ~$1.1–1.2B | ~10% | Defensible core comp; $3.2B figures include enterprise PM |
| Productivity apps (broad) | ~$13B | ~10% | Too broad — includes Slack/Notion/enterprise collab |
| Mental-health / wellness apps | ~$9.6B → $45B by 2035 | **~16.7%** | The faster-growing half Sagely taps |

#### Willingness-to-pay proof points

- **Sunsama:** 300k+ users at **$20/mo** — professionals pay a premium for
  calm/intentional framing.
- **Calm:** ~$7.9M/mo US revenue — "calm" as a consumer brand promise
  monetizes at scale.
- **Todoist:** $4–6/mo, and **raised prices 25–40% in Dec 2025** — pricing
  power exists even in commodity to-do.
- Sagely's realistic band is the **consumer-mobile** one (~$30–50/yr), not
  Sunsama's $240/yr: broader top-of-funnel, lower ARPU.

#### Bottom-up — what "real life" opens up

- US adults ~258M; smartphone-using ~220M.
- The "done being optimized" psychographic: anxiety disorders ~19% of US
  adults/yr (~40M), adult ADHD ~4.4% (~10M, 70% with comorbid anxiety), plus
  burnout-adjacent knowledge workers. De-duplicated, a conservatively
  **50–70M reachable US adults** — and several hundred million globally across
  Sagely's 6 shipped languages.
- **Repositioning math:** the old clinical framing reached ~40M *with* a
  self-identification penalty. "Real life" keeps the emotional hook but removes
  the clinical gate, so the *reachable* top-of-funnel roughly **triples**
  without diluting differentiation.

#### SOM — 3-year revenue scenarios (US-led, mobile B2C)

| Scenario | MAU (yr 3) | Paid conv. | Price | ARR |
| --- | --- | --- | --- | --- |
| Conservative | 100k | 5% | $30/yr | **~$150k** |
| Base | 500k | 6% | $40/yr | **~$1.2M** |
| Bull | 1M+ | 8% | $48/yr | **~$3.8M** |

Base case (~$1–1.5M ARR) is a real business for a small team, reachable
*because* niche keywords + an emotional hook give cheap organic CAC
(content/community, not paid ads) — which the broad "productivity" segment does
not.

---

### Marketing strategy (summary)

- **Category, not feature, war.** Enter "calm productivity," don't compete *in*
  "productivity." Frame against Sunsama/Motion as *"productivity that doesn't
  treat you like a machine."*
- **ASO discipline.** Keep the niche-keyword bet (`mochi`, `pebble`, `calm
  todo`, `calm planner`); add "calm planner," "shared grocery list," "ADHD
  friendly," "burnout." Don't chase generic high-competition terms.
- **Channels.** Organic content + community (ADHD / burnout / anti-hustle /
  calm-tech), not performance ads — cheapest CAC and on-brand.
- **Pricing.** Calm-pro sustains a subscription (~$30–50/yr); Sagely is likely
  under-monetizing while fully free.

---

### Sources

- [Fortune Business Insights — Productivity Apps Market](https://www.fortunebusinessinsights.com/productivity-apps-market-110254)
- [Research and Markets — To-do List Apps Market 2025–2030](https://www.researchandmarkets.com/reports/6083601/to-do-list-apps-market-global-forecast)
- [Mordor Intelligence — Mental Health Apps Market](https://www.mordorintelligence.com/industry-reports/mental-health-apps)
- [Statista — Meditation & mental wellness apps](https://www.statista.com/topics/11045/meditation-and-mental-wellness-apps/)
- [Sunsama Pricing](https://www.sunsama.com/pricing)
- [Todoist Pricing](https://www.todoist.com/pricing)
- [ADDA — Adult ADHD & burnout](https://add.org/adhd-burnout/)
