import { describe, it, expect } from 'vitest'
import {
  decideMochiReservation,
  type MochiUsageDoc,
} from '../functions/src/mochiReservation'
import {
  TIER_LIMITS,
  PRODUCT_IDS,
  effectiveTier,
  tierForProduct,
  type Entitlement,
  type Tier,
} from '../functions/src/entitlements'
import {
  canUseThemes,
  canUseAiPlanning,
  canBuyTopUp,
} from '../../core/src/domain/entitlements'

/**
 * End-to-end-ish verification of the tiered-pricing money logic, with no
 * Firestore/RevenueCat needed. Covers the path a purchase takes —
 * product → tier (tierForProduct), tier validity (effectiveTier), then the
 * per-request reservation accounting (decideMochiReservation) the server
 * actually enforces. The reservation pure fn is the same code reserveMochiRequest
 * runs inside its transaction; only the Firestore writes differ.
 *
 * Run before sandbox testing to be confident the allowances + pay-as-you-go
 * behave exactly as the paywall advertises — and that we can't lose money.
 */

const TODAY = '2026-06-27'
const MONTH = '2026-06'
const ent = (over: Partial<Entitlement> = {}): Entitlement => ({
  tier: 'free',
  validUntil: null,
  topUpBalance: 0,
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
  it('maps each subscription product to its tier; consumables/unknown → null', () => {
    expect(tierForProduct(PRODUCT_IDS.premiumMonthly)).toBe('premium')
    expect(tierForProduct(PRODUCT_IDS.premiumAnnual)).toBe('premium')
    expect(tierForProduct(PRODUCT_IDS.maxMonthly)).toBe('max')
    expect(tierForProduct(PRODUCT_IDS.maxAnnual)).toBe('max')
    expect(tierForProduct(PRODUCT_IDS.topup150)).toBeNull()
    expect(tierForProduct('com.bogus.thing')).toBeNull()
  })
})

describe('subscription validity (effectiveTier)', () => {
  const now = Date.parse('2026-06-27T00:00:00Z')
  it('honors an unexpired paid tier', () => {
    expect(effectiveTier(ent({ tier: 'premium', validUntil: '2026-07-27T00:00:00Z' }), now)).toBe('premium')
    expect(effectiveTier(ent({ tier: 'max', validUntil: '2026-12-01T00:00:00Z' }), now)).toBe('max')
  })
  it('downgrades a lapsed subscription to free', () => {
    expect(effectiveTier(ent({ tier: 'premium', validUntil: '2026-05-01T00:00:00Z' }), now)).toBe('free')
    expect(effectiveTier(ent({ tier: 'max', validUntil: null }), now)).toBe('free')
  })
})

describe('Free — 3/day, then pay as you go', () => {
  it('allows the first request and counts day + month', () => {
    const d = decideMochiReservation('free', ent(), null, TODAY, MONTH)
    expect(d.allow).toBe(true)
    expect(d.nextUsage).toEqual({ month: MONTH, monthCalls: 1, date: TODAY, dayCalls: 1 })
    expect(d.nextEntitlement).toBeNull()
  })
  it('blocks the 4th request the same day with a "daily" reason (no top-up)', () => {
    const d = decideMochiReservation('free', ent(), usage({ dayCalls: 3, monthCalls: 3 }), TODAY, MONTH)
    expect(d.allow).toBe(false)
    expect(d.reason).toBe('daily')
  })
  it('lets a top-up balance pay as you go past the daily cap (no daily/monthly increment)', () => {
    const d = decideMochiReservation('free', ent({ topUpBalance: 10 }), usage({ dayCalls: 3, monthCalls: 3 }), TODAY, MONTH)
    expect(d.allow).toBe(true)
    expect(d.nextUsage).toBeNull()
    expect(d.nextEntitlement).toEqual(ent({ topUpBalance: 9 }))
  })
  it('resets the daily count on a new day (yesterday\'s usage ignored)', () => {
    const d = decideMochiReservation('free', ent(), usage({ date: '2026-06-26', dayCalls: 3, monthCalls: 3 }), TODAY, MONTH)
    expect(d.allow).toBe(true)
    expect(d.nextUsage).toEqual({ month: MONTH, monthCalls: 4, date: TODAY, dayCalls: 1 })
  })
})

describe('Premium — no daily limit, monthly cap, then pay as you go', () => {
  it('allows a heavy single day (no daily cap binds before monthly)', () => {
    const d = decideMochiReservation('premium', ent({ tier: 'premium' }), usage({ dayCalls: 200, monthCalls: 200 }), TODAY, MONTH)
    expect(d.allow).toBe(true)
  })
  it('blocks at the monthly cap with a "monthly" reason (no top-up)', () => {
    const at = TIER_LIMITS.premium.mochiMonthly
    const d = decideMochiReservation('premium', ent({ tier: 'premium' }), usage({ dayCalls: at, monthCalls: at }), TODAY, MONTH)
    expect(d.allow).toBe(false)
    expect(d.reason).toBe('monthly')
  })
  it('lets a top-up pay as you go past the monthly cap', () => {
    const at = TIER_LIMITS.premium.mochiMonthly
    const d = decideMochiReservation('premium', ent({ tier: 'premium', topUpBalance: 5 }), usage({ dayCalls: at, monthCalls: at }), TODAY, MONTH)
    expect(d.allow).toBe(true)
    expect(d.nextEntitlement?.topUpBalance).toBe(4)
  })
  it('resets the monthly count on a new month', () => {
    const at = TIER_LIMITS.premium.mochiMonthly
    const d = decideMochiReservation('premium', ent({ tier: 'premium' }), usage({ month: '2026-05', monthCalls: at, dayCalls: 0 }), TODAY, MONTH)
    expect(d.allow).toBe(true)
    expect(d.nextUsage?.monthCalls).toBe(1)
  })
})

describe('feature gates match the offerings', () => {
  const tiers: Tier[] = ['free', 'premium', 'max']
  it('themes are free for everyone', () => {
    expect(tiers.map(canUseThemes)).toEqual([true, true, true])
  })
  it('AI planning is max-only', () => {
    expect(tiers.map(canUseAiPlanning)).toEqual([false, false, true])
  })
  it('pay-as-you-go (top-ups) is available on every tier', () => {
    expect(tiers.map(canBuyTopUp)).toEqual([true, true, true])
  })
})

describe('loss-safety invariant — AI cost can never exceed revenue', () => {
  // ~$0.005 / Mochi request at current Haiku pricing (no caching).
  const COST = 0.005
  // Deepest-discounted annual, after Apple Small Business Program (15%):
  //   Premium $19.99/yr → $1.41/mo net · Max $59.99/yr → $4.25/mo net.
  it('a fully-maxed monthly allowance stays under post-Apple net revenue', () => {
    expect(TIER_LIMITS.premium.mochiMonthly * COST).toBeLessThan(1.41)
    expect(TIER_LIMITS.max.mochiMonthly * COST).toBeLessThan(4.25)
  })
  it('the free tier daily allowance is a bounded acquisition cost', () => {
    expect(TIER_LIMITS.free.mochiDaily * 31 * COST).toBeLessThan(0.5)
  })
})
