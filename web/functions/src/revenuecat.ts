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
  TOPUP_GRANTS,
  tierForProduct,
  type Entitlement,
  type Tier,
} from './entitlements'

const REVENUECAT_WEBHOOK_SECRET = defineSecret('REVENUECAT_WEBHOOK_SECRET')

if (admin.apps.length === 0) admin.initializeApp()
const db = admin.firestore()

/** RevenueCat event shape (the subset we use). */
interface RCEvent {
  /** Unique event id — used to make delivery idempotent (RC is at-least-once). */
  id?: string
  type?: string
  app_user_id?: string
  product_id?: string
  /** Present on PRODUCT_CHANGE: the product the user is switching TO. */
  new_product_id?: string
  expiration_at_ms?: number
  /** Apple billing-retry grace window end (BILLING_ISSUE). */
  grace_period_expiration_at_ms?: number
  /** TRANSFER: app_user_ids losing / gaining the subscription. */
  transferred_from?: string[]
  transferred_to?: string[]
}

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

const TIER_RANK: Record<Tier, number> = { free: 0, premium: 1, max: 2 }

/** The higher-ranked of two tiers (nulls ignored), or null if both are null. */
function higherTier(a: Tier | null, b: Tier | null): Tier | null {
  if (!a) return b
  if (!b) return a
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b
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
    const productId = event.product_id ?? ''
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

        switch (type) {
          case 'INITIAL_PURCHASE':
          case 'RENEWAL':
          case 'PRODUCT_CHANGE':
          case 'UNCANCELLATION': {
            // PRODUCT_CHANGE carries new_product_id (the target). An immediate
            // upgrade is effective now; a deferred downgrade keeps the current
            // (higher) product until period end, after which a RENEWAL fires
            // with only the new product. Take the HIGHER of the two tiers so an
            // upgrade reflects instantly and a downgrade is never applied early
            // — the later RENEWAL (new_product_id absent) lands the lower tier
            // at the right time. For the other events new_product_id is unset,
            // so this is just tierForProduct(product_id).
            const tier = higherTier(
              tierForProduct(productId),
              event.new_product_id ? tierForProduct(event.new_product_id) : null,
            )
            if (!tier) return // not a subscription product — ignore
            const validUntil = event.expiration_at_ms
              ? new Date(event.expiration_at_ms).toISOString()
              : current.validUntil
            tx.set(ref, writeEnvelope({ ...current, tier, validUntil }))
            return
          }
          case 'NON_RENEWING_PURCHASE': {
            // Consumable top-up pack — add its grant to the balance.
            const grant = TOPUP_GRANTS[productId]
            if (!grant) return
            tx.set(
              ref,
              writeEnvelope({ ...current, topUpBalance: current.topUpBalance + grant }),
            )
            return
          }
          case 'EXPIRATION': {
            // Subscription lapsed — drop to free, keep any top-up balance.
            tx.set(ref, writeEnvelope({ ...current, tier: 'free', validUntil: null }))
            return
          }
          case 'BILLING_ISSUE': {
            // Apple is retrying the charge — the user stays entitled through the
            // grace window. Extend validUntil to the grace expiration so the
            // server money-guard doesn't meter a still-active customer as Free.
            const graceMs = event.grace_period_expiration_at_ms
            if (!graceMs) return
            const graceUntil = new Date(graceMs).toISOString()
            const validUntil =
              !current.validUntil || graceUntil > current.validUntil
                ? graceUntil
                : current.validUntil
            tx.set(ref, writeEnvelope({ ...current, validUntil }))
            return
          }
          // CANCELLATION = auto-renew off but still valid until expiry — no change.
          default:
            return
        }
      })
      res.status(200).send('ok')
    } catch (err) {
      console.error('revenuecatWebhook failed', err)
      res.status(500).send('error')
    }
  },
)
