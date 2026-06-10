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
 * call is an inert no-op and tier stays 'basic', so the app runs unchanged
 * until you wire RevenueCat + rebuild the dev client. RC entitlement
 * identifiers expected in the dashboard: "pro" and "elite".
 */

import Constants from 'expo-constants'
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases'
import type { Tier } from '../core-bindings/entitlements'

const API_KEY: string =
  (Constants.expoConfig?.extra as { revenueCatIosKey?: string } | undefined)
    ?.revenueCatIosKey ?? ''

export function isPurchasesEnabled(): boolean {
  return API_KEY.length > 0
}

let configured = false

/** Configure RC once + identify the user. Safe to call repeatedly. No-op
 * when no API key is set. */
export async function configurePurchases(uid: string): Promise<void> {
  if (!isPurchasesEnabled()) return
  try {
    if (!configured) {
      Purchases.configure({ apiKey: API_KEY, appUserID: uid })
      configured = true
    } else {
      await Purchases.logIn(uid)
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
    const offerings = await Purchases.getOfferings()
    return offerings.current ?? null
  } catch (err) {
    console.warn('fetchCurrentOffering failed', err)
    return null
  }
}

/** Run a purchase. Returns the resulting CustomerInfo, or null if the user
 * cancelled / it failed. */
export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<CustomerInfo | null> {
  if (!isPurchasesEnabled()) return null
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg)
    return customerInfo
  } catch (err) {
    // RC throws with userCancelled=true when the user backs out — not an error.
    if ((err as { userCancelled?: boolean })?.userCancelled) return null
    console.warn('purchasePackage failed', err)
    return null
  }
}

/** Restore prior purchases (App Store "Restore" button). */
export async function restorePurchases(): Promise<CustomerInfo | null> {
  if (!isPurchasesEnabled()) return null
  try {
    return await Purchases.restorePurchases()
  } catch (err) {
    console.warn('restorePurchases failed', err)
    return null
  }
}

export async function currentCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isPurchasesEnabled()) return null
  try {
    return await Purchases.getCustomerInfo()
  } catch (err) {
    console.warn('getCustomerInfo failed', err)
    return null
  }
}

/** Subscribe to RC entitlement changes (purchase, renewal, restore). Returns
 * an unsubscribe fn. No-op when disabled. */
export function onCustomerInfoChange(cb: (info: CustomerInfo) => void): () => void {
  if (!isPurchasesEnabled()) return () => {}
  Purchases.addCustomerInfoUpdateListener(cb)
  return () => Purchases.removeCustomerInfoUpdateListener(cb)
}

/** Map RC CustomerInfo → effective Tier for instant UI. Elite wins over Pro.
 * (Top-up balance is NOT here — consumables aren't entitlements; it lives in
 * the Firestore entitlement doc written by the webhook.) */
export function tierFromCustomerInfo(info: CustomerInfo | null): Tier {
  const active = info?.entitlements.active ?? {}
  if (active['elite']) return 'elite'
  if (active['pro']) return 'pro'
  return 'basic'
}
