/**
 * Pure decision logic for ONE Mochi-request reservation — extracted from
 * reserveMochiRequest (quota.ts) so the money-critical accounting can be
 * unit-tested without Firestore.
 *
 * Rules (must match the paywall offerings):
 *  - The tier ALLOWANCE is gated by BOTH the daily sub-cap and the monthly
 *    cap. Free is gated per-day (3/day); paid tiers set mochiDaily ==
 *    mochiMonthly so the daily cap never binds first ("no daily limit").
 *  - Day/month counters reset when the stored date/month no longer match
 *    "now" (rollover).
 *  - Once the base allowance is unavailable (either cap hit), a purchased
 *    top-up balance lets the user keep going with NO cap — pay as you go.
 *    Top-up draws decrement the balance and do NOT touch the day/month
 *    counters.
 */

import { TIER_LIMITS, type Entitlement, type Tier } from './entitlements'

export interface MochiUsageDoc {
  /** UTC month, YYYY-MM. */
  month: string
  monthCalls: number
  /** UTC day, YYYY-MM-DD. */
  date: string
  dayCalls: number
}

export interface ReservationDecision {
  allow: boolean
  /** Why a request was blocked (only meaningful when allow=false). */
  reason: 'ok' | 'daily' | 'monthly'
  /** New usage doc to persist when drawing from the base allowance; null
   * when not writing usage (top-up draw or block). */
  nextUsage: MochiUsageDoc | null
  /** New entitlement to persist when drawing from a top-up (balance −1);
   * null otherwise. */
  nextEntitlement: Entitlement | null
}

/** Decide whether one Mochi request may proceed and what state to write.
 * `today`/`month` are the server clock as YYYY-MM-DD / YYYY-MM. */
export function decideMochiReservation(
  tier: Tier,
  ent: Entitlement,
  usage: MochiUsageDoc | null,
  today: string,
  month: string,
): ReservationDecision {
  const limits = TIER_LIMITS[tier]
  const dayCalls = usage && usage.date === today ? usage.dayCalls : 0
  const monthCalls = usage && usage.month === month ? usage.monthCalls : 0

  const baseAvailable = dayCalls < limits.mochiDaily && monthCalls < limits.mochiMonthly
  if (baseAvailable) {
    return {
      allow: true,
      reason: 'ok',
      nextUsage: { month, monthCalls: monthCalls + 1, date: today, dayCalls: dayCalls + 1 },
      nextEntitlement: null,
    }
  }

  if (ent.topUpBalance > 0) {
    return {
      allow: true,
      reason: 'ok',
      nextUsage: null,
      nextEntitlement: { ...ent, topUpBalance: ent.topUpBalance - 1 },
    }
  }

  const dailyHit = dayCalls >= limits.mochiDaily && monthCalls < limits.mochiMonthly
  return {
    allow: false,
    reason: dailyHit ? 'daily' : 'monthly',
    nextUsage: null,
    nextEntitlement: null,
  }
}
