import { describe, expect, it } from 'vitest'
import {
  MASCOT_LINES,
  dateSeed,
  pickMascotLine,
} from '../mascotLines'
import { LANG_ORDER } from '../../../core/src/data/i18n'

// Exclamation marks of every flavor break the anxiety-friendly tone:
// ASCII !, fullwidth ！ (Japanese), inverted ¡ (Spanish opening).
const ANY_EXCLAMATION = /[!！¡]/

describe('mascotLines', () => {
  it('every locale has all three time-of-day buckets with fresh + going variants', () => {
    for (const lang of LANG_ORDER) {
      for (const tod of ['morning', 'afternoon', 'evening'] as const) {
        expect(MASCOT_LINES[lang][tod].fresh.length,
          `${lang}.${tod}.fresh must be non-empty`).toBeGreaterThan(0)
        expect(MASCOT_LINES[lang][tod].going.length,
          `${lang}.${tod}.going must be non-empty`).toBeGreaterThan(0)
      }
    }
  })

  it('mascot copy never uses exclamation marks (any script)', () => {
    for (const lang of LANG_ORDER) {
      for (const tod of ['morning', 'afternoon', 'evening'] as const) {
        for (const variant of ['fresh', 'going'] as const) {
          for (const line of MASCOT_LINES[lang][tod][variant]) {
            expect(line,
              `${lang} "${line}" must not contain ! / ！ / ¡`)
              .not.toMatch(ANY_EXCLAMATION)
          }
        }
      }
    }
  })

  it('every locale has the same variant counts as English (parity)', () => {
    for (const lang of LANG_ORDER) {
      for (const tod of ['morning', 'afternoon', 'evening'] as const) {
        expect(MASCOT_LINES[lang][tod].fresh.length,
          `${lang}.${tod}.fresh length should match en`)
          .toBe(MASCOT_LINES.en[tod].fresh.length)
        expect(MASCOT_LINES[lang][tod].going.length,
          `${lang}.${tod}.going length should match en`)
          .toBe(MASCOT_LINES.en[tod].going.length)
      }
    }
  })

  it('dateSeed is stable for the same date', () => {
    expect(dateSeed('2026-05-16')).toBe(dateSeed('2026-05-16'))
  })

  it('dateSeed varies across days', () => {
    expect(dateSeed('2026-05-16')).not.toBe(dateSeed('2026-05-17'))
  })

  it('pickMascotLine picks from `fresh` when plate is empty', () => {
    const line = pickMascotLine('en', 'morning', 0, '2026-05-16')
    expect(MASCOT_LINES.en.morning.fresh).toContain(line)
  })

  it('pickMascotLine picks from `going` when plate has items', () => {
    const line = pickMascotLine('en', 'morning', 3, '2026-05-16')
    expect(MASCOT_LINES.en.morning.going).toContain(line)
  })

  it('pickMascotLine respects the locale parameter', () => {
    const esLine = pickMascotLine('es', 'morning', 0, '2026-05-16')
    expect(MASCOT_LINES.es.morning.fresh).toContain(esLine)
    const jaLine = pickMascotLine('ja', 'evening', 2, '2026-05-16')
    expect(MASCOT_LINES.ja.evening.going).toContain(jaLine)
  })

  it('pickMascotLine returns the same line across calls within a day', () => {
    const a = pickMascotLine('en', 'evening', 5, '2026-05-16')
    const b = pickMascotLine('en', 'evening', 5, '2026-05-16')
    expect(a).toBe(b)
  })

  it('pickMascotLine rotates across days', () => {
    // Pick a date and the next 30 days; expect at least 2 unique lines.
    // Anything less and the rotation isn't actually rotating.
    const lines = new Set<string>()
    const start = new Date('2026-05-16T00:00:00')
    for (let i = 0; i < 30; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      const iso = d.toISOString().slice(0, 10)
      lines.add(pickMascotLine('en', 'morning', 0, iso))
    }
    expect(lines.size).toBeGreaterThan(1)
  })
})
