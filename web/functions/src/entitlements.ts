/**
 * SERVER mirror of the tier model in core/src/domain/entitlements.ts.
 *
 * The functions package can't import core/ (separate tsconfig, deployed
 * standalone — same reason agentTools.ts is duplicated), so TIER_LIMITS is
 * copied here. A parity test (mobile/src/__tests__/entitlements-parity.test.ts)
 * reads both files and asserts the limits match, so the copies can't drift.
 *
 * The server is the source of truth for the AI-request ALLOWANCE — it
 * spends real Anthropic tokens, so it can never trust a client-reported
 * tier or usage count. Feature gates (reminders/recurring/themes) are
 * client-only and not duplicated here.
 */

export type Tier = 'basic' | 'pro' | 'elite'

export interface TierLimits {
  mochiMonthly: number
  mochiDaily: number
  reminders: 'oneShot' | 'full'
  recurring: boolean
  topUps: boolean
  themes: boolean
}

/** KEEP IN SYNC with core/src/domain/entitlements.ts → TIER_LIMITS. */
export const TIER_LIMITS: Record<Tier, TierLimits> = {
  basic: {
    mochiMonthly: 25,
    mochiDaily: 3,
    reminders: 'oneShot',
    recurring: false,
    topUps: false,
    themes: false,
  },
  pro: {
    mochiMonthly: 250,
    mochiDaily: 30,
    reminders: 'full',
    recurring: true,
    topUps: true,
    themes: false,
  },
  elite: {
    mochiMonthly: 600,
    mochiDaily: 60,
    reminders: 'full',
    recurring: true,
    topUps: true,
    themes: true,
  },
}

/** App Store product IDs — KEEP IN SYNC with core PRODUCT_IDS. */
export const PRODUCT_IDS = {
  proMonthly: 'com.websurfer.mytodo.pro.monthly',
  proAnnual: 'com.websurfer.mytodo.pro.annual',
  eliteMonthly: 'com.websurfer.mytodo.elite.monthly',
  eliteAnnual: 'com.websurfer.mytodo.elite.annual',
  topup150: 'com.websurfer.mytodo.topup.150',
  topup500: 'com.websurfer.mytodo.topup.500',
} as const

/** Mochi requests granted by each consumable top-up pack. */
export const TOPUP_GRANTS: Record<string, number> = {
  [PRODUCT_IDS.topup150]: 150,
  [PRODUCT_IDS.topup500]: 500,
}

/** Map a purchased subscription product to the tier it grants (null for
 * consumables / unknown ids). */
export function tierForProduct(productId: string): Tier | null {
  if (productId === PRODUCT_IDS.proMonthly || productId === PRODUCT_IDS.proAnnual) return 'pro'
  if (productId === PRODUCT_IDS.eliteMonthly || productId === PRODUCT_IDS.eliteAnnual) return 'elite'
  return null
}

/** What we persist per user at users/{uid}/state/entitlement (written by
 * the RevenueCat webhook; absent → free/basic). */
export interface Entitlement {
  tier: Tier
  /** ISO datetime the paid tier is valid through; null = basic. */
  validUntil: string | null
  /** Remaining consumable top-up requests (carry across months). */
  topUpBalance: number
}

export const FREE_ENTITLEMENT: Entitlement = {
  tier: 'basic',
  validUntil: null,
  topUpBalance: 0,
}

/** Effective tier right now — a lapsed subscription falls back to basic.
 * `nowMs` is the server clock in epoch ms. */
export function effectiveTier(ent: Entitlement, nowMs: number): Tier {
  if (ent.tier === 'basic' || !ent.validUntil) return 'basic'
  return Date.parse(ent.validUntil) > nowMs ? ent.tier : 'basic'
}

/** Total monthly budget = tier allowance + any top-up balance. */
export function mochiMonthlyBudget(tier: Tier, topUpBalance: number): number {
  return TIER_LIMITS[tier].mochiMonthly + Math.max(0, topUpBalance)
}
