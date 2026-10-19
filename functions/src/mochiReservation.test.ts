import { describe, it, expect } from 'vitest'
import {
  decideMochiReservation,
  type MochiUsageDoc,
} from './mochiReservation'
import {
  TIER_LIMITS,
  PRODUCT_IDS,
  effectiveTier,
  tierForProduct,
  type Entitlement,
  type Tier,
} from './entitlements'
import { MAX_CHAT_TURNS_PER_DAY } from './chatQuota'

/**
 * End-to-end-ish verification of the de-metered money logic, with no
 * Firestore/RevenueCat needed. Covers the path a purchase takes —
 * product → tier (tierForProduct), tier validity (effectiveTier), then the
 * per-request reservation accounting (decideMochiReservation) the server
 * enforces as an INVISIBLE fair-use ceiling (over it, allow:false signals the
 * client to fall back to local capture — no top-ups, no meter).
 */

const TODAY = '2026-06-27'
const MONTH = '2026-06'
const ent = (over: Partial<Entitlement> = {}): Entitlement => ({
  tier: 'free',
  validUntil: null,
  ...over,
})
const usage = (over: Partial<MochiUsageDoc> = {}): MochiUsageDoc => ({
  month: MONTH,
  monthCalls: 0,
  date: TODAY,
  dayCalls: 0,
  ...over,
})

describe('purchase → tier mapping (tierForProduct)', () => {
  it('maps each subscription product to its tier; removed/unknown → null', () => {
    expect(tierForProduct(PRODUCT_IDS.premiumMonthly)).toBe('premium')
    expect(tierForProduct(PRODUCT_IDS.premiumAnnual)).toBe('premium')
    // Max + top-ups were removed in the de-meter.
    expect(tierForProduct('com.websurfer.mytodo.max.annual')).toBeNull()
    expect(tierForProduct('com.websurfer.mytodo.topup.150')).toBeNull()
    expect(tierForProduct('com.bogus.thing')).toBeNull()
  })
})

describe('subscription validity (effectiveTier)', () => {
  const now = Date.parse('2026-06-27T00:00:00Z')
  it('honors an unexpired paid tier', () => {
    expect(effectiveTier(ent({ tier: 'premium', validUntil: '2026-07-27T00:00:00Z' }), now)).toBe('premium')
  })
  it('downgrades a lapsed subscription to free', () => {
    expect(effectiveTier(ent({ tier: 'premium', validUntil: '2026-05-01T00:00:00Z' }), now)).toBe('free')
    expect(effectiveTier(ent({ tier: 'premium', validUntil: null }), now)).toBe('free')
  })
})

const FREE_DAY = TIER_LIMITS.free.mochiDaily

describe('Free — invisible daily conversation ceiling, then graceful fallback', () => {
  it('allows the first request and counts day + month', () => {
    const d = decideMochiReservation('free', null, TODAY, MONTH)
    expect(d.allow).toBe(true)
    expect(d.nextUsage).toEqual({ month: MONTH, monthCalls: 1, date: TODAY, dayCalls: 1 })
  })
  it('signals fallback on the conversation past the daily ceiling with a "daily" reason', () => {
    const d = decideMochiReservation('free', usage({ dayCalls: FREE_DAY, monthCalls: FREE_DAY }), TODAY, MONTH)
    expect(d.allow).toBe(false)
    expect(d.reason).toBe('daily')
  })
  it('resets the daily count on a new day (yesterday\'s usage ignored)', () => {
    const d = decideMochiReservation('free', usage({ date: '2026-06-26', dayCalls: FREE_DAY, monthCalls: FREE_DAY }), TODAY, MONTH)
    expect(d.allow).toBe(true)
    expect(d.nextUsage).toEqual({ month: MONTH, monthCalls: FREE_DAY + 1, date: TODAY, dayCalls: 1 })
  })
})

describe('Premium — no daily sub-cap, invisible monthly fair-use ceiling', () => {
  it('allows a heavy single day (no daily cap binds before monthly)', () => {
    const d = decideMochiReservation('premium', usage({ dayCalls: 900, monthCalls: 900 }), TODAY, MONTH)
    expect(d.allow).toBe(true)
  })
  it('signals fallback at the monthly ceiling with a "monthly" reason', () => {
    const at = TIER_LIMITS.premium.mochiMonthly
    const d = decideMochiReservation('premium', usage({ dayCalls: at, monthCalls: at }), TODAY, MONTH)
    expect(d.allow).toBe(false)
    expect(d.reason).toBe('monthly')
  })
  it('resets the monthly count on a new month', () => {
    const at = TIER_LIMITS.premium.mochiMonthly
    const d = decideMochiReservation('premium', usage({ month: '2026-05', monthCalls: at, dayCalls: 0 }), TODAY, MONTH)
    expect(d.allow).toBe(true)
    expect(d.nextUsage?.monthCalls).toBe(1)
  })
})

describe('feature gates match the offerings', () => {
  const tiers: Tier[] = ['free', 'premium']
  it('themes are free for everyone', () => {
    expect(tiers.map((t) => TIER_LIMITS[t].themes)).toEqual([true, true])
  })
})

describe('tier limits (v2.0.0 owner decision: counted in CONVERSATIONS)', () => {
  it('free 15/day + 300/month; premium 1000/1000 (no daily sub-cap binds first)', () => {
    expect(TIER_LIMITS.free).toMatchObject({ mochiDaily: 15, mochiMonthly: 300 })
    expect(TIER_LIMITS.premium).toMatchObject({ mochiDaily: 1000, mochiMonthly: 1000 })
    expect(TIER_LIMITS.premium.mochiDaily).toBeGreaterThanOrEqual(TIER_LIMITS.premium.mochiMonthly)
  })
})

describe('cost blast radius — bounded per user per day', () => {
  // ~$0.005 / Mochi model call (turn) at current Haiku pricing (no caching).
  // NOTE: the old "maxed allowance < post-Apple net revenue" invariant no
  // longer holds once the allowance counts conversations (multi-turn) and
  // premium is 1000/month — that's an accepted owner decision; the hard
  // guarantee is now the per-day turn backstop below.
  const COST = 0.005
  it('the turn backstop caps worst-case daily spend per uid', () => {
    expect(MAX_CHAT_TURNS_PER_DAY * COST).toBeLessThanOrEqual(0.5)
  })
})
