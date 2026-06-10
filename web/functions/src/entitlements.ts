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
 */

export type Tier = 'free' | 'premium' | 'max'

export interface TierLimits {
  mochiMonthly: number
  mochiDaily: number
  topUps: boolean
  themes: boolean
  aiPlanning: boolean
}

/** KEEP IN SYNC with core/src/domain/entitlements.ts → TIER_LIMITS. */
export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    mochiMonthly: 90,
    mochiDaily: 3,
    topUps: false,
    themes: false,
    aiPlanning: false,
  },
  premium: {
    mochiMonthly: 250,
    mochiDaily: 30,
    topUps: true,
    themes: true,
    aiPlanning: false,
  },
  max: {
    mochiMonthly: 750,
    mochiDaily: 60,
    topUps: true,
    themes: true,
    aiPlanning: true,
  },
}

/** App Store product IDs — KEEP IN SYNC with core PRODUCT_IDS. */
export const PRODUCT_IDS = {
  premiumMonthly: 'com.websurfer.mytodo.premium.monthly',
  premiumAnnual: 'com.websurfer.mytodo.premium.annual',
  maxMonthly: 'com.websurfer.mytodo.max.monthly',
  maxAnnual: 'com.websurfer.mytodo.max.annual',
  topup150: 'com.websurfer.mytodo.topup.150',
  topup500: 'com.websurfer.mytodo.topup.500',
} as const

/** Mochi requests granted by each consumable top-up pack. */
export const TOPUP_GRANTS: Record<string, number> = {
  [PRODUCT_IDS.topup150]: 150,
  [PRODUCT_IDS.topup500]: 500,
}

export function tierForProduct(productId: string): Tier | null {
  if (productId === PRODUCT_IDS.premiumMonthly || productId === PRODUCT_IDS.premiumAnnual) {
    return 'premium'
  }
  if (productId === PRODUCT_IDS.maxMonthly || productId === PRODUCT_IDS.maxAnnual) return 'max'
  return null
}

/** Written per user at users/{uid}/state/entitlement by the RevenueCat
 * webhook; absent → free. */
export interface Entitlement {
  tier: Tier
  validUntil: string | null
  topUpBalance: number
}

export const FREE_ENTITLEMENT: Entitlement = {
  tier: 'free',
  validUntil: null,
  topUpBalance: 0,
}

/** Effective tier right now — a lapsed subscription falls back to free.
 * `nowMs` is the server clock in epoch ms. */
export function effectiveTier(ent: Entitlement, nowMs: number): Tier {
  if (ent.tier === 'free' || !ent.validUntil) return 'free'
  return Date.parse(ent.validUntil) > nowMs ? ent.tier : 'free'
}

/** Total monthly budget = tier allowance + any top-up balance. */
export function mochiMonthlyBudget(tier: Tier, topUpBalance: number): number {
  return TIER_LIMITS[tier].mochiMonthly + Math.max(0, topUpBalance)
}
