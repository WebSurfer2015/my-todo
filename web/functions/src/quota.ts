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
