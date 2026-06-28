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
} from './entitlements'

const REVENUECAT_WEBHOOK_SECRET = defineSecret('REVENUECAT_WEBHOOK_SECRET')

if (admin.apps.length === 0) admin.initializeApp()
const db = admin.firestore()

/** RevenueCat event shape (the subset we use). */
interface RCEvent {
  type?: string
  app_user_id?: string
  product_id?: string
  expiration_at_ms?: number
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
    const uid = event.app_user_id
    const type = event.type
    const productId = event.product_id ?? ''
    if (!uid || !type) {
      res.status(400).send('Missing app_user_id or event type')
      return
    }

    const ref = db.doc(`users/${uid}/state/entitlement`)
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        const current = parseEntitlement(snap.exists ? snap.data() : null)

        switch (type) {
          case 'INITIAL_PURCHASE':
          case 'RENEWAL':
          case 'PRODUCT_CHANGE':
          case 'UNCANCELLATION': {
            const tier = tierForProduct(productId)
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
          // CANCELLATION = auto-renew off but still valid until expiry;
          // BILLING_ISSUE = grace period. Neither downgrades immediately.
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
