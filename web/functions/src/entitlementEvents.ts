/**
 * Pure entitlement-event logic for the RevenueCat webhook.
 *
 * Extracted out of revenuecat.ts (which pulls in firebase-admin / Firestore so
 * can't be unit-tested without booting the SDK) so the money-critical
 * tier-mapping — upgrade/downgrade ordering, top-up crediting, expiration,
 * grace — is covered by tests. The webhook keeps the I/O: auth, the
 * idempotency dedupe, the Firestore transaction, and the multi-account TRANSFER
 * fan-out.
 */
import {
  TOPUP_GRANTS,
  tierForProduct,
  type Entitlement,
  type Tier,
} from './entitlements'

/** RevenueCat event shape (the subset we use). */
export interface RCEvent {
  /** Unique event id — used to make delivery idempotent (RC is at-least-once). */
  id?: string
  type?: string
  app_user_id?: string
  product_id?: string
  /** Present on PRODUCT_CHANGE: the product the user is switching TO. */
  new_product_id?: string
  expiration_at_ms?: number
  /** Apple billing-retry grace window end (BILLING_ISSUE). */
  grace_period_expiration_at_ms?: number
  /** TRANSFER: app_user_ids losing / gaining the subscription. */
  transferred_from?: string[]
  transferred_to?: string[]
}

const TIER_RANK: Record<Tier, number> = { free: 0, premium: 1, max: 2 }

/** The higher-ranked of two tiers (nulls ignored), or null if both are null. */
export function higherTier(a: Tier | null, b: Tier | null): Tier | null {
  if (!a) return b
  if (!b) return a
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b
}

/**
 * Compute the next entitlement for a SINGLE-user lifecycle event. Returns
 * `current` UNCHANGED (same reference) for no-op events — CANCELLATION (still
 * valid until expiry), an unrecognized product, a BILLING_ISSUE with no grace
 * window, etc. — so the caller can skip a redundant write.
 *
 * TRANSFER is intentionally NOT handled here: it spans multiple accounts and is
 * applied by the webhook's setUserTier fan-out.
 *
 * PRODUCT_CHANGE carries new_product_id (the target). An immediate upgrade is
 * effective now; a deferred downgrade keeps the current (higher) product until
 * period end, after which a RENEWAL fires with only the new product. Taking the
 * HIGHER of the two tiers reflects an upgrade instantly and never applies a
 * downgrade early — the later RENEWAL lands the lower tier at the right time.
 */
export function applyEntitlementEvent(current: Entitlement, event: RCEvent): Entitlement {
  const productId = event.product_id ?? ''
  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'PRODUCT_CHANGE':
    case 'UNCANCELLATION': {
      const tier = higherTier(
        tierForProduct(productId),
        event.new_product_id ? tierForProduct(event.new_product_id) : null,
      )
      if (!tier) return current // not a subscription product — ignore
      const validUntil = event.expiration_at_ms
        ? new Date(event.expiration_at_ms).toISOString()
        : current.validUntil
      return { ...current, tier, validUntil }
    }
    case 'NON_RENEWING_PURCHASE': {
      // Consumable top-up pack — add its grant to the balance.
      const grant = TOPUP_GRANTS[productId]
      if (!grant) return current
      return { ...current, topUpBalance: current.topUpBalance + grant }
    }
    case 'EXPIRATION':
      // Subscription lapsed — drop to free, keep any top-up balance.
      return { ...current, tier: 'free', validUntil: null }
    case 'BILLING_ISSUE': {
      // Apple is retrying the charge — keep the user entitled through the grace
      // window so the server money-guard doesn't meter a still-active customer
      // as Free. Extend validUntil to the grace expiration when it's further out.
      const graceMs = event.grace_period_expiration_at_ms
      if (!graceMs) return current
      const graceUntil = new Date(graceMs).toISOString()
      const validUntil =
        !current.validUntil || graceUntil > current.validUntil
          ? graceUntil
          : current.validUntil
      return { ...current, validUntil }
    }
    // CANCELLATION = auto-renew off but still valid until expiry — no change.
    default:
      return current
  }
}
