/**
 * Shared per-uid daily call quota for Sagely's AI endpoints. Both the
 * conversational agentChat and the ambient aiInfer reserve a slot
 * through reserveDailyCall — one counter, one cap, so a user can't
 * burn through the day on one endpoint and starve the other.
 *
 * Implementation: read-modify-write transaction against
 * users/{uid}/state/agentUsage, using the same versioned envelope
 * (`{value: <json string>, updatedAt}`) the rest of the app uses.
 * Admin SDK bypasses firestore.rules so clients can't reset the
 * counter; rules deliberately deny writes to agentUsage.
 */

import { HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import {
  TIER_LIMITS,
  FREE_ENTITLEMENT,
  effectiveTier,
  mochiMonthlyBudget,
  type Entitlement,
  type Tier,
} from './entitlements'

// Per-user daily ceiling, shared across every AI endpoint. Sized to
// cover an active user's normal day (~20–30 calls between ambient
// suggestions, breakdowns, and Mochi turns) with headroom, while
// bounding blast radius if an account is compromised.
export const DAILY_CALL_LIMIT = 30

interface AgentUsageData {
  date: string
  calls: number
}

if (admin.apps.length === 0) admin.initializeApp()
const adminDb = admin.firestore()

/**
 * Decode the serialized `{version,data}` envelope stored at
 * users/{uid}/state/agentUsage. Returns null on any parse failure so
 * callers can degrade gracefully (they treat null as "first call
 * today"). Matches the shape produced by core's writeVersioned.
 */
function parseAgentUsage(raw: unknown): AgentUsageData | null {
  if (!raw || typeof raw !== 'object') return null
  const val = (raw as { value?: unknown }).value
  if (typeof val !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(val)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const data = (parsed as { data?: unknown }).data
  if (!data || typeof data !== 'object') return null
  const { date, calls } = data as { date?: unknown; calls?: unknown }
  if (typeof date !== 'string' || typeof calls !== 'number' || !Number.isFinite(calls)) {
    return null
  }
  return { date, calls: Math.max(0, Math.floor(calls)) }
}

/**
 * Server-side daily-call reservation: caps per uid per UTC day. We use
 * server UTC instead of any client-supplied date because the client
 * could otherwise rotate that value to grant itself fresh quota.
 * Throws HttpsError('resource-exhausted') when the cap is hit.
 *
 * `label` is folded into the error message so the user sees which
 * endpoint hit the cap — useful UX when ambient calls compete with
 * conversational ones under one quota.
 */
export async function reserveDailyCall(uid: string, label = 'AI'): Promise<void> {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC
  const ref = adminDb.doc(`users/${uid}/state/agentUsage`)
  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const usage = snap.exists ? parseAgentUsage(snap.data()) : null
      const callsToday = usage && usage.date === today ? usage.calls : 0
      if (callsToday >= DAILY_CALL_LIMIT) {
        throw new HttpsError(
          'resource-exhausted',
          `Daily ${label} limit reached (${DAILY_CALL_LIMIT} per day). It resets after midnight UTC.`,
        )
      }
      const next: AgentUsageData = { date: today, calls: callsToday + 1 }
      tx.set(ref, {
        value: JSON.stringify({ version: 1, data: next }),
        updatedAt: Date.now(),
      })
    })
  } catch (err) {
    if (err instanceof HttpsError) throw err
    // Fail-closed on transaction errors. A noisy Firestore outage
    // briefly disables AI for everyone — better than silently letting
    // the cap leak.
    console.error('reserveDailyCall failed', err)
    throw new HttpsError('internal', "Couldn't reach the quota check.")
  }
}

// ─── Tier-aware Mochi allowance ────────────────────────────────────────
//
// Used by agentChat when MOCHI_TIER_ENFORCEMENT is on (see index.ts).
// Enforces the per-tier monthly allowance (+ purchased top-ups) AND a
// per-day sub-cap, reading the user's validated entitlement from
// Firestore. Until the purchase flow (Phase 2) writes an entitlement, all
// users resolve to basic — which is why enforcement ships behind a flag,
// off until monetization launches.

interface MochiUsageData {
  /** UTC month, YYYY-MM. */
  month: string
  monthCalls: number
  /** UTC day, YYYY-MM-DD. */
  date: string
  dayCalls: number
}

/** Decode the `{version,data}` envelope at users/{uid}/state/entitlement.
 * Any parse failure → free/basic (fail toward the cheapest tier). */
function parseEntitlement(raw: unknown): Entitlement {
  if (!raw || typeof raw !== 'object') return FREE_ENTITLEMENT
  const val = (raw as { value?: unknown }).value
  if (typeof val !== 'string') return FREE_ENTITLEMENT
  let parsed: unknown
  try {
    parsed = JSON.parse(val)
  } catch {
    return FREE_ENTITLEMENT
  }
  const data = (parsed as { data?: unknown })?.data
  if (!data || typeof data !== 'object') return FREE_ENTITLEMENT
  const { tier, validUntil, topUpBalance } = data as {
    tier?: unknown
    validUntil?: unknown
    topUpBalance?: unknown
  }
  const safeTier: Tier =
    tier === 'premium' || tier === 'max' || tier === 'free' ? tier : 'free'
  return {
    tier: safeTier,
    validUntil: typeof validUntil === 'string' ? validUntil : null,
    topUpBalance:
      typeof topUpBalance === 'number' && Number.isFinite(topUpBalance)
        ? Math.max(0, Math.floor(topUpBalance))
        : 0,
  }
}

function parseMochiUsage(raw: unknown): MochiUsageData | null {
  if (!raw || typeof raw !== 'object') return null
  const val = (raw as { value?: unknown }).value
  if (typeof val !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(val)
  } catch {
    return null
  }
  const data = (parsed as { data?: unknown })?.data
  if (!data || typeof data !== 'object') return null
  const { month, monthCalls, date, dayCalls } = data as Record<string, unknown>
  if (
    typeof month !== 'string' ||
    typeof date !== 'string' ||
    typeof monthCalls !== 'number' ||
    typeof dayCalls !== 'number'
  ) {
    return null
  }
  return {
    month,
    monthCalls: Math.max(0, Math.floor(monthCalls)),
    date,
    dayCalls: Math.max(0, Math.floor(dayCalls)),
  }
}

/**
 * Tier-aware reservation for ONE Mochi request. Throws
 * HttpsError('resource-exhausted') when the daily sub-cap or the monthly
 * budget (allowance + top-ups) is hit. Consumes a top-up only once the
 * base monthly allowance is spent. Two-doc transaction (usage +
 * entitlement) so the top-up decrement is atomic with the usage bump.
 */
export async function reserveMochiRequest(uid: string): Promise<void> {
  const now = new Date()
  const today = now.toISOString().slice(0, 10) // YYYY-MM-DD UTC
  const month = today.slice(0, 7) // YYYY-MM UTC
  const usageRef = adminDb.doc(`users/${uid}/state/mochiUsage`)
  const entRef = adminDb.doc(`users/${uid}/state/entitlement`)
  try {
    await adminDb.runTransaction(async (tx) => {
      const [usageSnap, entSnap] = await Promise.all([tx.get(usageRef), tx.get(entRef)])
      const ent = parseEntitlement(entSnap.exists ? entSnap.data() : null)
      const tier = effectiveTier(ent, now.getTime())
      const limits = TIER_LIMITS[tier]

      const usage = usageSnap.exists ? parseMochiUsage(usageSnap.data()) : null
      const dayCalls = usage && usage.date === today ? usage.dayCalls : 0
      const monthCalls = usage && usage.month === month ? usage.monthCalls : 0

      if (dayCalls >= limits.mochiDaily) {
        throw new HttpsError(
          'resource-exhausted',
          tier === 'free'
            ? `That's your ${limits.mochiDaily} free Mochi requests for today. They reset tomorrow, or upgrade for more.`
            : `Daily Mochi limit reached (${limits.mochiDaily}/day). It resets after midnight UTC.`,
        )
      }
      const budget = mochiMonthlyBudget(tier, ent.topUpBalance)
      if (monthCalls >= budget) {
        throw new HttpsError(
          'resource-exhausted',
          tier === 'free'
            ? `You've used your free Mochi requests this month. Upgrade for more.`
            : `Monthly Mochi allowance reached. Add a top-up or wait for next month.`,
        )
      }

      // Drawing from a purchased top-up once the base allowance is spent.
      const usingTopUp = monthCalls >= limits.mochiMonthly
      const next: MochiUsageData = {
        month,
        monthCalls: monthCalls + 1,
        date: today,
        dayCalls: dayCalls + 1,
      }
      tx.set(usageRef, {
        value: JSON.stringify({ version: 1, data: next }),
        updatedAt: now.getTime(),
      })
      if (usingTopUp) {
        const nextEnt: Entitlement = {
          ...ent,
          topUpBalance: Math.max(0, ent.topUpBalance - 1),
        }
        tx.set(entRef, {
          value: JSON.stringify({ version: 1, data: nextEnt }),
          updatedAt: now.getTime(),
        })
      }
    })
  } catch (err) {
    if (err instanceof HttpsError) throw err
    console.error('reserveMochiRequest failed', err)
    throw new HttpsError('internal', "Couldn't reach the quota check.")
  }
}
