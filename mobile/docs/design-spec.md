# My TODOs — iOS Mobile Design Spec

A Figma-translatable specification for the current mobile UX. Hand this to a designer (or paste into Figma manually) and you'll get a faithful representation of the running app.

## Canvas

- **Frame**: 402×874 (iPhone 16 Pro). 393×852 also acceptable for older Pro models.
- **Safe areas**: top 59pt (status bar + dynamic island), bottom 34pt (home indicator).
- **Background**: linear gradient at 135° (top-left → bottom-right):
  - Light: `#FCEFFF → #FFF1F0 → #EAF2FF` (stops at 0%, 55%, 100%)
  - Dark: `#2C1B33 → #321B22 → #1B2438`

## Color tokens

### Light
| Token | Hex | Use |
|---|---|---|
| `bg` | #FCEFFF | App background base |
| `card` | #FFFFFF | Card / modal surfaces |
| `surface` | rgba(255,255,255,0.55) | Sticky filter strip, translucent chips |
| `surfaceAlt` | rgba(255,255,255,0.6) | Alt translucent surface |
| `label` | #000000 | Primary text |
| `label2` | #3C3C43 | Secondary text |
| `label3` | #8E8E93 | Tertiary, placeholders |
| `separator` | #E5E5EA | Hairlines |
| `border` | #E5E5EA | Borders |
| `blue` | #007AFF | Primary action, active state |
| `red` | #FF3B30 | Destructive, overdue |
| `orange` | #FF9500 | Medium priority |
| `yellow` | #FFCC00 | Color swatch |
| `green` | #34C759 | Restore, success |
| `purple` | #AF52DE | School / category |
| `pink` | #FF2D92 | Color swatch |
| `teal` | #30B0C7 | Color swatch |
| `gray` | #8E8E93 | Neutral |
| `gray3` | #C7C7CC | Disabled, faint dividers |

### Dark
| Token | Hex |
|---|---|
| `bg` | #1C1C1E |
| `card` | #2C2C2E |
| `label` | #FFFFFF |
| `label2` | rgba(235,235,245,0.78) |
| `label3` | #8E8E93 |
| `separator` | rgba(84,84,88,0.6) |
| `border` | rgba(84,84,88,0.65) |
| `blue` | #0A84FF |
| `red` | #FF453A |
| `orange` | #FF9F0A |
| `green` | #30D158 |
| `purple` | #BF5AF2 |
| `pink` | #FF375F |
| `gray3` | #48484A |

## Typography (Inter / SF Pro Text)

| Style | Size | Weight | Line-height | Letter-spacing |
|---|---|---|---|---|
| Large title | 28 | Heavy (800) | 1.1 | -0.5 |
| Sheet title | 17 | Bold (700) | 1.2 | 0 |
| Body | 15 | Medium (500) | 1.3 | -0.16 |
| Task text (comfortable) | 16 | Regular (400) | 21 | -0.3 |
| Task text (compact) | 14 | Regular (400) | 19 | -0.3 |
| Caption / chip | 12-13 | Semibold (600) | — | -0.16 |
| Group header | 12 | Bold (700) | — | 0.4em (uppercase) |
| Tertiary label | 11 | Bold (700) | — | 0.06em (uppercase) |

System font preference: **SF Pro Text**. Fallback: **Inter**.

## Spacing scale

`4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 24 · 28 · 32 · 40`

Common values:
- Card horizontal padding: **16**
- Card vertical padding: **12** (comfortable) / **7** (compact)
- Section margin-bottom: **18**
- Modal padding: **20**
- Body padding-x: **16**

## Radius scale

- Card: **12**
- Sheet top corners: **18**
- Pill: **100** (full)
- Avatar: 50% of size (circle)
- Button: **12**
- Input: **8**

---

## Components

### Identity row (top)
- Height: ~56pt
- Padding: 20 horizontal, 12 top, 8 bottom
- Layout: `[avatar] [text column flex] [gear icon]`
- Avatar: **36×36 round**
- Text column:
  - Name: 14 Bold, `label`
  - Greeting/quote: 12 Medium, `label2`, max 2 lines
- Gear icon: 22×22 stroke icon (lucide-style settings cog) inside a 36×36 circular hit area, no fill
- Tapping anywhere → opens Profile sheet

### Segmented view toggle (below identity row)
- Outer wrap: padding 20 horizontal, 4 top, 8 bottom
- Track:
  - Width: full
  - Background: `rgba(120,120,128,0.16)` light / `rgba(118,118,128,0.30)` dark
  - Radius: 9
  - Padding: 2 (around segments)
  - Gap: 2
- Segments (flex 1):
  - Padding: 7 vertical
  - Radius: 7
  - Min-height: 32
  - Inactive label: 13 Semibold, `label2`
  - Active: background `card` (#fff) light / `rgba(118,118,128,0.55)` dark; shadow `0 1 2 rgba(0,0,0,0.10)`
  - Active label: 13 Bold, `label`
- Two segments: **By Category** | **By Status**

### Filter pills (sticky, below segmented)
- Strip background: `surface`
- Border-bottom: hairline `separator`
- Padding: 8 vertical, 20 horizontal, 12 bottom
- Horizontal scroll, no scrollbar
- Pill base:
  - Padding: 7 vertical, 12 horizontal
  - Radius: 100
  - Border: hairline `border`
  - Background: `card` (white)
  - Layout gap: 6
  - Icon: 15×15, stroke 2, color = pill identity color (inactive) / white (active)
  - Label: 13 Semibold (-0.16 LS), `label`
  - Count badge (when count > 0): min-w 18, h 18, radius 9, bg `bg` / `rgba(255,255,255,0.25)` (active), text 11 Bold
- **Active pill**: solid `blue` background + border, **white** text + icon (regardless of pill identity color)

**By Category set**: All · Home (green) · School (purple) · Work (blue) · custom categories · **Manage** pill (translucent + pencil icon)
**By Status set**: Overdue (red) · Open (blue) · Done (gray) · Trash (gray)

### Task card (group section)
- Section margin-bottom: 18
- Group header above the card:
  - 12 Bold, `label3`, uppercase, 0.4em letter-spacing
  - Margin: 8 below, 4 left
  - Overdue group: `red` color
- Card body:
  - Background: `card`
  - Radius: 12
  - Shadow: `0 1 3 rgba(0,0,0,0.04)`
  - Children: task rows + hairline separators between

### Task row
- Padding (comfortable): 12 vertical, 16 horizontal
- Padding (compact): 7 vertical, 16 horizontal
- Layout: `[checkbox 22×22] [body flex]`
- Checkbox: 22×22 round, 1.5pt border `gray3`. Checked: solid `blue` background, white ✓ centered
- Body (column, gap 4 / compact 1):
  - Main row: `[text flex] [priority dot 11×11]`
  - Meta row: `[category chip] [date chip]` (gap 2)
- Text:
  - Comfortable: 16 Regular, lineHeight 21, `label`
  - Compact: 14 Regular, lineHeight 19
  - Done: `label3`, line-through
- Priority dot: 11×11 round
  - High = `red`, Medium = `orange`, Low = `blue`
- Category chip:
  - Padding 2/4, radius 5, gap 4
  - Layout: `[category icon 11pt] [label 12pt Semibold]`
  - Color: chip text + icon use category color
- Date chip:
  - 12pt
  - Default: `label3`, Medium
  - Overdue: `red`, Semibold
  - No date: italic, `gray3`, Medium
  - Smart labels: "Today", "Tomorrow", "Yesterday" for adjacent days; weekday name for next 6; full "Sat, Apr 5" beyond
- Row hairline below (between rows): 0.33pt, `separator`, left-inset 48 (aligns under text, leaving checkbox column clean)

### Swipe actions (per row)
- **Leading swipe** (left → right): single blue Edit action, 86pt wide, white pencil icon + "Edit" label
- **Trailing swipe** (right → left): single red Trash action, 86pt wide, white trash icon + "Trash" label
- Trash view variants:
  - Leading: green Restore (undo arrow + "Restore")
  - Trailing: red Delete (X + "Delete")

### Long-press context menu
- Native `ActionSheetIOS`
- Normal view: single option **Move to trash** (destructive style) + Cancel
- Trash view: **Restore** + **Delete permanently** (destructive) + Cancel

### FAB (bottom-right)
- 56×56 round
- Background: `blue`
- Icon: white + (26×26, stroke 2.5)
- Position: 16pt + safe-area-inset-bottom from bottom, 20pt from right
- Shadow: `0 4 10 rgba(0,0,0,0.20)`
- Hidden in trash view, done view, and when no tasks

### Group header
- 12pt Bold, `label3`, uppercase 0.4em letter-spacing, margin-bottom 8, margin-left 4
- Overdue: `red`

### Empty state
- Centered, padding 56 vertical / 16 horizontal, gap 6
- Title: 16 Semibold, `label`
  - "No tasks yet" / "Nothing in {category} yet" / "No open tasks" / "Trash is empty" etc.
- Hint: 13 Regular, `label3`, max-w 320, lineHeight 18
- CTA button (All view + category views only):
  - Padding 18/10, radius 10, bg `blue`
  - Label: 14 Semibold, white "Add a task"
  - Action: opens Compose sheet

### Trash view banner
- Background: `surface`, radius 10, padding 12 horizontal / 10 vertical
- Layout: `[notice text flex] [Empty Trash button]`
- Notice: 12 Regular, `label2`, lineHeight 16 — "Items in trash are permanently deleted after 30 days."
- Empty Trash button: padding 12/6, radius 8, bg `red`, white 13 Semibold

---

## Modals (bottom sheets)

### Shell (shared)
- Slide up from bottom, ~250ms ease-out
- Backdrop: `rgba(0,0,0,0.45)`
- Sheet:
  - Background: `card` (#fff light / #1C1C1E dark)
  - Top corners: radius 18
  - Padding: 8 top, 24 bottom (above safe-area), 16 horizontal
  - Drag handle: 36×4 pill, radius 2, `gray3`, top-centered, margin-bottom 8

### Compose sheet
- Title: input placeholder text ("Add a new task...") centered
- Header row: `[Cancel (blue text)] [title centered] [56pt spacer]`
- Body: AddTask form
  - Wrapper: 44pt height, `card`, radius 12, hairline border, padding 8 horizontal
  - Layout: `[category icon trigger 32×32] [text input flex] [priority dot trigger 32×32]`
  - Add button (right of wrapper): 44pt high, 18 horizontal padding, radius 12, `blue`, white 15 Semibold
- Auto-focus input ~120ms after open

### Profile sheet
- Title: "Edit profile"
- Sections (vertical, gap 12):
  1. **Avatar row**: `[64pt avatar] [Change photo button]`
     - Change photo button: padding 14/10, radius 8, bg light gray, blue 14 Semibold text
     - Tapping opens iOS ActionSheet: Take Photo / Choose from Library / Cancel
  2. **"Or pick a preset" label** + 4-col grid of 44pt circular avatar swatches (12 presets)
     - Active swatch: 2pt black border ring
  3. **Name input**: 38pt h, hairline border, radius 8, padding 10 horizontal
  4. **Greeting textarea**: same as input but 56pt h, vertical pad 8
     - Helper text below: 11 Regular, `label3` — "Shown above your name. Leave blank to use the time-of-day greeting."
     - Max length: 24 chars
  5. **Language**: row of two buttons (EN / 中文)
     - Inactive: bg `bg`, hairline border, label 14 Semibold
     - Active: solid `blue`, white text
  6. **Density**: same row pattern (Comfortable / Compact)
- Actions row: `[Cancel (light gray)] [Save (solid blue, white)]`, flex-end aligned

### Category sheet
- Title: "Manage" (list mode), "Add category" / "Edit category" (form mode)
- **List mode**:
  - Scrollable rows: `[icon 18pt] [label 15 Medium flex] [Edit] [Delete]`
  - Hairline below each row
  - Bottom: light-gray "Add category" button, then Done close button
- **Form mode**:
  - **Name** input (full pattern)
  - **Color** swatch row: 8 circles, 32×32, radius 16, 2pt border (transparent default, `label` when selected)
  - **Icon** grid: 12 cells, 38×38, radius 8, bg `bg`, 2pt border (transparent default, current `color` when selected)
  - Actions: Back / Save

---

## Avatar / icon assets

**Avatar emoji presets (12)**: 😀 🐱 🐶 🐦 🐰 🐠 ⭐ ❤️ ✨ 🚀 🌸 ☀️
Backgrounds: orange, green, blue, teal, pink, blue, yellow, red, purple, blue, pink, orange (matched 1:1)

**Category icon set (12)**: home · graduation-cap (school) · briefcase · book · star · heart · flag · tag · music · dumbbell · coffee · dot

**Toolbar / glyphs**:
- Settings (gear), + (plus), pencil (edit), trash, undo (restore), X (close)
- Filter pills: tag (category view), checklist (status view), clock (overdue), circle (open), check-circle (done), trash (trash bin)

All glyph icons are stroke-based 22×22 (or 15×15 for pills), 2pt stroke, rounded caps & joins.

---

## Accessibility

- Tap targets: ≥44×44pt for primary actions; chip wrappers extend hitSlop to compensate
- Color paired with shape (priority dot + position; date chip color + weight; pill border color even when active)
- Dark mode follows system preference (no manual toggle)
- Haptics on key actions:
  - Light impact: toggle done
  - Medium impact: long-press menu open, swipe-trash commit
  - Success: add task, restore from trash
  - Warning: permanent delete confirm

---

## Screen list (recommended Figma order)

1. **Home — light, populated** — identity + segmented + filter + 2 task group cards + FAB
2. **Home — light, empty state** — same chrome, centered empty state + CTA, no FAB
3. **Trash view — light** — identity + segmented (Status active) + filter (Trash active) + banner + flat list of dimmed trashed rows + no FAB
4. **Compose sheet (overlay)** — dim backdrop + bottom sheet
5. **Profile sheet (overlay)** — dim backdrop + bottom sheet (full form)
6. **Category sheet (overlay) — list mode** — dim backdrop + sheet
7. **Category sheet (overlay) — form mode** — name + color palette + icon grid
8. **Home — dark** — mirror of #1 with dark palette
9. **Trash view — dark** — mirror of #3

---

*Generated from the running mobile app at /Users/yingnming/WebProjects/my-todo-mobile.*
