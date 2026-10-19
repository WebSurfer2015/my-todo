import { describe, expect, it } from 'vitest'
import { THEMES } from '../app/theme'

// WCAG 2.x relative luminance / contrast ratio.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('theme contrast (WCAG AA)', () => {
  for (const [name, { light, dark }] of Object.entries(THEMES)) {
    for (const [scheme, c] of [['light', light], ['dark', dark]] as const) {
      it(`${name}/${scheme}: secondary text, primary button, done text`, () => {
        expect(contrast(c.label2, c.bg)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(c.label2, c.card)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(c.label, c.card)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(c.primaryOn, c.primary)).toBeGreaterThanOrEqual(4.5)
        // Done (struck-through) text is deliberately faded: 3:1 floor.
        expect(contrast(c.label3, c.card)).toBeGreaterThanOrEqual(3)
        // Warm text (carried over / today chips) on cards.
        expect(contrast(c.warmText, c.card)).toBeGreaterThanOrEqual(4.5)
        // Red: as text (Delete actions) and as a fill under onDanger text.
        expect(contrast(c.red, c.card)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(c.onDanger, c.red)).toBeGreaterThanOrEqual(4.5)
        // On-accent ink on every accent fill alias (SignIn submit, TaskItem
        // swipe Edit, primary buttons) — plain white fails in dark themes.
        for (const fill of [c.primary, c.blue, c.teal]) {
          expect(contrast(c.primaryOn, fill)).toBeGreaterThanOrEqual(4.5)
        }
        // Dark ink on the pastel swipe buttons (TaskItem SWIPE_INK).
        for (const bg of [c.orange, c.green, c.gray]) {
          expect(contrast('#1F2A24', bg)).toBeGreaterThanOrEqual(4.5)
        }
      })
      it(`${name}/${scheme}: Ask Mochi voice input`, () => {
        // "Listening…" / denied note (label2) and the Open Settings link
        // (primary) on the chat sheet; the mic icon (label2, non-text 3:1) and
        // the Stop square (primary) on its soft listening fill.
        expect(contrast(c.label2, c.modal)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(c.primary, c.modal)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(c.primary, c.primarySoft)).toBeGreaterThanOrEqual(3)
      })
    }
  }
})
