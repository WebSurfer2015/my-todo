# Recurring Todo Redesign Plan

Status: **DRAFT** — awaiting sign-off before implementation.

Owner: yingqin.
Drafted: 2026-05-28.

## Goals

Move from the current **rolling single-instance** model
(`generateRecurringInstances` returns one instance; `todoToggle` snapshots
+ rolls forward) to a **pre-expanded horizon** model where every recurring
series materializes a window of future instances up-front, then tops up
the tail one instance at a time as users complete them.

Pair the new model with a "skip vs defer" affordance on past-due todos
and a "this todo vs series" choice on edits, so users have a calmer way
to deal with missed instances and a clear contract for series-wide
changes.

## Model

### 1. Horizon (storage) vs window (render)

Each series materializes `Todo` rows up to a **horizon** anchored at
the first instance's `dueDate`. The list view renders a **window** that
is *smaller than* the horizon so users don't drown in 30 future daily
todos.

| Freq    | Horizon (materialize) | Window (render in date-bucket groups) |
| ------- | --------------------- | ------------------------------------- |
| daily   | 1 month               | 7 days                                |
| weekly  | 3 months              | 1 month                               |
| monthly | 12 months             | 3 months                              |
| yearly  | 5 years               | 3 years                               |

- Horizon = the latest `dueDate` that has a materialized `Todo` for this
  series. Constants live in `core/src/types.ts` next to `RECURRENCE_FREQS`.
- Window = a filter applied at render time only. Materialized rows
  outside the window are kept in storage (for series-edit, reminder
  scheduling, history) but hidden from default views.
- Window cutoff is relative to **today**, sliding forward with the user.
- Done bin is *not* windowed — once an instance flips to done it shows
  in the normal Done view regardless of its original dueDate.

### 2. Identity

- `seriesId: string` (already on `Todo`) marks every materialized
  instance of one series. UUID v4 generated at series creation.
- The "definition" of a series (freq, byWeekday, bySetPos, interval,
  endDate) is **carried on every instance** in the existing
  `recurrence` field. There's no separate "series row." This keeps the
  data model flat and makes series-wide reads a `filter(t => t.seriesId
  === sid)` away.

### 3. Materialization

Triggers that generate instances:

- **On series creation** — `expandSeries(seed, horizonDate)` produces
  N rows from `seed.dueDate` up to the horizon. Each gets its own
  UUID, the shared `seriesId`, a freshly cloned `subtasks` array, and
  a `recurrence` definition.
- **On completion** — when a series instance flips `done: true` via
  `todoToggle`, the slice computes the new horizon date (last
  materialized + 1 period) and appends one fresh instance. This keeps
  the horizon rolling forward at "1 completion = 1 new tail."
- **On app open / hydrate (top-up)** — for each known seriesId, if
  the latest materialized `dueDate` is more than one period in the
  past relative to today (e.g. user came back after a week away from a
  daily series), top up to the live horizon. This guarantees the
  window always has something to render.
- **On frequency change** — see Edit semantics below.

`endDate` on `Recurrence` still caps the horizon. If `endDate` is
before the natural horizon, we materialize up to `endDate` and stop;
on completion, top-up stops once we'd cross `endDate`. The last
instance triggers an **end-of-series** celebration (Mochi happy-dance
mirroring the bucket-complete moment) — see "End of series" below.

### 4. Reminders

Only the **next upcoming instance** of a series carries a scheduled
local notification at any time. iOS caps pending notifications around
64; scheduling one per materialized row would blow the budget fast.

- On `expandSeries`: schedule the reminder for the first instance only.
- On `todoToggle done` for a series instance: cancel that instance's
  reminder (if any), schedule it on the newly-materialized tail.
- On `todoToggle done → false` (un-do): re-schedule the just-cancelled
  reminder if applicable.
- On series-edit of the reminder spec: cancel current scheduled,
  schedule on whichever instance is now "next upcoming."

### 5. Skip and Defer (new actions on past-due todos)

A past-due todo (recurring or not) shows two new affordances in
`TaskItem` row's swipe / long-press menu:

| Action     | Visible on              | Effect                                                                                                                         |
| ---------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Defer**  | Non-recurring or recurring | Open a small picker (Today / Tomorrow / +3 days / Pick a date). Sets the instance's `dueDate` forward. No series side effect. |
| **Skip**   | Recurring only          | Marks this instance `status = "notDo"` (new). Materializes a tail (same as on-complete) so the series stays at horizon.       |

Both actions are pebble-neutral (no +1) — they're triage, not
completion.

### 6. "Not do" status (new)

Add a new value to `STATUS_FILTERS`: `'notDo'`. Surfaces as a fourth
filter alongside Overdue / Open / Done. Default label: "Not do."

- Data model: instead of mutating `done` (which would conflate it with
  completion), introduce `Todo.status?: 'notDo'` as an optional field.
  Treated as a terminal state — pebble accounting ignores it, Home
  stats ignore it, but the row stays addressable for "restore" and
  shows up in the Not-do filter view.
- Migration: no existing data has this; backward compatible.
- A skipped instance is **not** trashed and **not** done. It just sits
  in the Not-do bin.

### 7. Edit: "this todo" vs "series"

Editing a recurring instance opens a confirm dialog whenever the user
changes a field that *could* propagate:

> *"Apply this change to this todo only, or to the whole series?"*
>
> - This todo only
> - All future events in this series
> - (cancel)

- **This todo only** → the instance becomes **detached**: it keeps
  its `seriesId` (for delete-series-future to still see it), but a
  new boolean `detachedFromSeries: true` is set. Future series-wide
  edits **skip detached instances** unless the user confirms
  "overwrite all" (see PR D / E confirmations). A small toast
  appears: *"This todo was detached from its series. Future series
  edits will skip it."*
- **All future events** → apply the patch to every instance with
  `seriesId === sid` AND `dueDate >= editedInstance.dueDate`. Past
  instances are never touched.
- The "this todo or series?" prompt only fires for changes the user
  would plausibly want to scope. We bypass it for:
  - Toggling `done` (always per-instance).
  - Skip / Defer (always per-instance by design).

### 8. Frequency change confirmation

If a series edit changes `recurrence.freq` (or `byWeekday`,
`bySetPos`, `interval`), every materialized future instance is
invalidated. Confirm dialog:

> *"Changing the frequency will replace future events. What do you want
> to do with events you've already modified?"*
>
> - **Delete all and recreate** — every `dueDate >= today` instance in
>   the series is trashed, then `expandSeries` runs from the new freq.
> - **Keep modified events, recreate the rest** — instances with
>   `detachedFromSeries: true` stay (their `recurrence` keeps the old
>   freq, treated as one-offs from now on); everything else is trashed
>   and recreated.
> - (cancel)

### 9. Subtask series edit confirmation

Editing the parent's subtask list on a series triggers (similar
shape):

> *"Apply this subtask change to this todo only, or to all future
> events?"*
>
> - This todo only — detaches instance.
> - All future events.
> - **Overwrite all future events except already-modified ones**
>   (instances with `detachedFromSeries: true` keep their custom
>   subtasks).

### 10. Pebbles

Unchanged accounting: each instance, when toggled `done: true`,
contributes +1 via the normal `pebbleDelta` path. Skip/Defer
contribute 0. No cap on series — a daily series catch-up that
completes 5 instances in a day really does drop 5 pebbles.

### 11. End of series

When the *last* materialized instance of a series whose `endDate` is
hit completes (top-up would cross `endDate`, so nothing new is
generated), trigger an end-of-series celebration:

- Use the same `triggerPebbleFlight` / Mochi happy-dance path the
  bucket-complete uses on Shopping.
- One-shot only — re-completing (un-done then done again) doesn't
  re-fire.

### 12. Migration of existing data

On first launch after the upgrade:

- For every recurring todo without a `seriesId`, generate one and
  expand the horizon **starting from the current `dueDate`** (i.e.
  treat the rolling instance as the head of a new series). Reminder
  stays on the head.
- For recurring todos that already use the `endDate`-expanded model
  (pre-existing expanded instances), just back-fill `seriesId` if
  missing and continue.
- Migration runs once per device, gated on a `profile.recurringV2: true`
  flag that gets set after success.

---

## PR breakdown

Ordered so each PR is independently shippable on `dev` and the user
can verify on the Amplify dev URL before promoting to `main`.

### PR R1 — Types, constants, expandSeries (core)

- Add `STATUS_FILTERS` entry `'notDo'`; add optional `Todo.status` and
  `Todo.detachedFromSeries: boolean`.
- Add horizon/window constants keyed by `RecurrenceFreq` to
  `core/src/types.ts`.
- Add pure helpers in `core/src/derive.ts`:
  - `horizonDateFor(freq, anchorISO): string`
  - `windowCutoffFor(freq, todayISO): string`
  - `expandSeries(seed: Todo, horizonISO: string): Todo[]`
  - `topUpSeries(todos: Todo[], seriesId: string, todayISO: string): Todo[]`
  - `seriesFutureFrom(todos: Todo[], seriesId: string, anchorISO: string): Todo[]`
- Unit tests covering each frequency's horizon, window cutoff, endDate
  cap, leap-year edge, and DST boundary.

Risk: pure functions only, no caller changes yet. Existing rolling
behavior untouched.

### PR R2 — Migration

- Add `profile.recurringV2: boolean` flag.
- On hydrate in `useTodosSlice`: if `!profile.recurringV2`, walk
  `todos`, assign `seriesId` where missing, run `expandSeries` from the
  current `dueDate` of each recurring todo, persist, set
  `profile.recurringV2 = true`.
- App-open top-up: for each known `seriesId`, if the latest
  materialized `dueDate` is more than one period in the past, run
  `topUpSeries` to today.

Risk: writes during hydrate. Gated by the flag so it runs exactly
once. Cloud-synced via the existing onSaved adapter.

### PR R3 — Completion rewires `todoToggle` for series

- Replace the snapshot+roll branch of `todoToggle` for series
  instances (those with `seriesId`) with: mark this instance done +
  call `topUpSeries`.
- Keep the rolling branch for any legacy todo that *somehow* still
  lacks a `seriesId` after migration — defensive fallback.
- End-of-series celebration: if `topUpSeries` returns no new tail
  because `endDate` would be exceeded AND there are no other
  materialized future instances, fire the Mochi happy-dance via the
  existing pebble-flight chokepoint.

Risk: changes the core completion path. Heavy unit-test coverage; one
end-to-end manual pass on sim.

### PR R4 — Window filter in render

- In `core/src/groups.ts` (or wherever the date-bucket group reducer
  lives), filter materialized recurring instances by
  `windowCutoffFor(t.recurrence.freq, today)`.
- Honor existing filter pills — window doesn't override an explicit
  filter that exposes a recurring instance (e.g. opening the series
  edit sheet shows the full series regardless of window).

Risk: render-only. If we get the predicate wrong, instances "vanish"
but don't get deleted — recoverable.

### PR R5 — Skip + Defer actions

- Add `Defer` to `TaskItem` row long-press for any past-due todo;
  shows a small picker (Today / +1 / +3 / Pick date).
- Add `Skip` to recurring past-due rows; sets `status = 'notDo'`,
  topUpSeries.
- Wire `'notDo'` into the filter pill row as a fourth status pill
  ("Not do") — already supported by the existing
  `getOrderedStatuses` override mechanism.

Risk: UI-only on top of R1–R3.

### PR R6 — Edit dialogs (this todo / series, frequency change, subtask edit)

- In `TaskDetailsSheet`, intercept saves that touch series-eligible
  fields and prompt the user.
- Implement the three dialogs (R7-9 in the spec).
- Toast on detach: *"This todo was detached from its series."*

Risk: most user-facing surface. Multi-lens review (PM + UX + dev +
QA + a11y) per the existing memory rule before submission.

### PR R7 — Reminder rescheduling on series

- Update reminder scheduling to: cancel current series reminder on
  toggle-done, schedule on the new tail.
- Series-edit of reminder propagates only to the *next upcoming*
  instance, not every materialized row.

Risk: native module surface (notifications). Test on physical
device, not just sim.

---

## Open items (not blocking the plan, but flag before R5/R6)

- Defer picker exact options — sticking with Today / +1 day / +3 days /
  Pick a date unless feedback says otherwise.
- Skip discoverability — long-press only, or also a swipe? Recommend
  long-press only for now to mirror Defer.
- "Not do" Home stat impact — current proposal: ignore in dToday /
  dWeek / dMonth counts. Confirm.

## Non-goals

- Web parity (R1–R7 ship mobile-only first; web catches up after).
- Multi-device merge of partial completion. Existing last-write-wins
  per-todo is fine — each materialized instance is its own row.
- AI-driven recurrence suggestions ("you've added 'water plants' three
  Sundays in a row…"). Out of scope.
