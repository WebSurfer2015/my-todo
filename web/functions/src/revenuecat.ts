/**
 * RevenueCat → Firestore entitlement webhook.
 *
 * RevenueCat validates every App Store receipt and POSTs us the resulting
 * subscription lifecycle events. This is the ONLY writer of
 * users/{uid}/state/entitlement — the client never writes it (firestore.rules
 * denies that), so the server-side AI money-guard (reserveMochiRequest) can
 * trust the tier it reads.
 *
 * Setup (RevenueCat dashboard → Project → Integrations → Webhooks):
 *   - URL:  https://us-central1-my-todos-1b079.cloudfunctions.net/revenuecatWebhook
 *   - Authorization header: a shared secret, stored as the
 *     REVENUECAT_WEBHOOK_SECRET function secret
 *     (firebase functions:secrets:set REVENUECAT_WEBHOOK_SECRET).
 *   - The app must identify the RC user as the Firebase uid
 *     (Purchases.logIn(uid)) so event.app_user_id maps to our user.
 */

import { timingSafeEqual } from 'node:crypto'
import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import * as admin from 'firebase-admin'
import {
  FREE_ENTITLEMENT,
  tierForProduct,
  type Entitlement,
  type Tier,
} from './entitlements'
import { applyEntitlementEvent, type RCEvent } from './entitlementEvents'

const REVENUECAT_WEBHOOK_SECRET = defineSecret('REVENUECAT_WEBHOOK_SECRET')

if (admin.apps.length === 0) admin.initializeApp()
const db = admin.firestore()

/** Write a single user's entitlement tier (preserving their top-up balance). */
async function setUserTier(
  uid: string,
  tier: Tier,
  validUntil: string | null,
): Promise<void> {
  const ref = db.doc(`users/${uid}/state/entitlement`)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const current = parseEntitlement(snap.exists ? snap.data() : null)
    tx.set(ref, writeEnvelope({ ...current, tier, validUntil }))
  })
}

/** TRANSFER spans accounts, so it's handled outside the single-uid path:
 * gaining accounts get the subscription, losing accounts drop to free. */
async function handleTransfer(event: RCEvent): Promise<void> {
  const tier = tierForProduct(event.product_id ?? '')
  const validUntil = event.expiration_at_ms
    ? new Date(event.expiration_at_ms).toISOString()
    : null
  if (tier) {
    for (const uid of event.transferred_to ?? []) {
      await setUserTier(uid, tier, validUntil)
    }
  }
  for (const uid of event.transferred_from ?? []) {
    await setUserTier(uid, 'free', null)
  }
}

function parseEntitlement(raw: unknown): Entitlement {
  if (!raw || typeof raw !== 'object') return FREE_ENTITLEMENT
  const val = (raw as { value?: unknown }).value
  if (typeof val !== 'string') return FREE_ENTITLEMENT
  try {
    const data = (JSON.parse(val) as { data?: unknown })?.data as Partial<Entitlement> | undefined
    if (!data) return FREE_ENTITLEMENT
    return {
      tier:
        data.tier === 'premium' || data.tier === 'max' || data.tier === 'free'
          ? data.tier
          : 'free',
      validUntil: typeof data.validUntil === 'string' ? data.validUntil : null,
      topUpBalance:
        typeof data.topUpBalance === 'number' && Number.isFinite(data.topUpBalance)
          ? Math.max(0, Math.floor(data.topUpBalance))
          : 0,
    }
  } catch {
    return FREE_ENTITLEMENT
  }
}

function writeEnvelope(ent: Entitlement) {
  return { value: JSON.stringify({ version: 1, data: ent }), updatedAt: Date.now() }
}

export const revenuecatWebhook = onRequest(
  { secrets: [REVENUECAT_WEBHOOK_SECRET], region: 'us-central1' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed')
      return
    }
    // Shared-secret auth — RC sends the value configured in its dashboard.
    // Constant-time compare so a network attacker can't recover the secret
    // (the only writer of the paid-entitlement doc) via a timing oracle.
    const got = Buffer.from(req.header('Authorization') ?? '')
    const want = Buffer.from(REVENUECAT_WEBHOOK_SECRET.value())
    if (got.length !== want.length || !timingSafeEqual(got, want)) {
      res.status(401).send('Unauthorized')
      return
    }

    const event = (req.body?.event ?? {}) as RCEvent
    const type = event.type
    const eventId = event.id
    if (!type) {
      res.status(400).send('Missing event type')
      return
    }

    try {
      // TRANSFER moves a subscription between accounts — handled separately
      // because it writes more than the event's own app_user_id doc.
      if (type === 'TRANSFER') {
        await handleTransfer(event)
        res.status(200).send('ok')
        return
      }

      const uid = event.app_user_id
      if (!uid) {
        res.status(400).send('Missing app_user_id')
        return
      }
      const ref = db.doc(`users/${uid}/state/entitlement`)
      // Per-user processed-event log so an at-least-once redelivery (RC retries
      // on any non-2xx/timeout) can't re-credit a consumable top-up.
      const dedupeRef = db.doc(`users/${uid}/state/rcWebhook`)
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        const dedupeSnap = await tx.get(dedupeRef)
        const processed: string[] =
          (dedupeSnap.exists ? (dedupeSnap.data()?.ids as string[] | undefined) : undefined) ?? []
        if (eventId && processed.includes(eventId)) return // already applied
        const current = parseEntitlement(snap.exists ? snap.data() : null)
        if (eventId) {
          tx.set(dedupeRef, { ids: [...processed, eventId].slice(-50) }, { merge: true })
        }
        // All single-user tier logic (upgrade/downgrade ordering, top-up
        // credit, expiration, grace) lives in the pure applyEntitlementEvent so
        // it's unit-tested. It returns `current` unchanged for no-op events, so
        // we only write when something actually changed.
        const next = applyEntitlementEvent(current, event)
        if (next !== current) tx.set(ref, writeEnvelope(next))
      })
      res.status(200).send('ok')
    } catch (err) {
      console.error('revenuecatWebhook failed', err)
      res.status(500).send('error')
    }
  },
)
