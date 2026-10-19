/**
 * Small pure decision helpers pulled out of RN components / SDK adapters:
 *   - tierFromCustomerInfo / productFromCustomerInfo (RevenueCat → Tier)
 *   - shouldIgnoreToggleTap (TaskItem's double-tap guard)
 *   - planDetailsOpen (details-sheet Modal handoff on a reminder / row tap)
 */
import { describe, it, expect } from 'vitest'
import { tierFromCustomerInfo, productFromCustomerInfo } from '../adapters/purchaseTier'
import { shouldIgnoreToggleTap, UNCOMPLETE_GUARD_MS } from '../features/task/TaskItem/toggleGuard'
import { planDetailsOpen } from '../app/detailsOpenPlan'
import { PRODUCT_IDS } from '../core-bindings/entitlements'

describe('tierFromCustomerInfo', () => {
  it('no info / nothing active → free', () => {
    expect(tierFromCustomerInfo(null)).toBe('free')
    expect(tierFromCustomerInfo({ entitlements: { active: {} }, activeSubscriptions: [] })).toBe('free')
  })

  it('derives premium from the entitlement\'s product, whatever the entitlement is named', () => {
    expect(
      tierFromCustomerInfo({
        entitlements: { active: { 'pro-access': { productIdentifier: PRODUCT_IDS.premiumAnnual } } },
      }),
    ).toBe('premium')
  })

  it('reads raw active subscriptions and strips an Android base-plan suffix', () => {
    expect(
      tierFromCustomerInfo({
        entitlements: { active: {} },
        activeSubscriptions: [`${PRODUCT_IDS.premiumMonthly}:monthly-base`],
      }),
    ).toBe('premium')
  })

  it('falls back to an entitlement literally named "premium"', () => {
    expect(tierFromCustomerInfo({ entitlements: { active: { premium: { productIdentifier: 'legacy.sku' } } } })).toBe(
      'premium',
    )
    expect(tierFromCustomerInfo({ entitlements: { active: { other: { productIdentifier: 'legacy.sku' } } } })).toBe(
      'free',
    )
  })
})

describe('productFromCustomerInfo', () => {
  it('picks the highest-rank product (annual over monthly)', () => {
    expect(
      productFromCustomerInfo({
        entitlements: { active: { premium: { productIdentifier: PRODUCT_IDS.premiumMonthly } } },
        activeSubscriptions: [`${PRODUCT_IDS.premiumAnnual}:p1y`],
      }),
    ).toBe(PRODUCT_IDS.premiumAnnual)
  })

  it('null when on free or unknown products', () => {
    expect(productFromCustomerInfo(null)).toBeNull()
    expect(productFromCustomerInfo({ entitlements: { active: {} }, activeSubscriptions: ['x.y'] })).toBeNull()
  })
})

describe('shouldIgnoreToggleTap', () => {
  const now = 10_000
  it('ignores taps while a completion is held', () => {
    expect(shouldIgnoreToggleTap({ hasPendingCompletion: true, lastCompletedAt: 0, now })).toBe(true)
  })
  it('ignores the second tap of a double-tap, inside the guard window', () => {
    expect(
      shouldIgnoreToggleTap({ hasPendingCompletion: false, lastCompletedAt: now - UNCOMPLETE_GUARD_MS + 1, now }),
    ).toBe(true)
  })
  it('accepts a tap once the window has passed (and with no prior completion)', () => {
    expect(
      shouldIgnoreToggleTap({ hasPendingCompletion: false, lastCompletedAt: now - UNCOMPLETE_GUARD_MS, now }),
    ).toBe(false)
    expect(shouldIgnoreToggleTap({ hasPendingCompletion: false, lastCompletedAt: 0, now })).toBe(false)
  })
})

describe('planDetailsOpen', () => {
  it('opens right away when nothing is up', () => {
    expect(planDetailsOpen({ todoId: 'a', detailsId: null, anySheetOpen: false })).toBe('now')
  })
  it('closes another sheet first (iOS cannot stack Modals)', () => {
    expect(planDetailsOpen({ todoId: 'a', detailsId: null, anySheetOpen: true })).toBe('after-close')
  })
  it('swaps through the open details sheet\'s save path', () => {
    expect(planDetailsOpen({ todoId: 'a', detailsId: 'b', anySheetOpen: false })).toBe('swap')
  })
  it('is a no-op when that to-do is already showing', () => {
    expect(planDetailsOpen({ todoId: 'a', detailsId: 'a', anySheetOpen: true })).toBe('already-open')
  })
})
