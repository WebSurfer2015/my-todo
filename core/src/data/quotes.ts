/**
 * Curated daily quotes for the home-screen subtitle. One shows per day,
 * picked by a date seed so it's stable all day and rotates at midnight —
 * no button, no choice, no effort (the calm-app way).
 *
 * Tone: wise, witty, fun, gently motivating — and deliberately NOT
 * mental-health / therapy / anxiety-speak. (The old "Pick it for me" list
 * leaned clinical; this is the warmer, lighter replacement.)
 */
export const DAILY_QUOTES: string[] = [
  // Wise / gently motivating
  'Slow and steady. Ask any turtle.',
  'Small steps get there too.',
  'Done beats perfect.',
  'You can do anything, not everything.',
  'Direction beats speed.',
  'Start where you are.',
  'A little progress is still progress.',
  'Decide once, then begin.',
  'The slow way is still the way.',
  'Less, but better.',
  'Busy isn’t the same as done.',
  'Focus is deciding what to ignore.',
  'What gets scheduled gets done.',
  'You don’t find time, you make it.',
  'Begin, and the path shows up.',
  'Steady wins more races than fast.',
  // Witty / fun
  'Tackle the frog first.',
  'Future you is counting on present you.',
  'Coffee, then conquer.',
  'Plans are dreams with deadlines.',
  'Make it happen, then make tea.',
  'Cross one off. Watch what happens.',
  'Procrastination is tomorrow’s ambush.',
  'Do the scary one first — it’s downhill after.',
  'Your future self is already saying thanks.',
  'Be the person your to-do list believes in.',
  'Momentum is sneaky. Start small.',
  'The list isn’t the boss. You are.',
  'One down. The rest are nervous now.',
  'Half the battle is showing up. You’re here.',
  'Turn “someday” into today and watch it shrink.',
  // Calm / on-brand
  'No rush. Just rhythm.',
  'Slow is still forward.',
  'Pace yourself. The turtle does.',
  'One thing, then the next.',
  'Quiet focus beats loud hustle.',
  'Keep it simple. Keep it moving.',
  'Tend the day like a small garden.',
  'Make a little dent in it.',
  'Progress loves a started list.',
]

/** Stable hash of a yyyy-mm-dd string → non-negative int. */
function hashDate(iso: string): number {
  let h = 0
  for (let i = 0; i < iso.length; i++) h = (h * 31 + iso.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** The date-seeded index for a given local ISO day. */
export function dailyQuoteIndex(iso: string): number {
  return hashDate(iso) % DAILY_QUOTES.length
}

/** The auto-rotating quote for a given local ISO day. */
export function quoteForDay(iso: string): string {
  return DAILY_QUOTES[dailyQuoteIndex(iso)]
}

/** Resolve a stored index safely into a quote (wraps / clamps). */
export function quoteAt(index: number): string {
  const len = DAILY_QUOTES.length
  const i = ((Math.trunc(index) % len) + len) % len
  return DAILY_QUOTES[i]
}
