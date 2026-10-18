/**
 * Monetization model — tiers, per-tier limits, and the pure gate helpers
 * the UI and server use to enforce them.
 *
 * De-metered model (see docs/MOCHI-MONETIZATION-MODEL.md): the productivity
 * basics (reminders incl. recurring / before-due / multiple, recurring tasks)
 * are FREE on every tier. Mochi the *companion* is free + unlimited (it's
 * local). Only Mochi's AI *heavy-lifting* is gated — by CAPABILITY, not a
 * visible counter:
 *
 *   - free    — Mochi helps with one thing at a time (capture, break down a
 *               task). Backed by an INVISIBLE fair-use ceiling (below) with
 *               graceful local fallback — never a wall, never a meter.
 *   - premium — $4.99/mo · $29.99/yr. The "zoom-out": plan-my-week, bulk
 *               triage, proactive review (aiPlanning), plus all themes.
 *               Effectively unlimited everyday AI (high invisible ceiling).
 *
 * No top-ups, no usage meter, no "Max" tier (all removed in the de-meter).
 * The allowance NUMBERS below are the invisible fair-use ceilings — tune them
 * against real usage once analytics exist; do not surface them to users.
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

export type Tier = 'free' | 'premium'

/** Ordered low → high so "at least premium" is an index comparison. */
export const TIER_ORDER: readonly Tier[] = ['free', 'premium'] as const

export interface TierLimits {
  /** Monthly Mochi-request allowance — the INVISIBLE fair-use ceiling (one
   * message = one turn). Not shown to users; backs graceful fallback. */
  mochiMonthly: number
  /** Per-day sub-cap. For free this is the binding fair-use constraint; for
   * premium it equals the monthly ceiling (no daily sub-cap). */
  mochiDaily: number
  /** Themes / icon customization. */
  themes: boolean
  /** AI superpowers (proactive weekly planning, "review my week", bulk AI
   * edits) — the Premium "zoom-out". */
  aiPlanning: boolean
}

/**
 * Source of truth for what each tier gets. The allowances are INVISIBLE
 * fair-use ceilings sized so AI cost stays well under post-Apple revenue —
 * local-first warmth (docs/REPOSITIONING-SPEC.md §5) keeps ~90% of Mochi off
 * the model entirely, so only genuine capture/breakdown counts here. Premium's
 * ceiling is set high enough to read as "unlimited" for any real human and
 * exists only as an anti-abuse backstop. Tune with analytics; never surface.
 *
 * KEEP IN SYNC with the server mirror (web/functions/src/entitlements.ts).
 */
export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    mochiMonthly: 90,
    mochiDaily: 3,
    // Themes are free for everyone — every color theme is available on every
    // tier (no paywall gate on the theme picker).
    themes: true,
    aiPlanning: false,
  },
  premium: {
    // Daily == monthly so the daily sub-cap never binds before the monthly
    // ceiling; the monthly ceiling is the invisible anti-abuse backstop.
    mochiMonthly: 250,
    mochiDaily: 250,
    themes: true,
    aiPlanning: true,
  },
}

/**
 * App Store Connect product identifiers. Auto-renewable subs live in ONE
 * subscription group ("Sagely Membership"). (Top-up consumables and the Max
 * products were removed in the de-meter.)
 */
export const PRODUCT_IDS = {
  premiumMonthly: 'com.websurfer.mytodo.premium.monthly',
  premiumAnnual: 'com.websurfer.mytodo.premium.annual',
} as const

export type ProductId = (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS]

/** Map a purchased subscription product to the tier it grants. */
export function tierForProduct(productId: string): Tier | null {
  if (productId === PRODUCT_IDS.premiumMonthly || productId === PRODUCT_IDS.premiumAnnual) {
    return 'premium'
  }
  return null
}

export type BillingPeriod = 'monthly' | 'annual'

/** The billing period of a subscription product, or null if it isn't one. */
export function billingForProduct(productId: string): BillingPeriod | null {
  if (productId === PRODUCT_IDS.premiumMonthly) return 'monthly'
  if (productId === PRODUCT_IDS.premiumAnnual) return 'annual'
  return null
}

/**
 * Ordering rank for subscription products, so the paywall can offer ONLY
 * upgrades. Higher = better. Free / non-subscription = -1.
 *
 * With a single paid tier the matrix is just:
 *   premium-monthly(0) → premium-annual(1)
 * A target is purchasable from a current plan iff its rank is strictly higher.
 */
export function productRank(productId: string | null): number {
  const billing = productId ? billingForProduct(productId) : null
  if (!billing) return -1
  return billing === 'annual' ? 1 : 0
}

/** Whether buying `to` while subscribed to `from` is a strict upgrade. A free
 * user (`from` null) can buy any paid product. */
export function isUpgrade(fromProductId: string | null, toProductId: string): boolean {
  return productRank(toProductId) > productRank(fromProductId)
}

/**
 * The user's current entitlement, written by the RevenueCat webhook and
 * read (never written) by the client.
 */
export interface Entitlement {
  tier: Tier
  /** ISO datetime the paid tier is valid through; null for free. */
  validUntil: string | null
}

export const FREE_ENTITLEMENT: Entitlement = {
  tier: 'free',
  validUntil: null,
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

// NOTE: theme access is NOT actually gated through this helper. The live gate
// is per-theme on the mobile side — `FREE_THEMES` in mobile/src/app/theme.ts
// limits Free to Sage + Sky while Premium unlocks all six. This boolean
// (themes:true for every tier) is legacy/unused; don't wire new theme gating
// through it without first reconciling it with FREE_THEMES.
export function canUseThemes(tier: Tier): boolean {
  return TIER_LIMITS[tier].themes
}

/** Premium "zoom-out" AI superpowers (plan-my-week, bulk triage, review). */
export function canUseAiPlanning(tier: Tier): boolean {
  return TIER_LIMITS[tier].aiPlanning
}

// AI allowance accounting is SERVER-ONLY (web/functions/src/quota.ts +
// mochiReservation.ts). The client has no copy: a duplicate counter drifted
// (stale across UTC midnight) and the server's RESOURCE_EXHAUSTED already takes
// the graceful fallback.
