/**
 * Pure decision logic for ONE Mochi-request reservation — extracted from
 * reserveMochiRequest (quota.ts) so the money-critical accounting can be
 * unit-tested without Firestore.
 *
 * Rules (de-metered model, docs/MOCHI-MONETIZATION-MODEL.md):
 *  - The tier allowance is an INVISIBLE fair-use ceiling, gated by BOTH the
 *    daily sub-cap and the monthly cap. Free is gated per-day; Premium sets
 *    mochiDaily == mochiMonthly so the daily cap never binds first.
 *  - Day/month counters reset when the stored date/month no longer match
 *    "now" (rollover).
 *  - Over the ceiling → allow:false; the server throws RESOURCE_EXHAUSTED and
 *    the client takes the graceful local fallback. No top-ups, no meter.
 */

import { TIER_LIMITS, type Tier } from './entitlements'

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
  /** New usage doc to persist when the request is allowed; null when blocked. */
  nextUsage: MochiUsageDoc | null
}

/** Decide whether one Mochi request may proceed and what state to write.
 * `today`/`month` are the server clock as YYYY-MM-DD / YYYY-MM. */
export function decideMochiReservation(
  tier: Tier,
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
    }
  }

  // Over the invisible fair-use ceiling: the server does NOT wall the user —
  // it returns allow:false so the client falls back to local capture (no
  // top-ups, no meter). `reason` distinguishes the daily vs monthly ceiling.
  const dailyHit = dayCalls >= limits.mochiDaily && monthCalls < limits.mochiMonthly
  return {
    allow: false,
    reason: dailyHit ? 'daily' : 'monthly',
    nextUsage: null,
  }
}
