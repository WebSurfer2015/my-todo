import { describe, expect, it } from 'vitest'
import { THEMES } from '../app/theme'
import { priorityGlyphColor } from '../ui/priorityGlyph'
import { PRIORITY_VALUES } from '../core-bindings/types'

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
        // "Empty Done…" red text on the bin's retention banner (surface).
        expect(contrast(c.red, c.surface)).toBeGreaterThanOrEqual(4.5)
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
      it(`${name}/${scheme}: details sheet step controls`, () => {
        // An open step's circle (label2 border, non-text 3:1) on the sheet,
        // and the "…" steps menu glyph; the series repeat line (label2 text)
        // and its "change in Edit series" link (label, bold) on the field card.
        expect(contrast(c.label2, c.modal)).toBeGreaterThanOrEqual(3)
        expect(contrast(c.label2, c.bg)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(c.label, c.bg)).toBeGreaterThanOrEqual(4.5)
      })
      it(`${name}/${scheme}: priority glyph (non-text 3:1, High never red)`, () => {
        for (const level of PRIORITY_VALUES) {
          const ink = priorityGlyphColor(c, level)
          for (const bg of [c.card, c.bg, c.modal]) {
            expect(contrast(ink, bg)).toBeGreaterThanOrEqual(3)
          }
        }
        expect(priorityGlyphColor(c, 'high')).not.toBe(c.red)
        expect(priorityGlyphColor(c, 'high')).toBe(c.warmText)
      })
      it(`${name}/${scheme}: Ask Mochi voice input`, () => {
        // "Listening…" / denied note (label2) and the Open Settings link
        // (primary) on the chat sheet; the mic icon (label2, non-text 3:1) and
        // the Stop square (primary) on its soft listening fill.
        expect(contrast(c.label2, c.modal)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(c.primary, c.modal)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(c.primary, c.primarySoft)).toBeGreaterThanOrEqual(3)
        // Idle mic: label2 icon on its soft surfaceAlt circle (non-text 3:1).
        expect(contrast(c.label2, c.surfaceAlt)).toBeGreaterThanOrEqual(3)
        // Listening mic: primaryOn Stop square on the filled primary circle.
        expect(contrast(c.primaryOn, c.primary)).toBeGreaterThanOrEqual(3)
        // "ADDED TO YOUR TO-DOS" / "ADDED TO SHOPPING LIST" (12pt label2) on
        // the proposal card (modal).
        expect(contrast(c.label2, c.modal)).toBeGreaterThanOrEqual(4.5)
      })
      it(`${name}/${scheme}: Shopping check-off circle`, () => {
        // The grocery row's circle ring (label3) on its card (non-text 3:1).
        expect(contrast(c.label3, c.card)).toBeGreaterThanOrEqual(3)
      })
    }
  }
})
