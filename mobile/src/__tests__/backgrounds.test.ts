/**
 * Tests for mobile/src/backgrounds.ts — hex math + lookups + Pair
 * builder used by the avatar-themed canvas.
 *
 * All pure functions; safe under the node-env Vitest runner mobile
 * uses (no React Native APIs touched).
 */
import { describe, expect, it } from 'vitest'
import {
  lookupPair,
  lookupPattern,
  tonesFor,
  pairFromAvatarBg,
  darkenHex,
  lightenHex,
  PAIRS,
  PATTERNS,
} from '../backgrounds'

describe('darkenHex', () => {
  it('darkens white toward black proportionally', () => {
    expect(darkenHex('#FFFFFF', 0.5)).toBe('#808080')
    expect(darkenHex('#FFFFFF', 1)).toBe('#000000')
    expect(darkenHex('#FFFFFF', 0)).toBe('#ffffff')
  })
  it('handles hashes optionally', () => {
    expect(darkenHex('FFFFFF', 0.5)).toBe('#808080')
  })
  it('darkens per channel', () => {
    // #C2C7CC × 0.5 = #616364 (each channel halved + rounded)
    expect(darkenHex('#C2C7CC', 0.5)).toBe('#616466')
  })
  it('clamps at 0 (no negative wrap)', () => {
    expect(darkenHex('#000000', 0.5)).toBe('#000000')
  })
  it('returns input unchanged when hex is malformed', () => {
    expect(darkenHex('not-a-hex')).toBe('not-a-hex')
    expect(darkenHex('#XYZ123')).toBe('#XYZ123')
    expect(darkenHex('#ABCDE')).toBe('#ABCDE') // 5 chars
  })
})

describe('lightenHex', () => {
  it('lightens black toward white proportionally', () => {
    expect(lightenHex('#000000', 0.5)).toBe('#808080')
    expect(lightenHex('#000000', 1)).toBe('#ffffff')
    expect(lightenHex('#000000', 0)).toBe('#000000')
  })
  it('returns white unchanged at any amount (already 255)', () => {
    expect(lightenHex('#FFFFFF', 0.5)).toBe('#ffffff')
  })
  it('lightens per channel', () => {
    // #808080 + 0.5 toward 255: each channel = 128 + 127*0.5 = 191.5
    // Math.round(191.5) = 192 = 0xC0 in JS (rounds half toward +inf).
    expect(lightenHex('#808080', 0.5)).toBe('#c0c0c0')
  })
  it('returns input unchanged when hex is malformed', () => {
    expect(lightenHex('not-a-hex')).toBe('not-a-hex')
  })
})

describe('lightenHex / darkenHex roundtrip stays in same hue family', () => {
  it('small-amount roundtrip lands close to original', () => {
    // Small amount keeps rounding error tight — exercises that
    // both functions live in the same color space (no hue shift).
    const orig = '#B3C4CC'
    const lt = lightenHex(orig, 0.05)
    const back = darkenHex(lt, 0.05)
    const parse = (h: string) => {
      const n = parseInt(h.slice(1), 16)
      return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
    }
    const [r1, g1, b1] = parse(orig)
    const [r2, g2, b2] = parse(back)
    // ±10 per channel handles the rounding drift on a small step.
    expect(Math.abs(r1 - r2)).toBeLessThan(10)
    expect(Math.abs(g1 - g2)).toBeLessThan(10)
    expect(Math.abs(b1 - b2)).toBeLessThan(10)
  })
})

describe('lookupPair', () => {
  it('returns the first pair when key is undefined', () => {
    expect(lookupPair(undefined)).toBe(PAIRS[0])
  })
  it('returns the matching pair when key exists', () => {
    const known = PAIRS[1]?.key
    if (known) expect(lookupPair(known)).toBe(PAIRS[1])
  })
  it('falls back to the first pair for an unknown key', () => {
    expect(lookupPair('does-not-exist')).toBe(PAIRS[0])
  })
})

describe('lookupPattern', () => {
  it('returns the first pattern when key is undefined', () => {
    expect(lookupPattern(undefined)).toBe(PATTERNS[0])
  })
  it('falls back to the first pattern for an unknown key', () => {
    expect(lookupPattern('does-not-exist')).toBe(PATTERNS[0])
  })
})

describe('tonesFor', () => {
  it('returns light tones for light scheme', () => {
    const p = PAIRS[0]
    expect(tonesFor(p, 'light')).toEqual(p.light)
  })
  it('returns dark tones for dark scheme', () => {
    const p = PAIRS[0]
    expect(tonesFor(p, 'dark')).toEqual(p.dark)
  })
})

describe('pairFromAvatarBg', () => {
  it('produces a Pair keyed by the avatar bg', () => {
    const p = pairFromAvatarBg('#B3C4CC')
    expect(p.key).toBe('avatar:#B3C4CC')
    expect(p.label).toBe('Avatar')
  })
  it('light-mode light is a lightened variant of bg, deep is darker', () => {
    const bg = '#B3C4CC'
    const p = pairFromAvatarBg(bg)
    expect(p.light.light).toBe(lightenHex(bg, 0.4))
    expect(p.light.deep).toBe(darkenHex(bg, 0.12))
  })
  it('dark-mode light is a near-black darkened variant of bg', () => {
    const bg = '#B3C4CC'
    const p = pairFromAvatarBg(bg)
    expect(p.dark.light).toBe(darkenHex(bg, 0.78))
    expect(p.dark.deep).toBe(darkenHex(bg, 0.6))
  })
})
