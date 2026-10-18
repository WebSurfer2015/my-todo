import { describe, it, expect } from 'vitest'
import { applyEntitlementEvent, higherTier } from '../functions/src/entitlementEvents'
import { PRODUCT_IDS, type Entitlement } from '../functions/src/entitlements'

const free: Entitlement = { tier: 'free', validUntil: null }
const EXP = 1893456000000 // fixed ms so expectations are deterministic
const expISO = new Date(EXP).toISOString()

describe('applyEntitlementEvent', () => {
  it('INITIAL_PURCHASE sets tier + validUntil from expiration', () => {
    const next = applyEntitlementEvent(free, {
      type: 'INITIAL_PURCHASE',
      product_id: PRODUCT_IDS.premiumMonthly,
      expiration_at_ms: EXP,
    })
    expect(next).toEqual({ tier: 'premium', validUntil: expISO })
  })

  it('PRODUCT_CHANGE monthly→annual stays premium', () => {
    const cur: Entitlement = { tier: 'premium', validUntil: expISO }
    const next = applyEntitlementEvent(cur, {
      type: 'PRODUCT_CHANGE',
      product_id: PRODUCT_IDS.premiumMonthly,
      new_product_id: PRODUCT_IDS.premiumAnnual,
      expiration_at_ms: EXP,
    })
    expect(next.tier).toBe('premium')
  })

  it('an unrecognized product is a no-op (returns the same reference)', () => {
    expect(
      applyEntitlementEvent(free, { type: 'INITIAL_PURCHASE', product_id: 'com.unknown' }),
    ).toBe(free)
    // NON_RENEWING (old top-up event) is no longer handled → default no-op.
    expect(
      applyEntitlementEvent(free, { type: 'NON_RENEWING_PURCHASE', product_id: 'com.unknown' }),
    ).toBe(free)
  })

  it('EXPIRATION drops to free', () => {
    const cur: Entitlement = { tier: 'premium', validUntil: expISO }
    expect(applyEntitlementEvent(cur, { type: 'EXPIRATION' })).toEqual({
      tier: 'free',
      validUntil: null,
    })
  })

  it('BILLING_ISSUE extends validUntil through a later grace window', () => {
    const cur: Entitlement = { tier: 'premium', validUntil: expISO }
    const grace = EXP + 3 * 24 * 3600 * 1000
    const next = applyEntitlementEvent(cur, {
      type: 'BILLING_ISSUE',
      grace_period_expiration_at_ms: grace,
    })
    expect(next.validUntil).toBe(new Date(grace).toISOString())
  })

  it('BILLING_ISSUE never shortens an already-later validUntil', () => {
    const later = new Date(EXP + 10 * 24 * 3600 * 1000).toISOString()
    const cur: Entitlement = { tier: 'premium', validUntil: later }
    const next = applyEntitlementEvent(cur, {
      type: 'BILLING_ISSUE',
      grace_period_expiration_at_ms: EXP,
    })
    expect(next.validUntil).toBe(later)
  })

  it('CANCELLATION is a no-op (still valid until expiry)', () => {
    const cur: Entitlement = { tier: 'premium', validUntil: expISO }
    expect(applyEntitlementEvent(cur, { type: 'CANCELLATION' })).toBe(cur)
  })
})

describe('higherTier', () => {
  it('ranks free < premium and ignores nulls', () => {
    expect(higherTier('free', 'premium')).toBe('premium')
    expect(higherTier('premium', 'free')).toBe('premium')
    expect(higherTier('premium', null)).toBe('premium')
    expect(higherTier(null, 'free')).toBe('free')
    expect(higherTier(null, null)).toBe(null)
  })
})
