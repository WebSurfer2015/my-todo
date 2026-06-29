import { describe, it, expect } from 'vitest'
import {
  PRODUCT_IDS,
  productRank,
  isUpgrade,
  billingForProduct,
  tierForProduct,
} from '../../core/src/domain/entitlements'

const { premiumMonthly, premiumAnnual, maxMonthly, maxAnnual } = PRODUCT_IDS

describe('subscription upgrade ordering', () => {
  it('ranks products premium-monthly < premium-annual < max-monthly < max-annual', () => {
    expect(productRank(premiumMonthly)).toBe(0)
    expect(productRank(premiumAnnual)).toBe(1)
    expect(productRank(maxMonthly)).toBe(2)
    expect(productRank(maxAnnual)).toBe(3)
    expect(productRank(null)).toBe(-1)
    expect(productRank('com.websurfer.mytodo.topup.150')).toBe(-1)
  })

  it('lets a Premium-Monthly user upgrade to premium-annual, max-monthly, or max-annual', () => {
    expect(isUpgrade(premiumMonthly, premiumAnnual)).toBe(true)
    expect(isUpgrade(premiumMonthly, maxMonthly)).toBe(true)
    expect(isUpgrade(premiumMonthly, maxAnnual)).toBe(true)
    // …but not re-buy the same product
    expect(isUpgrade(premiumMonthly, premiumMonthly)).toBe(false)
  })

  it('lets a Premium-Annual user upgrade only to max-monthly or max-annual', () => {
    expect(isUpgrade(premiumAnnual, maxMonthly)).toBe(true)
    expect(isUpgrade(premiumAnnual, maxAnnual)).toBe(true)
    // not a downgrade back to premium-monthly
    expect(isUpgrade(premiumAnnual, premiumMonthly)).toBe(false)
    expect(isUpgrade(premiumAnnual, premiumAnnual)).toBe(false)
  })

  it('lets a Max-Monthly user upgrade only to max-annual; Max-Annual is the top', () => {
    expect(isUpgrade(maxMonthly, maxAnnual)).toBe(true)
    expect(isUpgrade(maxMonthly, premiumAnnual)).toBe(false)
    expect(isUpgrade(maxAnnual, maxMonthly)).toBe(false)
    expect(isUpgrade(maxAnnual, premiumAnnual)).toBe(false)
  })

  it('lets a Free user (null) buy any paid product', () => {
    expect(isUpgrade(null, premiumMonthly)).toBe(true)
    expect(isUpgrade(null, maxAnnual)).toBe(true)
  })

  it('maps billing period + tier per product', () => {
    expect(billingForProduct(premiumMonthly)).toBe('monthly')
    expect(billingForProduct(maxAnnual)).toBe('annual')
    expect(tierForProduct(maxMonthly)).toBe('max')
    expect(tierForProduct(premiumAnnual)).toBe('premium')
  })
})
