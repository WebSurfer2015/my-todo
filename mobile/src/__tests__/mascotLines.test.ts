import { describe, expect, it } from 'vitest'
import {
  MASCOT_LINES,
  dateSeed,
  pickMascotLine,
} from '../mascotLines'

describe('mascotLines', () => {
  it('every time-of-day bucket has both fresh and going variants', () => {
    for (const tod of ['morning', 'afternoon', 'evening'] as const) {
      expect(MASCOT_LINES[tod].fresh.length).toBeGreaterThan(0)
      expect(MASCOT_LINES[tod].going.length).toBeGreaterThan(0)
    }
  })

  it('mascot copy never uses exclamation marks (anxiety-friendly tone)', () => {
    for (const tod of ['morning', 'afternoon', 'evening'] as const) {
      for (const variant of ['fresh', 'going'] as const) {
        for (const line of MASCOT_LINES[tod][variant]) {
          expect(line, `"${line}" should not contain '!'`).not.toMatch(/!/)
        }
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
    const line = pickMascotLine('morning', 0, '2026-05-16')
    expect(MASCOT_LINES.morning.fresh).toContain(line)
  })

  it('pickMascotLine picks from `going` when plate has items', () => {
    const line = pickMascotLine('morning', 3, '2026-05-16')
    expect(MASCOT_LINES.morning.going).toContain(line)
  })

  it('pickMascotLine returns the same line across calls within a day', () => {
    const a = pickMascotLine('evening', 5, '2026-05-16')
    const b = pickMascotLine('evening', 5, '2026-05-16')
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
      lines.add(pickMascotLine('morning', 0, iso))
    }
    expect(lines.size).toBeGreaterThan(1)
  })
})
