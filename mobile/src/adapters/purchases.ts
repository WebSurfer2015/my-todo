/**
 * RevenueCat purchase adapter — the client side of the tiered-pricing flow.
 *
 * Responsibilities:
 *   - configure RC with the public iOS SDK key + identify the user as their
 *     Firebase uid (so the webhook's event.app_user_id maps to our user),
 *   - fetch offerings, run purchases, restore,
 *   - map RC CustomerInfo → an effective Tier for INSTANT client-side UI.
 *
 * Source-of-truth split (deliberate):
 *   - The server money-guard (reserveMochiRequest) trusts ONLY the Firestore
 *     entitlement doc, which the RevenueCat webhook writes. Never the client.
 *   - This adapter's tier is for snappy UI (paywall/gates) the moment a
 *     purchase completes, before the webhook round-trips. The Firestore doc
 *     catches up within seconds and remains authoritative.
 *
 * Fully GUARDED: with no API key configured (extra.revenueCatIosKey), every
 * call is an inert no-op and tier stays 'free', so the app runs unchanged
 * until you wire RevenueCat + rebuild the dev client. RC entitlement
 * identifiers expected in the dashboard: "premium" and "max".
 */

import Constants from 'expo-constants'
import type {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases'
import type { Tier } from '../core-bindings/entitlements'
import { tierForProduct, TIER_ORDER } from '../core-bindings/entitlements'

const API_KEY: string =
  (Constants.expoConfig?.extra as { revenueCatIosKey?: string } | undefined)
    ?.revenueCatIosKey ?? ''

export function isPurchasesEnabled(): boolean {
  return API_KEY.length > 0
}

// Lazy runtime handle. The static `import Purchases from 'react-native-
// purchases'` instantiates a NativeEventEmitter at module load and CRASHES
// if the native module isn't linked (e.g. a JS-only reload before an EAS
// rebuild). We only require() it once enabled — and every caller below is
// guarded by isPurchasesEnabled(), so on a key-less build it's never loaded.
function rc(): typeof import('react-native-purchases').default {
  return require('react-native-purchases').default
}

let configured = false

/** Configure RC once + identify the user. Safe to call repeatedly. No-op
 * when no API key is set. */
export async function configurePurchases(uid: string): Promise<void> {
  if (!isPurchasesEnabled()) return
  try {
    if (!configured) {
      rc().configure({ apiKey: API_KEY, appUserID: uid })
      configured = true
    } else {
      await rc().logIn(uid)
    }
  } catch (err) {
    console.warn('configurePurchases failed', err)
  }
}

/** The current offering (Pro + Elite, monthly + annual packages) for the
 * paywall, or null when unavailable. */
export async function fetchCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!isPurchasesEnabled()) return null
  try {
    const offerings = await rc().getOfferings()
    return offerings.current ?? null
  } catch (err) {
    console.warn('fetchCurrentOffering failed', err)
    return null
  }
}

/** Discriminated purchase outcome so callers can tell a user-cancel (silent)
 * apart from a genuine failure (worth surfacing) — the old `CustomerInfo | null`
 * collapsed both into null, leaving the paywall silent on a failed payment. */
export type PurchaseOutcome =
  | { status: 'purchased'; info: CustomerInfo }
  | { status: 'cancelled' }
  | { status: 'failed' }

/** Run a purchase. */
export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<PurchaseOutcome> {
  if (!isPurchasesEnabled()) return { status: 'failed' }
  try {
    const { customerInfo } = await rc().purchasePackage(pkg)
    return { status: 'purchased', info: customerInfo }
  } catch (err) {
    // RC throws with userCancelled=true when the user backs out — not an error.
    if ((err as { userCancelled?: boolean })?.userCancelled) return { status: 'cancelled' }
    console.warn('purchasePackage failed', err)
    return { status: 'failed' }
  }
}

/** Restore outcome: did we find an active entitlement, find nothing, or fail
 * to reach the store? "Restore" that silently does nothing is an App Review
 * red flag, so callers need to tell these apart. */
export type RestoreOutcome =
  | { status: 'found'; info: CustomerInfo }
  | { status: 'none' }
  | { status: 'failed' }

/** Restore prior purchases (App Store "Restore" button). */
export async function restorePurchases(): Promise<RestoreOutcome> {
  if (!isPurchasesEnabled()) return { status: 'failed' }
  try {
    const info = await rc().restorePurchases()
    const hasActive = Object.keys(info.entitlements.active).length > 0
    return hasActive ? { status: 'found', info } : { status: 'none' }
  } catch (err) {
    console.warn('restorePurchases failed', err)
    return { status: 'failed' }
  }
}

export async function currentCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isPurchasesEnabled()) return null
  try {
    return await rc().getCustomerInfo()
  } catch (err) {
    console.warn('getCustomerInfo failed', err)
    return null
  }
}

/** Subscribe to RC entitlement changes (purchase, renewal, restore). Returns
 * an unsubscribe fn. No-op when disabled. */
export function onCustomerInfoChange(cb: (info: CustomerInfo) => void): () => void {
  if (!isPurchasesEnabled()) return () => {}
  rc().addCustomerInfoUpdateListener(cb)
  return () => rc().removeCustomerInfoUpdateListener(cb)
}

/** Map RC CustomerInfo → effective Tier for instant UI. Max wins over Premium.
 *
 * Derives the tier from the ACTIVE SUBSCRIPTION PRODUCT (via tierForProduct),
 * not the entitlement identifier. A tiered RevenueCat dashboard commonly unlocks
 * a single shared entitlement (or one not literally named "max") for both the
 * Premium and Max products — so keying off `active['max']` mis-reads a Max
 * subscription (or its free trial) as Premium, which is exactly the bug this
 * fixes. The purchased product id is unambiguous. Falls back to tier-named
 * entitlement identifiers only if no product matches.
 *
 * (Top-up balance is NOT here — consumables aren't entitlements; it lives in
 * the Firestore entitlement doc written by the webhook.) */
export function tierFromCustomerInfo(info: CustomerInfo | null): Tier {
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
    consider((ent as { productIdentifier?: string }).productIdentifier)
  }
  // Also weigh raw active subscription product ids.
  for (const productId of info.activeSubscriptions ?? []) consider(productId)
  if (best !== 'free') return best
  // Last resort: entitlement identifiers literally named after the tier.
  const active = info.entitlements.active ?? {}
  if (active['max']) return 'max'
  if (active['premium']) return 'premium'
  return 'free'
}
