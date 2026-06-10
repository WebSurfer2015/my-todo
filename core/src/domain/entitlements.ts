/**
 * Monetization model — tiers, per-tier limits, and the pure gate helpers
 * the UI and server use to enforce them.
 *
 * AI-led pricing: the productivity basics (reminders incl. recurring /
 * before-due / multiple, and recurring tasks) are FREE on every tier — they
 * cost us nothing and are table stakes for a calm to-do app. The tiers gate
 * on what's actually differentiated and costly: Mochi AI allowance, plus a
 * few power/cosmetic extras.
 *
 *   - free    — all productivity features + a daily AI taste (3/day). The
 *               daily reset builds the habit and the gentle "hit the wall"
 *               upgrade moment.
 *   - premium — $2.99/mo · $19.99/yr. A generous monthly AI pool + top-ups
 *               + themes.
 *   - max     — $7.99/mo · $59.99/yr ("Mochi Max"). Abundant AI + AI
 *               superpowers (proactive weekly planning / review) + all
 *               customization.
 *
 * PURE (core has no platform deps): owns the limits + gate functions.
 * Enforcement splits by trust level —
 *   - Cosmetic/feature gates (themes, AI-planning): client-side; a bypass
 *     costs us nothing.
 *   - AI-request allowance: MUST be server-enforced (it spends Anthropic
 *     tokens). The Cloud Function mirrors TIER_LIMITS (parity test guards
 *     the copies). Tier comes from validated StoreKit receipts via the
 *     RevenueCat webhook; `effectiveTier` downgrades to free on lapse.
 */

export type Tier = 'free' | 'premium' | 'max'

/** Ordered low → high so "at least premium" is an index comparison. */
export const TIER_ORDER: readonly Tier[] = ['free', 'premium', 'max'] as const

export interface TierLimits {
  /** Monthly Mochi-request (one message = one turn) allowance. */
  mochiMonthly: number
  /** Per-day sub-cap. For free this is the binding constraint (the daily
   * taste); for paid it's anti-blowout. */
  mochiDaily: number
  /** Whether consumable AI top-up packs can be purchased + applied. */
  topUps: boolean
  /** Themes / icon customization — premium and up. */
  themes: boolean
  /** AI superpowers (proactive weekly planning, "review my week", bulk AI
   * edits) — max only. The headline reason Max exists. */
  aiPlanning: boolean
}

/**
 * Source of truth for what each tier gets. Allowances are sized so worst-
 * case AI spend stays below post-Apple revenue even on the deepest annual
 * discount (at ~$0.005/request): premium maxes at ~$1.25 vs ~$1.42/mo net,
 * max at ~$3.75 vs ~$4.25/mo net; free maxes at ~$0.45/mo (acquisition
 * cost). AI cost can never exceed revenue.
 *
 * KEEP IN SYNC with the server mirror (web/functions/src/entitlements.ts).
 */
export const TIER_LIMITS: Record<Tier, TierLimits> = {
  // Free's topUps:true lets it pay as you go beyond the 3/day taste —
  // top-ups bypass the daily + monthly caps (see canSendMochiRequest /
  // reserveMochiRequest).
  free: {
    mochiMonthly: 90,
    mochiDaily: 3,
    topUps: true,
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

/**
 * App Store Connect product identifiers. Auto-renewable subs live in ONE
 * subscription group ("Sagely Membership"); top-ups are consumables.
 */
export const PRODUCT_IDS = {
  premiumMonthly: 'com.websurfer.mytodo.premium.monthly',
  premiumAnnual: 'com.websurfer.mytodo.premium.annual',
  maxMonthly: 'com.websurfer.mytodo.max.monthly',
  maxAnnual: 'com.websurfer.mytodo.max.annual',
  topup150: 'com.websurfer.mytodo.topup.150',
  topup500: 'com.websurfer.mytodo.topup.500',
} as const

export type ProductId = (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS]

/** Mochi requests granted by each consumable top-up pack. */
export const TOPUP_GRANTS: Record<string, number> = {
  [PRODUCT_IDS.topup150]: 150,
  [PRODUCT_IDS.topup500]: 500,
}

/** Map a purchased subscription product to the tier it grants. */
export function tierForProduct(productId: string): Tier | null {
  if (productId === PRODUCT_IDS.premiumMonthly || productId === PRODUCT_IDS.premiumAnnual) {
    return 'premium'
  }
  if (productId === PRODUCT_IDS.maxMonthly || productId === PRODUCT_IDS.maxAnnual) return 'max'
  return null
}

/**
 * The user's current entitlement, written by the RevenueCat webhook and
 * read (never written) by the client.
 */
export interface Entitlement {
  tier: Tier
  /** ISO datetime the paid tier is valid through; null for free. */
  validUntil: string | null
  /** Remaining consumable top-up requests (carry month to month). */
  topUpBalance: number
}

export const FREE_ENTITLEMENT: Entitlement = {
  tier: 'free',
  validUntil: null,
  topUpBalance: 0,
}

/** The effective tier right now: paid tiers fall back to free once the
 * subscription has lapsed. `now` is passed in (core never reads the clock). */
export function effectiveTier(ent: Entitlement, now: string): Tier {
  if (ent.tier === 'free') return 'free'
  if (!ent.validUntil) return 'free'
  return Date.parse(ent.validUntil) > Date.parse(now) ? ent.tier : 'free'
}

export function tierAtLeast(tier: Tier, min: Tier): boolean {
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(min)
}

// ─── Feature gates (client-enforced; cost us nothing) ──────────────────
// Reminders + recurring tasks are intentionally NOT gated — they're free
// on every tier.

export function canUseThemes(tier: Tier): boolean {
  return TIER_LIMITS[tier].themes
}

/** Max-only AI superpowers. */
export function canUseAiPlanning(tier: Tier): boolean {
  return TIER_LIMITS[tier].aiPlanning
}

export function canBuyTopUp(tier: Tier): boolean {
  return TIER_LIMITS[tier].topUps
}

// ─── AI allowance accounting (model only; ENFORCE server-side) ─────────

/** Rolling usage the server tracks per user. */
export interface MochiUsage {
  /** Requests used in the current calendar month (yyyy-mm). */
  monthUsed: number
  /** Requests used so far today (yyyy-mm-dd). */
  dayUsed: number
}

/** Total monthly budget = the tier allowance plus any top-up balance. */
export function mochiMonthlyBudget(tier: Tier, topUpBalance: number): number {
  return TIER_LIMITS[tier].mochiMonthly + Math.max(0, topUpBalance)
}

/** Requests left this month (tier + top-ups), floored at 0. */
export function mochiRemaining(
  tier: Tier,
  usage: MochiUsage,
  topUpBalance: number,
): number {
  return Math.max(0, mochiMonthlyBudget(tier, topUpBalance) - usage.monthUsed)
}

/** Whether the user may send one more Mochi request right now. The tier
 * allowance is gated by BOTH the daily sub-cap and the monthly cap; once
 * the base allowance is unavailable (either cap hit), a purchased top-up
 * balance lets the user keep going (pay as you go) with no cap. */
export function canSendMochiRequest(
  tier: Tier,
  usage: MochiUsage,
  topUpBalance: number,
): boolean {
  const baseAvailable =
    usage.dayUsed < TIER_LIMITS[tier].mochiDaily &&
    usage.monthUsed < TIER_LIMITS[tier].mochiMonthly
  return baseAvailable || topUpBalance > 0
}
