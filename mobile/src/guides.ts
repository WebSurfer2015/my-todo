/**
 * In-app guide catalog — short topical walkthroughs the user can
 * play from Settings → Tips & guides, or accept from the first-run
 * "want a quick tour?" prompt right after onboarding.
 *
 * Each guide is a small carousel (3–5 slides). Slides are pure
 * text + an emoji-like glyph; we deliberately don't ship animated
 * GIFs / screenshots so the catalog is cheap to grow and easy to
 * localize later.
 *
 * Guide ids are durable strings — the user's `profile.guidesSeen`
 * is keyed off them. Renaming an id silently un-marks any user
 * who already finished that guide.
 */

export interface GuideSlide {
  /** Display title for the slide. */
  title: string
  /** Body text. May contain examples between « » to render in the
   * theme's accent color (caller renders these as styled <Text>
   * spans). Keep examples concrete so the user can pattern-match
   * later in the actual compose. */
  body: string
  /** Optional emoji to lead the slide visually. Matches the calm,
   * Mochi-shell brand voice; never required. */
  glyph?: string
}

export interface Guide {
  id: string
  /** Short one-line title shown in the menu list. */
  title: string
  /** Tag line below the title in the menu. Keep under ~70 chars. */
  blurb: string
  /** Lead-in glyph for the menu row and the first slide. */
  glyph: string
  /** 3–5 slides. UI shows a paging dot bar so longer guides are
   * fine, but shorter holds attention better. */
  slides: GuideSlide[]
}

export const GUIDES: Guide[] = [
  {
    id: 'ai-fields',
    title: 'AI for to-dos',
    blurb: 'Type naturally — Sagely fills the fields.',
    glyph: '✨',
    slides: [
      {
        glyph: '✨',
        title: 'Tap-to-apply pills',
        body: "When you type a to-do, ambient suggestions appear above the form: category, priority, due date with time, recurrence, reminder. Nothing changes unless you tap a pill.",
      },
      {
        glyph: '⌛',
        title: 'Times + dates',
        body: "Try «pickup Mia at 3pm tomorrow». Completed by fills with the time. «every Mon and Wed» sets a weekly recurrence on those days. «for 30 days» bounds it.",
      },
      {
        glyph: '🗂️',
        title: 'New categories',
        body: "Type «renew passport» and Sagely proposes a new «Travel» category. Tap «+ Travel» and confirm to create it in your sidebar.",
      },
      {
        glyph: '🤫',
        title: 'It stays quiet',
        body: "Pause typing for ~1.5s and pills appear. Keep typing and they wait. Turn it off entirely in Settings → AI assistance.",
      },
    ],
  },
  {
    id: 'reminders',
    title: 'Reminders that repeat',
    blurb: 'One-shot or every N hours until a cutoff.',
    glyph: '🔔',
    slides: [
      {
        glyph: '🔔',
        title: 'Set a reminder',
        body: "Open any to-do → Remind me → pick a date + time. iOS asks for notification permission the first time. The phone fires a quiet local notification at the chosen moment.",
      },
      {
        glyph: '🔁',
        title: 'Recurring reminders',
        body: "Same sub-view: tap an interval chip (15m, 30m, 1h, 2h, 4h, 6h, 12h) and Sagely schedules a series of pings up to the «Until» time. Defaults to your due date.",
      },
      {
        glyph: '🗣️',
        title: 'AI sets them for you',
        body: "Type «remind me every 2 hours until 5pm» in the compose. The Bell pill carries the full spec — tap to apply.",
      },
      {
        glyph: '✅',
        title: 'Auto-cleanup',
        body: "Check the to-do off and every scheduled reminder cancels. Complete a recurring to-do and the reminder rolls forward to the next occurrence.",
      },
    ],
  },
  {
    id: 'subtasks',
    title: 'Break a task into steps',
    blurb: 'Suggest steps + clear all + roll-forward.',
    glyph: '🪜',
    slides: [
      {
        glyph: '🪜',
        title: 'Add a step',
        body: "Open a to-do → tap «+ Add a step…». Each step gets its own priority + due date, and counts toward today's pebble cairn when you check it.",
      },
      {
        glyph: '✨',
        title: 'Suggest steps',
        body: "On a to-do with no steps yet, tap «Suggest steps» — Sagely proposes 3–6 concrete ones. Review, deselect any you don't want, then tap Add selected.",
      },
      {
        glyph: '🧹',
        title: 'Start fresh',
        body: "Tap «Clear all steps» in the header to wipe and start over. The to-do itself stays — only the checklist resets.",
      },
    ],
  },
  {
    id: 'groceries',
    title: 'Smart grocery list',
    blurb: 'Departments auto-fill. AI catches the store too.',
    glyph: '🥬',
    slides: [
      {
        glyph: '🥬',
        title: 'Local first',
        body: "Type «eggs» and Department flips to Dairy instantly — no network call. The list ships with ~250 common items and falls back to AI when it doesn't know.",
      },
      {
        glyph: '✨',
        title: 'AI for misses',
        body: "Type «saffron threads» → after ~1.5s an AI pill suggests «+ Spices» (a new department). Tap and confirm to create it. Same for stores: «books from target» offers «+ Target».",
      },
      {
        glyph: '⭐',
        title: 'Often picked up',
        body: "Your most-completed groceries surface in an «Often picked up» row at the top of the list. Tap any to add a fresh one without typing.",
      },
      {
        glyph: '🏪',
        title: 'Filter by store',
        body: "Tap the filter icon in the Groceries header to scope by store. Hide stores you don't shop at, reorder them, or set a default.",
      },
    ],
  },
  {
    id: 'hidden-actions',
    title: 'Hidden gestures',
    blurb: 'Long-press, swipe, drag — the shortcuts.',
    glyph: '👆',
    slides: [
      {
        glyph: '👆',
        title: 'Swipe + long-press',
        body: "Swipe a to-do left to send it to the trash bin. Long-press to open the defer picker (tomorrow, next week, custom). Tap to toggle done.",
      },
      {
        glyph: '📌',
        title: 'Pin a filter',
        body: "Long-press any filter pill (Today, Overdue, a category) to pin it to your quick-access bar. Long-press again to unpin.",
      },
      {
        glyph: '↕️',
        title: 'Reorder categories',
        body: "In the sidebar, drag a category to reorder it. The order syncs across your devices.",
      },
      {
        glyph: '🌳',
        title: 'Themed pebbles',
        body: "Pick a preset avatar (cat, dog, butterfly…) and your completion animation + cairn switch to a themed glyph: fish, bone, butterfly. Edit profile → preset.",
      },
    ],
  },
  {
    id: 'personalize',
    title: 'Make it yours',
    blurb: 'Backgrounds, avatar theme, motion, sound.',
    glyph: '🎨',
    slides: [
      {
        glyph: '🎨',
        title: 'Backgrounds',
        body: "Settings → Background opens a picker with 8 calm palettes and 10 patterns. Each works in light + dark mode.",
      },
      {
        glyph: '🐱',
        title: 'Theme from avatar',
        body: "Flip the «Theme from avatar» toggle and the FAB + app canvas tint to match your preset avatar's color family. Pick a different preset to change.",
      },
      {
        glyph: '🤫',
        title: 'Calm by default',
        body: "Toggle off the completion animation, sound, or reduce motion for accessibility. The pebble cairn still grows — just quietly.",
      },
    ],
  },
]

/** Look up a guide by id. Returns null when the catalog has been
 * pared down past a previously-stored `guidesSeen` entry. */
export function findGuide(id: string): Guide | null {
  return GUIDES.find((g) => g.id === id) ?? null
}
