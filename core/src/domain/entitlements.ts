/**
 * Monetization model — tiers, per-tier limits, and the pure gate helpers
 * the UI and server use to enforce them.
 *
 * Three tiers (one App Store subscription group + consumable top-ups):
 *   - basic  — free. Core capture, one one-shot reminder per task, a small
 *              taste of Mochi AI. Acquisition funnel.
 *   - pro    — $2.99/mo · $19.99/yr. Full reminders + recurring + 250 AI
 *              requests/mo + top-ups.
 *   - elite  — $7.99/mo · $59.99/yr. 600 AI requests/mo + themes.
 *
 * This module is PURE (core has no platform deps): it owns the limits +
 * the gate functions. Enforcement splits by trust level —
 *   - Feature gates (reminders/recurring/themes): client-side, off the
 *     effective tier. They cost us nothing, so a bypass is low-stakes.
 *   - AI-request allowance: MUST be enforced server-side (it spends real
 *     Anthropic tokens). The Cloud Function mirrors TIER_LIMITS the same
 *     way agentTools.ts is mirrored — a parity test guards the copies.
 *
 * The tier itself comes from validated StoreKit receipts (or RevenueCat);
 * `effectiveTier` downgrades to basic once a subscription lapses.
 */

export type Tier = 'basic' | 'pro' | 'elite'

/** Ordered low → high so comparisons ("at least Pro") are index-based. */
export const TIER_ORDER: readonly Tier[] = ['basic', 'pro', 'elite'] as const

/** Reminder capability gate. basic gets a SINGLE one-shot reminder per
 * task; pro/elite unlock recurring reminders, before-due offsets, and
 * multiple reminders per task. */
export type ReminderCapability = 'oneShot' | 'full'

export interface TierLimits {
  /** Monthly Mochi-request (one message = one turn) allowance. */
  mochiMonthly: number
  /** Per-day sub-cap — anti-blowout so a single day can't burn the month. */
  mochiDaily: number
  reminders: ReminderCapability
  recurring: boolean
  /** Whether consumable AI top-up packs can be purchased + applied. */
  topUps: boolean
  themes: boolean
}

/**
 * The source of truth for what each tier gets. Allowances are sized so
 * that even a user who burns 100% of the quota on the deepest-discounted
 * annual plan still nets positive after Apple's cut (see pricing model):
 * at ~$0.005/request, pro maxes at ~$1.25 vs ~$1.42/mo net, elite at
 * ~$3.00 vs ~$4.25/mo net. AI cost can never exceed revenue.
 *
 * KEEP IN SYNC with the server mirror (web/functions/src/entitlements.ts).
 */
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

/**
 * App Store Connect product identifiers. Auto-renewable subs live in ONE
 * subscription group ("Sagely Membership") so up/downgrades are clean;
 * top-ups are consumables. Mirror these exactly in ASC.
 */
export const PRODUCT_IDS = {
  proMonthly: 'com.websurfer.mytodo.pro.monthly',
  proAnnual: 'com.websurfer.mytodo.pro.annual',
  eliteMonthly: 'com.websurfer.mytodo.elite.monthly',
  eliteAnnual: 'com.websurfer.mytodo.elite.annual',
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
  if (productId === PRODUCT_IDS.proMonthly || productId === PRODUCT_IDS.proAnnual) return 'pro'
  if (productId === PRODUCT_IDS.eliteMonthly || productId === PRODUCT_IDS.eliteAnnual) return 'elite'
  return null
}

/**
 * The user's current entitlement, persisted alongside profile + synced to
 * the server (which re-derives it from the receipt — never trust the
 * client for the AI allowance).
 */
export interface Entitlement {
  tier: Tier
  /** ISO datetime the paid tier is valid through; null for basic (free,
   * never expires). */
  validUntil: string | null
  /** Remaining consumable top-up requests (carry over month to month). */
  topUpBalance: number
}

export const FREE_ENTITLEMENT: Entitlement = {
  tier: 'basic',
  validUntil: null,
  topUpBalance: 0,
}

/** The effective tier right now: paid tiers fall back to basic once the
 * subscription has lapsed. `now` is passed in (core never reads the clock
 * itself) — yyyy-mm-ddThh:mm or any Date-parseable ISO string. */
export function effectiveTier(ent: Entitlement, now: string): Tier {
  if (ent.tier === 'basic') return 'basic'
  if (!ent.validUntil) return 'basic'
  return Date.parse(ent.validUntil) > Date.parse(now) ? ent.tier : 'basic'
}

export function tierAtLeast(tier: Tier, min: Tier): boolean {
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(min)
}

// ─── Feature gates (client-enforced; cost us nothing) ──────────────────

export function reminderCapability(tier: Tier): ReminderCapability {
  return TIER_LIMITS[tier].reminders
}

/** basic allows exactly ONE one-shot reminder per task; pro/elite are
 * unbounded. `existingCount` is how many reminders the task already has. */
export function canAddReminder(tier: Tier, existingCount: number): boolean {
  return TIER_LIMITS[tier].reminders === 'full' || existingCount < 1
}

/** Recurring reminders (offsets / intervals) are pro+. */
export function canUseRecurringReminder(tier: Tier): boolean {
  return TIER_LIMITS[tier].reminders === 'full'
}

/** Recurring TASKS are pro+. */
export function canUseRecurringTask(tier: Tier): boolean {
  return TIER_LIMITS[tier].recurring
}

export function canBuyTopUp(tier: Tier): boolean {
  return TIER_LIMITS[tier].topUps
}

export function canUseThemes(tier: Tier): boolean {
  return TIER_LIMITS[tier].themes
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

/** Whether the user may send one more Mochi request right now: under both
 * the monthly budget (incl. top-ups) AND the per-day sub-cap. This is the
 * predicate the server's reserve step checks before spending tokens. */
export function canSendMochiRequest(
  tier: Tier,
  usage: MochiUsage,
  topUpBalance: number,
): boolean {
  if (usage.dayUsed >= TIER_LIMITS[tier].mochiDaily) return false
  return mochiRemaining(tier, usage, topUpBalance) > 0
}
