# Accessibility audit — mobile components

Static scan of `mobile/src/components/*.tsx` comparing the number of
interactive elements (`TouchableOpacity` / `Pressable`) to the number
of `accessibilityLabel` / `accessibilityRole` declarations. This is a
**rough proxy** — it doesn't tell you which specific button is
missing a label, just which files are under-served.

A hardware pass with VoiceOver (iOS) / TalkBack (Android) is the
authoritative audit; this doc is the punch list to drive that pass.

## Coverage scorecard

Component-level: 35 / 47 component files have at least one
interactive element. Of those, 239 `accessibilityLabel` declarations
exist (per project-wide grep).

### Files where labels < touchables (likely gaps)

| Component | Touchables | a11y labels | Worst-case gap | Priority |
|---|---|---|---|---|
| `DepartmentPicker` | 22 | 1 | 21 | 🔴 P1 |
| `ChatSheet` | 14 | 0 | 14 | 🔴 P1 |
| `AddSubtaskSheet` | 20 | 4 | 16 | 🔴 P1 |
| `CustomRecurrenceForm` | 11 | 0 | 11 | 🟡 P2 |
| `GroceryEditSheet` | 14 | 4 | 10 | 🟡 P2 |
| `DeferModal` | 16 | 6 | 10 | 🟡 P2 |
| `GroceryComposeSheet` | 18 | 8 | 10 | 🟡 P2 |
| `ComposeSheet` | 40 | 21 | 19 | 🟡 P2 |
| `CategorySheet` | 47 | 26 | 21 | 🟡 P2 |
| `BackgroundPicker` | 5 | 2 | 3 | 🟢 P3 |
| `Footer` | 3 | 0 | 3 | 🟢 P3 |
| `EmptyState` | 3 | 0 | 3 | 🟢 P3 |
| `AppHeader` | 9 | 8 | 1 | 🟢 P3 |
| `FilterBar` | 5 | 4 | 1 | 🟢 P3 |
| `EmptyStateCard` | 3 | 2 | 1 | 🟢 P3 |

The gap isn't always real — some touchables wrap a `<Text>` whose
content serves as the implicit label (RN forwards it). VoiceOver
will confirm which ones actually announce as silent.

## Recommended fix order

1. **DepartmentPicker** + **ChatSheet** + **AddSubtaskSheet** —
   high gap, primary user flows. Adding a label to every row +
   action is ~30 min each.
2. **GroceryEditSheet** / **GroceryComposeSheet** — Shopping is a
   first-class tab; chips + buttons should announce clearly.
3. **CategorySheet** / **ComposeSheet** — high absolute gap, but
   most rows wrap descriptive `<Text>`; spot-check rather than
   blanket-add.
4. **Tertiary surfaces** (Footer, EmptyState, BackgroundPicker) —
   one labeled CTA each.

## Beyond labels — rules to follow

These checks aren't measured by the grep above; verify manually
when you do the VoiceOver pass.

- **`accessibilityRole`** should be `'button'` for actionable
  controls, `'header'` for screen titles, `'image'` for decorative
  glyphs that should NOT be announced, `'switch'` / `'checkbox'`
  for toggle UI.
- **`accessibilityState={{ selected }}`** for tab pills, store
  chips, filter pills — without this VoiceOver says "button" but
  not "selected".
- **`accessibilityHint`** for non-obvious gestures (long-press to
  pin, swipe to delete).
- **`accessibilityLiveRegion`** for transient surfaces — Mochi-
  thinking indicator, snackbar, "Linked 12 items to Costco" status.
  Without this, VoiceOver users miss the feedback.
- **Decorative glyphs** (🥕 carrots in PebbleStrip, sparkles in
  Mochi indicator) need `accessibilityElementsHidden` so VoiceOver
  doesn't read them.
- **Reduce-motion compliance**: PebbleFlight + MochiThinking pulse
  should be no-op when `profile.reduceMotion === true`. Audit
  `Animated.loop` call sites.
- **Color contrast**: avatar-themed accent (`primary` mutated from
  the avatar's bg) hasn't been audited against WCAG AA. Especially
  problematic for blush-rabbit / dusty-rose presets where the
  accent is reddish-pink — failure mode is the active tab indicator
  reading as a warning color.
- **Font scaling**: many components set `fontSize: 12 / 13` without
  `maxFontSizeMultiplier`. At iOS Dynamic Type "AX1" sizes these
  blow out the layout. The `FilterBar` already uses
  `maxFontSizeMultiplier={1.3}` — extend the pattern.

## Web-side gap

`web/src/components/*` is NOT audited here. Add a similar punch
list when the web app gets a focused pass.

## How to run this scan

```sh
cd mobile
for f in src/components/*.tsx; do
  n=$(basename "$f" .tsx)
  tap=$(grep -c "TouchableOpacity\|Pressable\b" "$f")
  lbl=$(grep -c "accessibilityLabel\|accessibilityRole" "$f")
  printf "%-32s %3d / %3d\n" "$n" "$lbl" "$tap"
done | sort -t/ -k2 -n
```

Re-run after every accessibility sprint to track progress.
