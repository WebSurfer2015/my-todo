# Release v1.7.0 — Feature & Test Matrix

Page-by-page inventory of supported features, what automated tests cover, and
the on-device checklist to run before submitting v1.7.0. Built from the code on
`dev` as of the 1.7.0 version bump.

> **Release status:** code is on `dev`, green (web 805 ✓, mobile 65 ✓, core
> typecheck ✓). Promotion to `main` + `eas build --auto-submit` are **held**
> until the Apple account's Individual→Organization conversion completes and the
> **Paid Applications Agreement** is re-signed under the org (IAP can't be sold
> until then). Everything below can be tested on-device in the meantime —
> the paywall via the local StoreKit config (`fb94490f`).

**Legend:** ✅ logic covered by automated unit tests · 🤖 also has a Maestro E2E
smoke flow · ✋ **needs manual on-device testing**

---

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
  guard), suggest-steps hook, AI op validation
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

### 11. Ask Mochi (AI chatbot)
Multi-turn chat · example/frequent chips · usage meter (→ paywall when out) ·
proposal cards (Confirm/Review&add/Delete, optimistic add + Undo, editable
capture chips, PickTodos checklist with Skip/Defer/Delete, series-delete fork) ·
all writes via store mutations + destructive confirms.
- ✅ agent tool registry + validateOperation (every op), server parsers
  (breakdown/classify-dept/suggest-fields/link-store), client↔server parity, AI cost guards
- ✋ entire live chat UX (CF latency, "thinking"), proposal-card apply flows,
  quota-exhaustion → paywall

### 12. Paywall / Membership ⚠️ *(IAP blocked until org conversion; test locally via StoreKit config)*
Annual/Monthly toggle · Free/Premium cards · Subscribe/Upgrade/Start-trial →
StoreKit sheet · top-up packs · Restore purchases · Manage/cancel subscription ·
Terms/Privacy links.
Products the paywall expects (must exist in ASC, Ready-to-Submit, attached to version):
`com.websurfer.mytodo.premium.monthly`, `.premium.annual`, `.topup.150`, `.topup.500`.
(`.max.monthly` / `.max.annual` exist in code but Max is **not** offered this release.)
- ✅ entitlement math (RevenueCat webhook events, tier mapping, lapsed
  downgrade, free 3/day + premium caps, top-up pay-as-you-go, feature gates,
  revenue loss-safety), upgrade/product ranking, core↔server parity
- ✋ purchase / restore / trial / upgrade / cancel against StoreKit — the whole SDK/UI integration

### 13. Profile / Settings / Theme / Animation&Sound
Avatar (camera/library/Mochi, crop/compress) · name/quote (random-daily
shuffle) · **"YOUR JOURNEY" lifetime pebble count + recalibrate/reset** ·
sign out · Settings (membership, theme, manage todos/store, animation&sound
toggles, Mochi toggle, tips/intro, export data → share sheet, delete-data-only,
delete-account) · ThemeSelector (locked themes → paywall) · reduce-motion /
completion-animation / completion-sound toggles.
- ✅ profile migrate (avatar/name/quote caps, density, guides), export payload,
  delete-account order invariant (wipe cloud before auth), comp-allowlist, avatar color math
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

---

## ✋ Manual on-device checklist

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
- [ ] Start 7-day trial (eligibility correct)
- [ ] Buy a top-up pack → balance increments, Mochi requests restored
- [ ] Restore purchases (found / none / failed)
- [ ] Upgrade/downgrade; Manage/cancel opens OS screen
- [ ] Out-of-requests in Mochi → paywall; locked theme → paywall

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

### Visual / a11y / destructive
- [ ] Light + dark mode every screen & sheet; theme-from-avatar
- [ ] Completion firework plays; reduce-motion ON (or animation toggle off) suppresses it; sound toggle
- [ ] "YOUR JOURNEY" lifetime count increments on completion
- [ ] VoiceOver reads each sheet's controls individually (not one blob)
- [ ] Dynamic Type XXL → no clipping
- [ ] Delete account → docs gone, can't log back in
- [ ] "Delete all permanently" copy says it's irreversible
- [ ] Export data → share sheet produces valid JSON
- [ ] Avatar camera + photo library + permission prompts

---

## Notes
- Firestore security-rules tests (`web/tests/firestore-rules.test.ts`) and the
  adapter emulator tests need the Firebase emulator — run `npm run test:rules`
  in `web/` separately; not part of the 805 default run.
- Maestro E2E (`npm run e2e` in `mobile/`) is UI-smoke only (render + navigation),
  driven against a seeded demo account on the iOS simulator.
- No RN component/snapshot tests exist — mobile UI is covered only by Maestro
  smoke; everything marked ✋ is genuinely unverified until run by hand.
