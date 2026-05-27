# Sagely design system

A short reference for the visual + interaction rules the apps follow.
When a new screen or component is added, read this first; it captures
the conventions you'd otherwise re-derive by reading 47 component
files.

This doc is the source of truth for: spacing scale, color tokens,
typography, radii, bottom-sheet rules, and the unified primitives
(`EmptyStateCard`, `MochiThinking`). For the brand voice / marketing
positioning, see `docs/POSITIONING.md`.

## Voice

The app's voice is calm and grounded. The single most load-bearing
rule is **no exclamation marks anywhere a user can see**. Other
operating rules:

- No scorekeeping language ("Great job!", "Way to go!", "Amazing!").
- Single-clause sentences end with a period, even on titles. "Start
  shopping." not "Start shopping". The period reads as restful.
- Short over long. Empty-state hints are one line.
- Mascot is named **Mochi**. Always lowercase the "m" in display
  unless it starts a sentence.
- AI activity is "Mochi's thinking…" — locked copy, never paraphrase
  ("Mochi is working…", "AI is thinking…" → both wrong).

## Color tokens

Defined in `mobile/src/theme.ts` and `web/src/index.css`. Use the
token, not the literal hex.

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#F5F0E2` cream | `#1A1814` warm dark | Canvas |
| `card` | `#FCFAF3` near-white | `#24211B` | Raised elements (cards, sheets) |
| `surface` | `rgba(252,250,243,0.65)` | `rgba(36,33,27,0.65)` | Translucent overlay panels |
| `label` | `#2A3530` | `#ECEEE6` | Primary text |
| `label2` | `#5A6B62` | `#B8C4BA` | Secondary text |
| `label3` | `#8A998F` | `#8FA095` | Tertiary / hints |
| `separator` | `#E5EAE0` | `#3D3F37` | Hairlines |
| `primary` | `#4F8A75` Mochi teal | `#86C5A8` lifted mint | Primary actions, accent |
| `primarySoft` | `#E8F0E5` | `#2E4639` | Pill backgrounds, soft chips |
| `primaryOn` | `#FFFFFF` | `#1A1814` | Text on `primary` |

**Theme-from-avatar**: when on, `primary` mutates to a darkened shade
of the user's avatar bg. Components MUST use the token, never hardcode
the brand sage, or the avatar theme silently breaks.

## Spacing scale

Use multiples of 4. Common values:

| Value | Use |
|---|---|
| `4` | Tight icon gaps |
| `6` | Pill internal gaps |
| `8` | Default `gap` in rows |
| `10` | Compact paddings |
| `12` | Card internal padding |
| `14` | Default sheet horizontal padding |
| `16` | Page-edge gutter (Vito / Shopping bodies, EmptyStateCard) |
| `20` | Hero gutter (Home body) |
| `24` | Card internal vertical padding |

When in doubt, use `16` for horizontal and `12` for vertical.

## Radii

| Value | Use |
|---|---|
| `10` | Stat tiles, secondary buttons |
| `12` | Compose inputs |
| `14` | Cards (EmptyStateCard, statTile, Home greeting card) |
| `16` | Sheet bottoms (rounded card on canvas) |
| `18` | Bottom-sheet top edges |
| `100` / `999` | Pills, FAB |

Pick from the table. Don't introduce new radii — drift here is the
fastest way to make the chrome feel inconsistent.

## Typography

| Size | Weight | Use |
|---|---|---|
| 24 | 700 | Screen titles ("Shopping", "Todos") |
| 17 | 700 | Greeting line ("Good morning, Ying") |
| 17 | 700 | Bottom-sheet titles |
| 15 | 600 | Empty-state title, primary button labels |
| 14 | 600 | Tab labels, secondary buttons |
| 13 | 500 | Identity line, field values |
| 13 | 600 | Pill labels |
| 12 | 500 italic | Hints, "Mochi's thinking…", pebble caption |
| 11 | 500 | Section headers (TODAY, STORES) |

Tabular numbers (`fontVariant: ['tabular-nums']`) for any counter.

## Bottom sheets

- **Min height 30 % of screen** (`useWindowDimensions().height * 0.3`).
  Sheets that render with little content (e.g. StorePicker opened
  straight to the inline-add row) must pad up — don't let them
  collapse into a tiny floater.
- **Top-radius 18**, bottom-radius 0 (sheet rises from the edge).
- **Top-handle**: 36×4 pill at `c.gray3`, centered, ~6 pt down from
  the sheet top.
- **Header row**: `Cancel` (left) | title (center, 17 / 700) |
  `Done` or `Save` (right, primary color). No in-body duplicates of
  the primary action.
- **Backdrop**: `rgba(0,0,0,0.45)`, taps close.
- **iOS modal layering**: native `<Modal>` floats above the React
  tree, so snackbars from `useNotify()` are hidden while a sheet is
  open. Use an in-sheet status banner for any feedback that must
  appear during sheet interaction; reserve snackbars for state that
  surfaces after the sheet closes.

## Empty states

Every empty state renders through `mobile/src/components/EmptyStateCard.tsx`
(or the web equivalent when it exists). One pattern, one component.

- White rounded card on the canvas, `borderRadius: 14`,
  `paddingVertical: 24`, `paddingHorizontal: 16`, `marginTop: 8`.
- Bold title (15 / 600) ending with a period: "No stores yet.",
  "Start shopping.", "You're all caught up."
- Optional italic gray hint (12 / 500 italic), one line.
- Optional soft-purple pill button (`primarySoft` bg, `primary` text,
  `borderRadius: 999`, `paddingHorizontal: 16`, `paddingVertical: 8`,
  13 / 600 label).
- One button per card; never two side-by-side.
- Skip the unified card ONLY for the full-screen first-launch
  onboarding (different scale entirely).

## AI activity indicator

Every AI textbox surfaces `<MochiThinking />` while a request is in
flight. The component animates a bundled mochi mascot PNG + a
sparkles glyph + the italic label "Mochi's thinking…". Behavior:

- Mochi scales 1.0 ↔ 1.12 with a small opacity dip on a 900 ms half-
  cycle (1.8 s full breath).
- Sparkles fade 0.35 ↔ 1.0 on the same beat, offset so the two read
  as one creature breathing.
- `compact` prop hides the label — use it inside pills where the
  surrounding chrome already supplies "thinking" / "Suggest steps".

Never roll a bespoke ActivityIndicator next to AI text. Import
`MochiThinking`.

## Status filters

`overdue / open / done` — labels are user-overridable via the Manage
Todos sheet. Resolve display labels via `getStatusLabel(id, profile,
t)`. Never hardcode the English label in a component.

## Avatars + themed collectibles

`AVATAR_PRESET_LIBRARY` in `core/src/profile.ts` is the source of
truth. Adding a new preset means:

1. Append the entry (`key`, `emoji`, `bg`, `imageKey`).
2. Add a themed glyph in `COLLECTED_GLYPHS` (or accept the default
   pebble).
3. Add a noun key in `COLLECTED_NOUN_KEYS` (e.g. `'feathers'`).
4. Add the noun translation to every locale's
   `lifetimeLabel` + `oneItemCaption` + the singular nouns table.
5. Drop a PNG at `mobile/assets/preset-avatars/<key>.png` and
   uncomment the `require()` in `Avatar.tsx` + `PebbleFlight.tsx`.

## Dark mode

Every component reads from `useTheme()`. If you find yourself
hardcoding a color, you're either skipping the theme or you need a
new token in `theme.ts`. The completion animation also respects
`profile.reduceMotion === true` — keep that contract when adding new
animations.

## Localization

All user-facing strings live in `core/src/i18n.ts`. Adding a new key
means:

1. Add to `strings.en` first.
2. The shape test (`web/src/i18n.test.ts`) will fail for every other
   locale until you fill them in.
3. For plural / count formatters, write a function entry (see
   `lifetimeLabel(nounKey)` for the pattern).

Locales: `en`, `zh`, `es`, `fr`, `ja`, `de`. Native-speaker review of
translations is a separate workflow — getting the strings to exist
keeps the app shippable; quality passes happen out-of-band.

## Animation defaults

- Spring-style sheet transitions (RN default).
- Completion animation: `PebbleFlight` 2400 ms with two-beat
  squash-and-stretch + wiggle. Skipped when
  `profile.completionAnimation === false` OR
  `profile.reduceMotion === true`.
- Snackbar default duration: 3500 ms.

## Sound

- Completion sound: opt-in via `profile.completionSound`, default true.
- Notifications: silent. The brand contract is "calm" — push tokens
  fire banners only, no system sound, no badge.

## When in doubt

Reach for an existing component:

| Need | Use |
|---|---|
| Empty state | `EmptyStateCard` |
| AI activity | `MochiThinking` |
| Confirmation | `Alert.alert` (mobile) / `useNotify().confirm` (web) |
| Toast / undo | `useNotify().showSnackbar` |
| Date picker | `DateTimePicker` from `@react-native-community/datetimepicker` |
| Category icon | `CategoryIcon` |
| Grocery icon | `GroceryIcon` |
| Pebble row | `PebbleStrip` |
| Mascot avatar | `Avatar` |
