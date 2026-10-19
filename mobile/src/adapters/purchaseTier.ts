/**
 * Pure RevenueCat CustomerInfo → Tier / product mapping (no SDK, no config),
 * split out of purchases.ts so it is unit-testable. purchases.ts re-exports.
 *
 * Only the fields read here are required, so tests can pass plain objects.
 */
import type { Tier } from '../core-bindings/entitlements'
import { tierForProduct, TIER_ORDER, productRank } from '../core-bindings/entitlements'

export interface CustomerInfoLike {
  entitlements: { active?: Record<string, { productIdentifier?: string } | undefined> }
  activeSubscriptions?: string[]
}

/** Map RC CustomerInfo → effective Tier for instant UI.
 *
 * Derives the tier from the ACTIVE SUBSCRIPTION PRODUCT (via tierForProduct),
 * not the entitlement identifier — the purchased product id is unambiguous,
 * whereas a RevenueCat entitlement can be named anything. Falls back to a
 * tier-named entitlement identifier only if no product matches. */
export function tierFromCustomerInfo(info: CustomerInfoLike | null): Tier {
  if (!info) return 'free'
  let best: Tier = 'free'
  const consider = (productId: string | null | undefined) => {
    if (!productId) return
    // Android Play product ids carry a ":basePlan" suffix; iOS ids don't.
    const t = tierForProduct(productId.split(':')[0])
    if (t && TIER_ORDER.indexOf(t) > TIER_ORDER.indexOf(best)) best = t
  }
  // The product that unlocked each active entitlement is the most reliable
  // signal, regardless of how the entitlement itself is named or grouped.
  for (const ent of Object.values(info.entitlements.active ?? {})) {
    consider(ent?.productIdentifier)
  }
  // Also weigh raw active subscription product ids.
  for (const productId of info.activeSubscriptions ?? []) consider(productId)
  if (best !== 'free') return best
  // Last resort: entitlement identifiers literally named after the tier.
  const active = info.entitlements.active ?? {}
  if (active['premium']) return 'premium'
  return 'free'
}

/** The user's current (highest-rank) active subscription PRODUCT id, or null
 * when they're on Free. Used by the paywall to offer only upgrades. */
export function productFromCustomerInfo(info: CustomerInfoLike | null): string | null {
  if (!info) return null
  let best: string | null = null
  let bestRank = -1
  const consider = (productId: string | null | undefined) => {
    if (!productId) return
    const id = productId.split(':')[0] // strip Android ":basePlan" suffix
    const r = productRank(id)
    if (r > bestRank) {
      bestRank = r
      best = id
    }
  }
  for (const ent of Object.values(info.entitlements.active ?? {})) {
    consider(ent?.productIdentifier)
  }
  for (const productId of info.activeSubscriptions ?? []) consider(productId)
  return best
}
