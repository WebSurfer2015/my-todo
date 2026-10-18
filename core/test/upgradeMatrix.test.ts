import { describe, it, expect } from 'vitest'
import {
  PRODUCT_IDS,
  productRank,
  isUpgrade,
  billingForProduct,
  tierForProduct,
} from '../src/domain/entitlements'

const { premiumMonthly, premiumAnnual } = PRODUCT_IDS

describe('subscription upgrade ordering', () => {
  it('ranks products premium-monthly < premium-annual; non-subs are -1', () => {
    expect(productRank(premiumMonthly)).toBe(0)
    expect(productRank(premiumAnnual)).toBe(1)
    expect(productRank(null)).toBe(-1)
    // Removed products (top-ups, Max) are not subscriptions → -1.
    expect(productRank('com.websurfer.mytodo.topup.150')).toBe(-1)
    expect(productRank('com.websurfer.mytodo.max.annual')).toBe(-1)
  })

  it('lets a Premium-Monthly user upgrade to premium-annual, but not re-buy', () => {
    expect(isUpgrade(premiumMonthly, premiumAnnual)).toBe(true)
    expect(isUpgrade(premiumMonthly, premiumMonthly)).toBe(false)
  })

  it('does not let a Premium-Annual user "upgrade" back to monthly', () => {
    expect(isUpgrade(premiumAnnual, premiumMonthly)).toBe(false)
    expect(isUpgrade(premiumAnnual, premiumAnnual)).toBe(false)
  })

  it('lets a Free user (null) buy any paid product', () => {
    expect(isUpgrade(null, premiumMonthly)).toBe(true)
    expect(isUpgrade(null, premiumAnnual)).toBe(true)
  })

  it('maps billing period + tier per product', () => {
    expect(billingForProduct(premiumMonthly)).toBe('monthly')
    expect(billingForProduct(premiumAnnual)).toBe('annual')
    expect(tierForProduct(premiumAnnual)).toBe('premium')
    expect(tierForProduct('com.websurfer.mytodo.max.monthly')).toBe(null)
  })
})
