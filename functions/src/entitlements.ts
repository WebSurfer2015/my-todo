/**
 * SERVER mirror of the tier model in core/src/domain/entitlements.ts.
 *
 * The functions package can't import core/ (separate tsconfig, deployed
 * standalone — same reason agentTools.ts is duplicated), so TIER_LIMITS is
 * copied here. A parity test (mobile/src/__tests__/entitlements-parity.test.ts)
 * asserts the limits match so the copies can't drift.
 *
 * The server is the source of truth for the AI-request ALLOWANCE — it spends
 * real Anthropic tokens, so it never trusts a client-reported tier or usage.
 * Reminders + recurring are free on every tier and aren't represented here.
 * De-metered model: no top-ups, no "Max" tier; the allowances are invisible
 * fair-use ceilings (see core for the rationale).
 */

export type Tier = 'free' | 'premium'

export interface TierLimits {
  /** Mochi CONVERSATIONS per UTC month (follow-up turns don't count). */
  mochiMonthly: number
  /** Mochi CONVERSATIONS per UTC day (follow-up turns don't count). */
  mochiDaily: number
  themes: boolean
}

/** KEEP IN SYNC with core/src/domain/entitlements.ts → TIER_LIMITS. */
export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    mochiMonthly: 300,
    mochiDaily: 15,
    // Themes are free for everyone — every color theme is available on every
    // tier (no paywall gate on the theme picker). Mirrors core.
    themes: true,
  },
  premium: {
    mochiMonthly: 1000,
    mochiDaily: 1000,
    themes: true,
  },
}

/** App Store product IDs — KEEP IN SYNC with core PRODUCT_IDS. */
export const PRODUCT_IDS = {
  premiumMonthly: 'com.websurfer.mytodo.premium.monthly',
  premiumAnnual: 'com.websurfer.mytodo.premium.annual',
} as const

export function tierForProduct(productId: string): Tier | null {
  if (productId === PRODUCT_IDS.premiumMonthly || productId === PRODUCT_IDS.premiumAnnual) {
    return 'premium'
  }
  return null
}

/** Written per user at users/{uid}/state/entitlement by the RevenueCat
 * webhook; absent → free. */
export interface Entitlement {
  tier: Tier
  validUntil: string | null
}

export const FREE_ENTITLEMENT: Entitlement = {
  tier: 'free',
  validUntil: null,
}

/** Effective tier right now — a lapsed subscription falls back to free.
 * `nowMs` is the server clock in epoch ms. */
export function effectiveTier(ent: Entitlement, nowMs: number): Tier {
  if (ent.tier === 'free' || !ent.validUntil) return 'free'
  return Date.parse(ent.validUntil) > nowMs ? ent.tier : 'free'
}
