# Sagely — Positioning & App Store Copy

This is the source of truth for Sagely's positioning. The behavioral rules in
**Principles** below should anchor every UX, copy, and feature decision. The
**App Store metadata** section is the current text shipped to ASC.

To re-load this into Claude's memory in a future conversation, ask Claude to
read this file and update `memory/project_marketing_positioning.md`.

---

## Principles

### One-liner

A calm to-do app for days you can't be a productivity person.

### Audience

Adults whose nervous systems are already loud — anxiety, OCD patterns, chronic
procrastination, low stress tolerance, negative self-talk — and who find
scoreboard-style productivity apps actively make things worse.

### Need

Track and finish tasks without the daily punishment loop ("you missed your
streak / you're behind / you failed").

### Promise

Move things forward without making the day feel like a scoreboard.

### Anti-positioning (the load-bearing stance)

- No streaks, no quotas, no "X days in a row"
- No exclamation marks anywhere — there's a unit test asserting this for
  every line of mascot copy (`mobile/src/__tests__/mascotLines.test.ts`)
- Past-due is "Carried over," not "Late"
- Done items "tucked away," reversible for 30 days
- Progress = ambient stones in a cairn, not a counter that resets
- Reduce-motion respected throughout
- Calm color palette — only truly irreversible actions are red
- Every destructive action is reversible or confirmed

### Voice

Mochi the mascot — soft, daily, never pushy. *"Mochi's resting. You can too."*
Lines rotate by day-stable seed so they stay the same all session but change
across days. When the user has set a personal quote, it alternates with
Mochi's line so neither one disappears.

### Competitive frame

| Vs. | They | We |
| --- | --- | --- |
| Habitica / Streaks | gamify and punish missed beats | don't keep score |
| Todoist / TickTick | maximize throughput | minimize harm |
| Notion / Things | cold, dense, complex | warm, quiet, focused |
| Apple Reminders | utilitarian, no emotional layer | emotional layer that doesn't grade |

### Mission-aligned features

| Feature | Why it serves the mission |
| --- | --- |
| Notes per to-do (8 KB) | Externalize what's blocking you, the smallest first step, why it matters |
| Snooze (Tomorrow / Next week / Custom) | "I can't face this today" without guilt |
| Defer all overdue → next week | Overwhelm-mode escape hatch; reversible |
| Bin discoverability footer | The 30-day safety net is visible without dominating |
| Mochi line + quote alternate daily | Neither warmth source disappears when the user customizes |
| Subtasks ("Steps") | Break the scary into the doable |
| Multi-instance recurrence with seriesId | Edit/cancel "this and all future" without text matching |

### How to apply

For any feature or copy proposal, ask: **does it punish, grade, or
scorekeep?** If yes, it's wrong for Sagely regardless of how well it'd score
in conventional UX heuristics.

When in doubt, run the dual-lens review (PM lens + UX lens) per
`memory/feedback_dual_lens_review.md` before implementing.

---

## App Store metadata (current — version 1.1.0)

### Subtitle (30-char limit)

```
Calmer to-dos for hard days
```

### Promotional text (170-char limit, editable without re-review)

```
A calm to-do app for days you can't be a productivity person. No
streaks. No quotas. No grading. Just gentle progress, with notes
for what's blocking you.
```

### Description (4000-char limit)

```
Sagely is a calm to-do app for people who find that conventional
productivity tools — with their streaks, scoreboards, and "you missed
your goal" notifications — actively make their anxiety, OCD, or
procrastination worse.

There are no streaks. No quotas. No "X days in a row." If today was
hard, today was hard. Sagely doesn't grade you on it.


THE BASICS, DONE GENTLY

• To-dos with priority, due dates, recurrence, categories, and Steps
  (subtasks)
• Recurring tasks: daily, weekly, monthly, yearly, or custom (specific
  weekdays, "second Thursday," with optional end date)
• Categories with custom colors and an 80+ icon library — drag to
  reorder
• Sign in with Apple, Google, or email
• Cross-device sync via secure cloud storage; offline support so you
  can write anywhere


WHAT MAKES IT DIFFERENT

Past-due is "Carried over," not "Late." A soft re-entry, not a failure.

Done items get tucked away into a 30-day bin — reversible for a month.
Change your mind? They're still there.

Progress shows up as ambient stones in a cairn, not a counter that
resets when life happens.

Mochi, your steady mascot, shows up with a soft daily line. Never
pushy. Never hyped. Just there.


DESIGNED FOR THE HARD MOMENTS

• Notes per to-do — write what's blocking you, the smallest first step,
  why it matters. Your thinking stays with the task, not in your head.
• Snooze (Tomorrow / Next week / Pick a date) for the days you can't
  face an item yet.
• "Defer all to next week" for when Carried over feels heavy. One tap.
  Undoable.
• Steps for breaking the scary into the doable. Each step has its own
  priority and date.
• 30-day bin — every "delete" is reversible.


GENTLE ON YOUR SENSES

• Calm color palette. No anxiety-triggering bright reds — only truly
  irreversible actions are red.
• Reduce Motion respected throughout: splash animation, completion
  bounces, row flashes — all skipped when iOS Reduce Motion is on.
• Optional completion sound and animation, both togglable.
• Quiet typography. No exclamation marks anywhere.
• Optional daily check-in at a time you choose — not a streak, just a
  soft reminder if you want one.


PRIVACY-RESPECTING BY DEFAULT

• Your data is yours. Export everything as JSON, anytime.
• Delete your account and everything goes — cloud data wiped, local
  cache cleared.
• No third-party analytics tracking behavior across apps. No ads.


AVAILABLE IN

English, Simplified Chinese, Spanish, French, German, and Japanese.


Sagely won't make you more productive. It might just make the
productive moments hurt less.
```

### Keywords (100-char limit, comma-separated, no spaces in some locales)

```
anxiety,procrastination,mental health,OCD,calm,gentle,todo,task,reminders,planner,mindful,mochi
```

---

## Screenshot specs (8 screens, narrative order)

Capture from the iOS simulator at App Store sizes:
`1242×2688` (iPhone 6.5"), `1290×2796` (iPhone 6.7"),
`2048×2732` (iPad Pro 12.9").

`scripts/asc_upload_screenshots.py` handles upload to ASC; image dimensions
map to display type via `SUPPORTED_SIZES` in that script.

| # | Screen to capture | What to show | Caption |
| - | --- | --- | --- |
| 1 | All view, populated | Mascot greeting, pebble cairn, 2–3 tasks across Today + This Week with categories | **Your day, gently** |
| 2 | TaskDetails open with notes filled in | Notes textarea visible with sample text like "smallest step: open the doc" | **Externalize what's blocking you** |
| 3 | Long-press snooze menu | Action sheet showing Tomorrow / Next week / Pick a date / Cancel | **Snooze without guilt** |
| 4 | All view with Carried Over expanded | "Defer all to next week →" link visible | **When today feels heavy, defer in one tap** |
| 5 | Done filter view | 30-day retention notice header + a few tucked-away rows | **Reversible for 30 days. Always.** |
| 6 | Subtasks expanded with progress pill | Parent + 3 subtasks (some checked) + chevron + progress | **Break the scary into the doable** |
| 7 | Onboarding screen 1 | Cairn glyph + Mochi line + Skip affordance | **Mochi takes it slow. So can you.** |
| 8 | Profile sheet | Daily check-in section, calm settings | **Quiet by design** |

**Tip**: populate sample data with humane content ("Refill prescription,"
"Email therapist," "Tidy the desk for 5 min") not generic "Task 1." The
sample data IS marketing.

---

## Maintenance

When updating positioning or App Store copy:

1. Edit this file
2. Bump the version reference in the App Store metadata section
3. Commit on `dev`, promote to `main`
4. Ask Claude to re-sync the memory entry
   (`memory/project_marketing_positioning.md`) from this file
