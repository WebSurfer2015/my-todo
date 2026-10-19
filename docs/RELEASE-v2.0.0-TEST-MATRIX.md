# Release v2.0.0 — Feature & Test Matrix

Page-by-page inventory of supported features, what automated tests cover, and
the on-device checklist to run before submitting **v2.0.0** (the repositioning:
planner → quiet companion, de-metered Mochi, Free + Premium only). Renamed from
the v1.7.0 matrix and refreshed 2026-10-18 against the code on `dev`.

> **Release status:** code is on `dev`; CI green (core, mobile, functions,
> Firestore rules; typechecks; arch gate). Promotion to `main` + `eas build
> --auto-submit` are **held** until the Apple account's Individual→Organization
> conversion completes and the **Paid Applications Agreement** is re-signed
> under the org (IAP can't be sold until then). **Also required before
> promoting:** deploy Cloud Functions (see §0) — the privacy policy goes live
> on promote and describes server behavior that ships only with that deploy.
> Everything below can be tested on-device in the meantime — the paywall via
> the local StoreKit config (`mobile/storekit/Sagely.storekit`).

**Legend:** ✅ logic covered by automated unit tests · 🤖 also has a Maestro E2E
smoke flow · ✋ **needs manual on-device testing**

---

## 0. Pre-flight (server + store) — before the device pass
- [x] `firebase deploy --only functions` (repo root) — **done 2026-10-18**:
      `onUserDeleted`, `metricsRollup`, webhook deleted-user guard, de-metered
      quota copy, max-instance caps; Cloud Scheduler API enabled; all five in
      us-central1; enforcement OFF
- [x] Firebase Console → Functions lists `onUserDeleted`, `metricsRollup`,
      `agentChat`, `aiInfer`, `revenuecatWebhook` (verified 2026-10-18)
- [ ] Next day: Firestore → `metrics/{yesterday}` exists and holds **counts
      only** (no uids)
- [x] One-off orphan cleanup (roadmap C.2) — **done 2026-10-18**: 1 tree
      erased, re-check 0 orphans (no backup, by design)
- [ ] ASC: exactly **2** IAP products, Ready to Submit, attached to 2.0.0
- [ ] ASC: App Privacy label published per `docs/APP-PRIVACY-LABEL.md` —
      **do this now**, it's app-level (roadmap C.5); Device ID is required
      (RevenueCat sends the IDFV)
- [ ] Budget alert set on the Cloud billing account (roadmap C.8)
- [ ] After promote: `websurfer2015.github.io/my-todo/PRIVACY.html` shows the
      Oct 2026 policy (Pages serves `main:/docs`)
- [ ] **After v2.0.0 is live with IAP active** (roadmap 5.6): upgrade
      `firebase-functions`, set `MOCHI_TIER_ENFORCEMENT = true`, redeploy
      functions, re-probe (401 / 401 / 405). Never before — v1.6 users would be
      capped with no upgrade path

## Page-by-page

### 1. Sign-In / Auth
6-language picker · Apple sign-in · Google sign-in · email sign-in · create
account (first/last name, password ≥6) · forgot-password reset · show/hide
password · return-key chaining · Android back → landing.
- ✅ auth error mapping (Firebase + Apple/Google codes), per-flow guidance
- 🤖 email/password sign-in + sign-out
- ✋ Apple/Google native sheets (incl. first-ever name capture, cancel), reset email

### 2. Dashboard / Home
Greeting/quote/avatar header · Day-1 welcome · TODAY (today-due + carried-over,
headers → Todos) · all-caught-up / nothing-pending states · What's Next /
Peek-ahead · FAB → capture · row long-press → Defer.
- ✅ tile ordering/pinning, overdue selection, group building (+ perf budget)
- 🤖 cold-launch lands on Home
- ✋ greeting personalization, Peek-ahead feel

### 3. Todos list
Search (top sheet + pill) · filter funnel → Filter sheet · FilterBar pills
(apply/clear, long-press pin/unpin/remove) · collapsible date buckets ·
Defer-all per group · Done view (per-date Delete-all, Clear-completed,
retention notice) · Trash view (Empty-trash, bulk Restore/Delete/Clear) ·
overdue Defer-all · empty/no-match/filter-mismatch states · bin-peek footer.
- ✅ filter-set matching (AND/OR, done+trash grace), pinned-filter caps,
  status/priority customization, bulk restore/delete, clear-done, 30-day retention
- 🤖 toggle-done-and-strike, swipe-to-trash+undo, defer-all-group,
  clear-completed, bulk-trash-restore, empty state
- ✋ swipe feel, section collapse, destructive Alert copy

### 4. Task row (Home + Todos)
Tap/checkbox toggle done (chime + firework + bounce) · parent expand/collapse ·
subtask toggle · swipe-right Edit/Mark-Done (full-swipe auto-commit) ·
swipe-left Defer/Not-Do/Delete · bin-row Restore/Delete · inline
priority/category/date pickers · long-press snooze (Tomorrow/Next week/Pick date).
- ✅ todoToggle, subtask lifecycle (add/toggle/remove/priority/date, parent
  auto-complete), skip/notDo, due-date reschedule
- 🤖 toggle-done, defer-single-via-swipe
- ✋ firework/chime/haptics, swipe gestures, reduce-motion/sound honoring,
  iOS inline vs Android native date pickers

### 5. Compose (Add) sheet
Title input · swipe-down discard-confirm · "Ask Mochi instead" · "you've added
this before" auto-fill · AI field-suggest pills (category/new-category/
priority/date/recurrence/reminder) · Category/Priority/Complete-by/Repeat/
Repeat-ends/Remind-me rows · Suggest-steps AI · manual add step.
- ✅ newTodo, field-suggestion hook (hasExtractableSignal, debounce, stale
  guard), suggest-steps hook (incl. the gentle "Mochi's resting" note over the
  fair-use ceiling — never the server text), AI op validation
- 🤖 FAB → Compose → add → row appears
- ✋ AI pill round-trip (live Cloud Function), date + notification-permission prompts

### 6. Task Details / Edit sheet
Auto-save on dismiss, true-revert Cancel · series segmented control (this-only
vs series) · title/notes · all field rows · steps (suggest/clear-all/per-step
edit/add) · step editor (delete) · footer Save/Delete/Skip/Mark-done ·
series-commit dialogs (recreate-all vs keep-modified; overwrite-all vs
keep-modified) · Android back pops sub-views.
- ✅ todoSet, series recurrence-change & subtask-shape commit, detach-from-series,
  notes propagation, reminder transfer
- 🤖 long-press → details sheet renders
- ✋ series-edit dialog UX, auto-save-vs-revert on-device

### 7. Reminder / Recurrence / Add-subtask pickers
ReminderSheet (before-due multi-select ≤10, repeating single-select,
specific-time add, per-reminder remove, clear-all) · CustomRecurrenceForm
(interval stepper, Day/Week/Month/Year, weekday + week-position pills, live
preview) · AddSubtaskSheet.
- ✅ **nextOccurrence incl. the new month-end + Feb-29 clamp**, byWeekday/
  bySetPos, series expand/top-up, multi-reminder normalization + rebasing, reminder-id scheme
- ✋ **actual notification scheduling + firing (foreground/locked), recurring
  reminders firing repeatedly, delete-cancels-notifications** — the new
  subtask-complete reminder-clear fix lives here

### 8. Defer sheet
Tomorrow / A week / A month / Pick-a-date; single + bulk.
- ✅ setDueDates defer/reschedule · 🤖 defer-all-group, defer-single · ✋ native date picker

### 9. Shopping / Groceries
Search · store filter · collapsible department groups · SAVED accordion
(often-picked + past, tap to re-add) · grocery compose (serial add, saved-item
matches, AI department inference, store multi-select, new-store proposal) ·
grocery edit (department/stores/delete) · Manage Store (drag-reorder, rename,
hide/unhide, delete, add-store + AI link-existing) · check-off → firework → Past.
- ✅ grocery new/migrate/toggle/edit/delete, autocomplete matching, local + AI
  department inference, store derivation, legacy store→stores[]
- 🤖 add-item sheet, add-store, empty state
- ✋ AI inference live round-trip, check-off firework, drag-reorder gesture

### 10. Filter / Category management
Select-Filter (statuses/priorities/categories multi-select) vs Manage-Filters
(drag-reorder, rename, hide, pin, delete-with-reassign, add category with
color+icon grid).
- ✅ category delete-cascade (trashes todos, strips pinned filters, refuses
  last), reference migration, priority/status reorder/hide
- ✋ drag-reorder gesture, color/icon grid, delete-reassign Alert

### 11. Ask Mochi (AI chatbot) — de-metered
Multi-turn chat · example/frequent chips · **no usage meter, never a paywall**:
over the invisible fair-use ceiling (server `RESOURCE_EXHAUSTED` — the only
gate) the words go to manual Compose — mid-conversation the open
request is rebuilt ("call mom — Friday") · proposal cards (Confirm/Review&add/Delete, optimistic add + Undo, editable
capture chips, PickTodos checklist with Skip/Defer/Delete, series-delete fork) ·
all writes via store mutations + destructive confirms.
- ✅ agent tool registry + validateOperation (every op), server parsers
  (breakdown/classify-dept/suggest-fields/link-store), client↔server parity, AI
  cost guards, fallback-capture rebuild (`buildFallbackCapture`)
- ✋ entire live chat UX (CF latency, "thinking"), proposal-card apply flows,
  over-ceiling fallback → Compose (client + server paths)

### 12. Paywall / Membership ⚠️ *(IAP blocked until org conversion; test locally via StoreKit config)*
Annual/Monthly toggle ($29.99/yr annual-led · $4.99/mo) · Free/Premium cards ·
Subscribe/Start-trial (7-day) → StoreKit sheet · Restore purchases ·
Manage/cancel subscription · Terms/Privacy links. **No top-ups, no Max, no
lifetime** (removed in the de-meter). Reached only aspirationally (locked
theme, Settings → Membership) — never from a Mochi wall.
Products the paywall expects (must exist in ASC, Ready-to-Submit, attached to version):
`com.websurfer.mytodo.premium.monthly`, `.premium.annual` — **only these two**.
- ✅ entitlement math (RevenueCat webhook events, tier mapping, lapsed
  downgrade, invisible fair-use ceilings, feature gates, revenue loss-safety),
  upgrade/product ranking, core↔server parity; webhook ignores events for
  deleted accounts
- ✋ purchase / restore / trial / upgrade / cancel against StoreKit — the whole SDK/UI integration

### 13. Profile / Settings / Theme / Animation&Sound
Avatar (camera/library/Mochi, crop/compress) · name/quote (random-daily
shuffle) · **"YOUR JOURNEY" lifetime pebble count + recalibrate/reset** ·
sign out · Settings (membership, theme, manage todos/store, animation&sound
toggles, Mochi toggle, tips/intro, export data → share sheet, delete-data-only,
delete-account) · ThemeSelector (locked themes → paywall) · reduce-motion /
completion-animation / completion-sound toggles.
- ✅ profile migrate (avatar/name/quote caps, density, guides, the 3 usage
  dates), `refreshUsageSignals` (own `state/signals` doc; failed read never writes), export payload, server-side account erasure
  (`deleteUserTree`: exact `users/{uid}` subtree, unsafe uids refused),
  comp-allowlist, avatar color math
- 🤖 sign-out; ProfileSheet lifetime count renders
- ✋ camera/photo-library + permissions, export share sheet, delete-account
  re-auth path, theme live apply, reduce-motion suppressing firework, recalibrate confirm dialog

### 14. Onboarding / Guides / Firework / Empty states
3-page onboarding · guides prompt + menu + carousel · app-level firework
overlay (survives row unmount) · shared EmptyStateCard.
- ✅ mascot copy locale parity, firework color tint, empty-state structure,
  a11y sheet-guard (no backdrop Pressable)
- 🤖 todos/shopping empty states, tab navigation, relaunch persists
- ✋ onboarding flow, guides carousel, firework visual + reduce-motion, VoiceOver per sheet

### 15. Server / Cloud Functions (new in 2.0.0)
`onUserDeleted` (auth delete → recursive delete of `users/{uid}`) ·
`metricsRollup` (06:15 UTC daily → `metrics/{yesterday}`, counts only) ·
`revenuecatWebhook` deleted-user guard · de-metered `resource-exhausted` copy.
- ✅ `deleteUserTree` (7 tests), `rollUpMetrics`/`addDays`/`toDay` (7 tests:
  month/year/DST, Auth date format, future-signup exclusion, counts-only output)
- ✋ the triggers firing in production (see §0 and the Privacy checklist)

---

## ✋ Manual on-device checklist

### Phase 2 interaction redesign (2026-10-18) — new behaviour, all ✋
- [ ] **Onboarding:** fresh account → one screen; a starter chip pre-fills (doesn't send); send → Mochi opens and answers your words; "I'll look around first" → Today. Privacy link opens the policy. Settings → Show intro again re-shows it.
- [ ] **Rows:** tapping a row body opens it; only the circle completes. Every completion shows "Done: … · Undo"; three quick completions merge into "3 done · Undo all", and Undo restores all of them. A to-do with steps: the circle completes every step, Undo brings back the previous step state, and the "1/3 ›" pill expands the steps.
- [ ] **Details sheet:** no Save/Cancel, just Done. Edit the title, close → "Changes saved · Undo" → Undo restores the title and any picked fields. Edit series → its dialogs still appear and there's no toast.
- [ ] **Compose:** From the To-dos tab a new to-do has **no date**; from the Today tab it starts on **Today** (so it doesn't vanish). The When chip opens Today / Tomorrow / This weekend / Next week / Pick a date / No date, and × clears it. More shows Remind / Repeat / Priority / Steps / Notes, and notes save.
- [ ] **Reminders:** a dated to-do shows Day before / Morning of (+ 1 hour before / At the time when it has a time); an undated one shows Later today / Tomorrow morning; past times are hidden; Other time… reveals the picker. Gentle nudge is **off** by default; turn it on → it stays on for other to-dos; the notification arrives at 9:00 the morning after the last reminder, and completing the to-do first cancels it.
- [ ] **Mochi resting** (needs the fair-use cap — test on a throwaway account or with the cap temporarily lowered; restore it afterwards): the chat stays open with "resting until <local time>", Add it myself → Compose with your words + the note, input disabled, reopening the chat still shows resting.
- [ ] **Contrast:** spot-check secondary text and the primary buttons in all 6 light themes (Settings → Theme).

### Auth (device + a second account)
- [ ] Apple: first-ever sign-in captures name into greeting
- [ ] Apple: returning sign-in → Dashboard, data hydrates
- [ ] Apple: cancel → no error, stays on Sign-In
- [ ] Google: sign-in + cancel
- [ ] Email: wrong password shows friendly copy
- [ ] Sign out → sign in as a *different* user → no data bleed

### Notifications / reminders (new fix touches this)
- [ ] One-shot reminder fires at time (foreground + locked)
- [ ] Recurring reminder fires repeatedly
- [ ] Completing a task via its last subtask cancels its reminders ← new fix
- [ ] Delete a todo with reminders → notifications cancelled
- [ ] Permission denied → degrades gracefully, no nag loop

### Paywall / IAP (locally via StoreKit now; against ASC after org conversion)
- [ ] Subscribe Premium monthly + annual → entitlement applies
- [ ] Start 7-day trial (eligibility correct); prices show $4.99 / $29.99
- [ ] Paywall shows **no** top-up packs, **no** Max, no lifetime
- [ ] Restore purchases (found / none / failed)
- [ ] Manage/cancel opens OS screen
- [ ] Locked theme → paywall (aspirational); Mochi over the ceiling → **no**
      paywall (see AI / Mochi)

### Cross-device sync (2 devices)
- [ ] Add on A → appears on B in ~seconds; toggle on B → reflects on A
- [ ] Simultaneous edit → last-write-wins, no crash/dupe
- [ ] Clear data on A → B empties

### Offline
- [ ] Airplane mode → launches from cache
- [ ] Add/edit offline → queues → syncs on reconnect
- [ ] Cold-start offline → usable, no infinite spinner

### Gestures / native pickers
- [ ] Row swipe L/R actions + full-swipe auto-commit
- [ ] iOS inline vs Android native date/time pickers (Compose, Details, Defer, Reminder)
- [ ] Grocery + filter drag-to-reorder
- [ ] Long-press action sheets (snooze, pin, avatar) iOS vs Android

### AI / Mochi (live Cloud Function)
- [ ] Chat capture → Confirm / Review&add / Undo (incl. recurring "just this / series")
- [ ] PickTodos bulk delete / mark-done / defer; editable capture chips
- [ ] Field-suggest pills in Compose/Details apply correctly
- [ ] Suggest-steps + grocery department/store AI inference
- [ ] No usage meter anywhere in the chat
- [ ] Over the fair-use ceiling (the **server** is the only gate — no client
      counter since 2026-10-18; lower the ceiling in the emulator to test):
      message → Compose prefilled, task saves, no "resets after midnight" /
      "pay as you go" copy
- [ ] Mid-conversation fallback: "call mom" → (Mochi asks when) → "Friday" →
      Compose opens with "call mom — Friday"
- [ ] Suggest-steps over the ceiling → "Mochi's resting — you can add steps
      yourself." (localized), manual add still works

### Privacy / measurement / deletion (after §0 deploy)
- [ ] Fresh account → open app → profile has `createdAt`, `lastActiveDate`
      (today), and `activatedAt` after completing a to-do + reopening
- [ ] iOS build contains no Firebase Analytics (no `FirebaseAnalytics` /
      `RNFBAnalytics` pod after `expo prebuild`)
- [ ] Delete account with a **throwaway** account → Firestore `users/{uid}`
      tree fully gone (todos, profile, groceries, `entitlement`, `mochiUsage`,
      `agentUsage`, `signals`), auth user gone, can't sign back in — then
      confirm nothing is left behind (always remove test data)
- [ ] Subscribed throwaway account: delete account → a later RevenueCat event
      does **not** recreate `users/{uid}`; deleting doesn't cancel the sub
      (policy says cancel in iOS Settings)
- [ ] Paywall Privacy link opens the updated policy

### Visual / a11y / destructive
- [ ] Light + dark mode every screen & sheet; theme-from-avatar
- [ ] Completion firework plays; reduce-motion ON (or animation toggle off) suppresses it; sound toggle
- [ ] "YOUR JOURNEY" lifetime count increments on completion
- [ ] VoiceOver reads each sheet's controls individually (not one blob)
- [ ] VoiceOver: row swipe actions (Defer / Not Do / Delete) reachable + announced;
      tab bar announces Dashboard / Todos / Shopping with selected state
- [ ] Dynamic Type XXL → no clipping
- [ ] Long content (very long title, many categories / stores) — layout holds
- [ ] Empty states centered + on-brand (Dashboard welcome, Shopping, Todos)
- [ ] "Delete all permanently" copy says it's irreversible
- [ ] Export data → share sheet produces valid JSON
- [ ] Avatar camera + photo library + permission prompts

---

## Notes
- Unit tests: `npm test` at the repo root (core), in `mobile/`, and in
  `functions/`. Firestore security-rules tests need the emulator (JDK 21+):
  `npm run test:rules` in `functions/` — CI runs them.
- Maestro E2E (`npm run e2e` in `mobile/`) is UI-smoke only (render + navigation),
  driven against a seeded demo account on the iOS simulator.
- No RN component/snapshot tests exist — mobile UI is covered only by Maestro
  smoke; everything marked ✋ is genuinely unverified until run by hand.
