/**
 * Shared per-uid daily call quota for Sagely's AI endpoints. aiInfer reserves
 * one slot per call (reserveDailyCall); agentChat reserves one slot per
 * CONVERSATION (reserveChatTurn — follow-up turns are free, bounded by a
 * per-day turn backstop). One counter, one cap, so a user can't burn through
 * the day on one endpoint and starve the other.
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
  FREE_ENTITLEMENT,
  effectiveTier,
  type Entitlement,
  type Tier,
} from './entitlements'
import {
  decideChatTurnFlat,
  decideChatTurnTier,
  decideFlatCall,
  parseAgentUsage,
  type AgentUsageData,
  type ChatTurnDecision,
} from './chatQuota'
import { isCompName } from './compUsers'

// Per-user daily ceiling, shared across every AI endpoint (ambient
// suggestions, breakdowns, and Mochi conversations). Raised 30 → 150 to give active
// development/testing comfortable headroom while pre-monetization
// (MOCHI_TIER_ENFORCEMENT off). Revisit at monetization launch — the per-tier
// TIER_LIMITS become the real gate then and this flat ceiling reverts to a
// blast-radius safety bound.
export const DAILY_CALL_LIMIT = 150

if (admin.apps.length === 0) admin.initializeApp()
const adminDb = admin.firestore()

/** De-metered copy (no counts, no countdown) — clients normally replace this
 * with a local fallback (P1.7). Same text on every endpoint and path. */
const RESTING_MESSAGE = `Mochi's resting for now — you can still add this yourself.`

function writeAgentUsage(
  tx: FirebaseFirestore.Transaction,
  ref: FirebaseFirestore.DocumentReference,
  next: AgentUsageData,
): void {
  tx.set(ref, {
    value: JSON.stringify({ version: 1, data: next }),
    updatedAt: Date.now(),
  })
}

/**
 * Server-side daily-call reservation for ONE-SHOT AI calls (aiInfer): caps
 * per uid per UTC day, one slot per call. We use server UTC instead of any
 * client-supplied date because the client could otherwise rotate that value
 * to grant itself fresh quota. Throws HttpsError('resource-exhausted') when
 * the cap is hit. Mochi stats on the same doc are preserved.
 *
 * `label` names the endpoint in server logs only; the user-facing
 * message is the same de-metered copy everywhere (P1.7).
 */
export async function reserveDailyCall(uid: string, label = 'AI'): Promise<void> {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC
  const ref = adminDb.doc(`users/${uid}/state/agentUsage`)
  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const usage = snap.exists ? parseAgentUsage(snap.data()) : null
      const d = decideFlatCall(usage, today, DAILY_CALL_LIMIT)
      if (!d.allow) {
        console.info(`reserveDailyCall: ${label} fair-use ceiling hit`)
        throw new HttpsError('resource-exhausted', RESTING_MESSAGE)
      }
      writeAgentUsage(tx, ref, d.next)
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
// Enforces the per-tier invisible fair-use ceiling (monthly + daily sub-cap),
// reading the user's validated entitlement from Firestore. Until the purchase
// flow writes an entitlement, everyone resolves to free — which is why
// enforcement ships behind a flag, off until IAP is live (roadmap 5.6).

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
  const { tier, validUntil } = data as {
    tier?: unknown
    validUntil?: unknown
  }
  const safeTier: Tier = tier === 'premium' || tier === 'free' ? tier : 'free'
  return {
    tier: safeTier,
    validUntil: typeof validUntil === 'string' ? validUntil : null,
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

// ─── Comp allowlist (full AI, no payment) ──────────────────────────
//
// A small set of people (family) skip the tier allowance without paying (still
// under the flat fair-use cap) — see compUsers.ts for the list + the soft-comp
// caveat (names are editable).

/** Extract first/last name from a profile envelope (same {value:<json>}
 * shape as the other state docs). Empty strings on any parse failure. */
function parseProfileName(raw: unknown): { firstName: string; lastName: string } {
  const empty = { firstName: '', lastName: '' }
  if (!raw || typeof raw !== 'object') return empty
  const val = (raw as { value?: unknown }).value
  if (typeof val !== 'string') return empty
  try {
    const data = (JSON.parse(val) as { data?: unknown })?.data as
      | { firstName?: unknown; lastName?: unknown }
      | undefined
    return {
      firstName: typeof data?.firstName === 'string' ? data.firstName : '',
      lastName: typeof data?.lastName === 'string' ? data.lastName : '',
    }
  } catch {
    return empty
  }
}

/** True when the signed-in user is on the comp allowlist (reads their
 * profile name). Fails closed (false) on any read/parse error. */
async function isCompUser(uid: string): Promise<boolean> {
  try {
    const snap = await adminDb.doc(`users/${uid}/state/profile`).get()
    if (!snap.exists) return false
    const { firstName, lastName } = parseProfileName(snap.data())
    return isCompName(firstName, lastName)
  } catch (err) {
    console.error('isCompUser read failed', err)
    return false
  }
}

/**
 * Run one agentChat reservation transaction. `decide` is the pure decision
 * (chatQuota.ts); this wrapper persists its writes and, on a reject, throws
 * RESOURCE_EXHAUSTED AFTER the transaction commits — throwing inside would
 * roll back the ceilingHit marker the metrics roll-up counts.
 */
async function runChatReservation(
  uid: string,
  label: string,
  decide: (
    tx: FirebaseFirestore.Transaction,
    agentUsage: AgentUsageData | null,
  ) => Promise<ChatTurnDecision>,
  extraWrite?: (tx: FirebaseFirestore.Transaction, d: ChatTurnDecision) => void,
): Promise<void> {
  const ref = adminDb.doc(`users/${uid}/state/agentUsage`)
  let decision: ChatTurnDecision
  try {
    decision = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const usage = snap.exists ? parseAgentUsage(snap.data()) : null
      const d = await decide(tx, usage)
      // Skip the write when rejecting an already-marked day (no state change).
      const alreadyMarked = !d.allow && usage?.date === d.nextAgentUsage.date && usage.ceilingHit
      if (!alreadyMarked) writeAgentUsage(tx, ref, d.nextAgentUsage)
      if (d.allow) extraWrite?.(tx, d)
      return d
    })
  } catch (err) {
    // Fail-closed on transaction errors: a Firestore outage briefly disables
    // Mochi rather than silently letting the cap leak.
    console.error(`${label} reservation failed`, err)
    throw new HttpsError('internal', "Couldn't reach the quota check.")
  }
  if (!decision.allow) {
    console.info(`${label}: fair-use ceiling hit (${decision.reason})`)
    // De-metered (docs/MOCHI-MONETIZATION-MODEL.md): the fair-use ceiling is
    // INVISIBLE — no counts, no reset countdown, no top-ups. Clients fall back
    // to manual capture on RESOURCE_EXHAUSTED (P1.7); this text is a last resort.
    throw new HttpsError('resource-exhausted', RESTING_MESSAGE)
  }
}

/**
 * Flat-path reservation for ONE agentChat turn (MOCHI_TIER_ENFORCEMENT off,
 * and comp users). Only a turn that STARTS a conversation takes a slot of the
 * shared flat daily cap (DAILY_CALL_LIMIT, shared with aiInfer); follow-ups
 * are free, bounded by the 40-turn window and MAX_CHAT_TURNS_PER_DAY.
 */
export async function reserveChatTurn(uid: string, startsConversation: boolean): Promise<void> {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC
  await runChatReservation(uid, 'Mochi', async (_tx, usage) =>
    decideChatTurnFlat(usage, today, startsConversation, DAILY_CALL_LIMIT),
  )
}

/**
 * Tier-aware reservation for ONE agentChat turn (MOCHI_TIER_ENFORCEMENT on).
 * Same conversation semantics as reserveChatTurn: only a conversation start
 * reserves against the tier's daily/monthly CONVERSATION ceiling
 * (TIER_LIMITS); every turn counts toward MAX_CHAT_TURNS_PER_DAY. The
 * entitlement is read in the same transaction as the usage bump so the tier
 * and the count are consistent.
 *
 * Comp users (family allowlist) skip the TIER budget but still go through the
 * flat fair-use cap: comp matching is on user-editable profile names, so an
 * uncapped bypass would let anyone rename themselves into unlimited spend.
 */
export async function reserveMochiRequest(uid: string, startsConversation: boolean): Promise<void> {
  // Family comp: no tier metering, but the same flat blast-radius cap everyone
  // gets with enforcement off. TODO: match comp by uid, not name.
  if (await isCompUser(uid)) {
    await reserveChatTurn(uid, startsConversation)
    return
  }
  const now = new Date()
  const today = now.toISOString().slice(0, 10) // YYYY-MM-DD UTC
  const month = today.slice(0, 7) // YYYY-MM UTC
  const usageRef = adminDb.doc(`users/${uid}/state/mochiUsage`)
  const entRef = adminDb.doc(`users/${uid}/state/entitlement`)
  await runChatReservation(
    uid,
    'Mochi(tier)',
    async (tx, agentUsage) => {
      const [usageSnap, entSnap] = await Promise.all([tx.get(usageRef), tx.get(entRef)])
      const ent = parseEntitlement(entSnap.exists ? entSnap.data() : null)
      const tier = effectiveTier(ent, now.getTime())
      const usage = usageSnap.exists ? parseMochiUsage(usageSnap.data()) : null
      // Pure decision (unit-tested in chatQuota.test.ts / mochiReservation.test.ts).
      return decideChatTurnTier(tier, usage, agentUsage, today, month, startsConversation)
    },
    (tx, d) => {
      if (d.nextMochiUsage) {
        tx.set(usageRef, {
          value: JSON.stringify({ version: 1, data: d.nextMochiUsage }),
          updatedAt: now.getTime(),
        })
      }
    },
  )
}
