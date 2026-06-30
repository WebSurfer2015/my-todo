import { describe, it, expect } from 'vitest'
import { applyEntitlementEvent, higherTier } from '../functions/src/entitlementEvents'
import { PRODUCT_IDS, type Entitlement } from '../functions/src/entitlements'

const free: Entitlement = { tier: 'free', validUntil: null, topUpBalance: 0 }
const EXP = 1893456000000 // fixed ms so expectations are deterministic
const expISO = new Date(EXP).toISOString()

describe('applyEntitlementEvent', () => {
  it('INITIAL_PURCHASE sets tier + validUntil from expiration', () => {
    const next = applyEntitlementEvent(free, {
      type: 'INITIAL_PURCHASE',
      product_id: PRODUCT_IDS.premiumMonthly,
      expiration_at_ms: EXP,
    })
    expect(next).toEqual({ tier: 'premium', validUntil: expISO, topUpBalance: 0 })
  })

  it('PRODUCT_CHANGE upgrade (premium→max) reflects max immediately', () => {
    const cur: Entitlement = { tier: 'premium', validUntil: expISO, topUpBalance: 0 }
    const next = applyEntitlementEvent(cur, {
      type: 'PRODUCT_CHANGE',
      product_id: PRODUCT_IDS.premiumMonthly,
      new_product_id: PRODUCT_IDS.maxAnnual,
      expiration_at_ms: EXP,
    })
    expect(next.tier).toBe('max')
  })

  it('PRODUCT_CHANGE deferred downgrade (max→premium) keeps max until renewal', () => {
    const cur: Entitlement = { tier: 'max', validUntil: expISO, topUpBalance: 0 }
    const next = applyEntitlementEvent(cur, {
      type: 'PRODUCT_CHANGE',
      product_id: PRODUCT_IDS.maxMonthly,
      new_product_id: PRODUCT_IDS.premiumMonthly,
      expiration_at_ms: EXP,
    })
    expect(next.tier).toBe('max')
  })

  it('NON_RENEWING_PURCHASE credits the top-up grant', () => {
    const next = applyEntitlementEvent(
      { tier: 'premium', validUntil: expISO, topUpBalance: 10 },
      { type: 'NON_RENEWING_PURCHASE', product_id: PRODUCT_IDS.topup150 },
    )
    expect(next.topUpBalance).toBe(160)
  })

  it('is NOT idempotent itself — each call credits (the webhook dedupe enforces once)', () => {
    let e: Entitlement = free
    e = applyEntitlementEvent(e, { type: 'NON_RENEWING_PURCHASE', product_id: PRODUCT_IDS.topup500 })
    e = applyEntitlementEvent(e, { type: 'NON_RENEWING_PURCHASE', product_id: PRODUCT_IDS.topup500 })
    expect(e.topUpBalance).toBe(1000)
  })

  it('an unrecognized product is a no-op (returns the same reference)', () => {
    expect(
      applyEntitlementEvent(free, { type: 'NON_RENEWING_PURCHASE', product_id: 'com.unknown' }),
    ).toBe(free)
    expect(
      applyEntitlementEvent(free, { type: 'INITIAL_PURCHASE', product_id: 'com.unknown' }),
    ).toBe(free)
  })

  it('EXPIRATION drops to free but preserves the top-up balance', () => {
    const cur: Entitlement = { tier: 'max', validUntil: expISO, topUpBalance: 42 }
    expect(applyEntitlementEvent(cur, { type: 'EXPIRATION' })).toEqual({
      tier: 'free',
      validUntil: null,
      topUpBalance: 42,
    })
  })

  it('BILLING_ISSUE extends validUntil through a later grace window', () => {
    const cur: Entitlement = { tier: 'premium', validUntil: expISO, topUpBalance: 0 }
    const grace = EXP + 3 * 24 * 3600 * 1000
    const next = applyEntitlementEvent(cur, {
      type: 'BILLING_ISSUE',
      grace_period_expiration_at_ms: grace,
    })
    expect(next.validUntil).toBe(new Date(grace).toISOString())
  })

  it('BILLING_ISSUE never shortens an already-later validUntil', () => {
    const later = new Date(EXP + 10 * 24 * 3600 * 1000).toISOString()
    const cur: Entitlement = { tier: 'premium', validUntil: later, topUpBalance: 0 }
    const next = applyEntitlementEvent(cur, {
      type: 'BILLING_ISSUE',
      grace_period_expiration_at_ms: EXP,
    })
    expect(next.validUntil).toBe(later)
  })

  it('CANCELLATION is a no-op (still valid until expiry)', () => {
    const cur: Entitlement = { tier: 'premium', validUntil: expISO, topUpBalance: 5 }
    expect(applyEntitlementEvent(cur, { type: 'CANCELLATION' })).toBe(cur)
  })
})

describe('higherTier', () => {
  it('ranks free < premium < max and ignores nulls', () => {
    expect(higherTier('premium', 'max')).toBe('max')
    expect(higherTier('max', 'premium')).toBe('max')
    expect(higherTier('premium', null)).toBe('premium')
    expect(higherTier(null, 'free')).toBe('free')
    expect(higherTier(null, null)).toBe(null)
  })
})
