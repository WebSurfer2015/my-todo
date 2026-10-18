/**
 * Server-side push dispatch for Sagely.
 *
 * Phase 0 foundation: nothing calls this yet. Phase 3 (per-todo reminders
 * driven by another device) and Phase 5 (Mochi nudges) will both invoke
 * sendPushToUser. The helper centralizes:
 *   • Expo Push relay client setup
 *   • Per-uid device-token lookup
 *   • Batched send (Expo's hard limit is 100 messages per HTTP call)
 *   • Stale-token cleanup so dead devices don't accrue in Firestore
 *
 * Why Expo Push relay (not FCM direct): we already hold APNs credentials
 * via EAS, avoid a second native module (@react-native-firebase/messaging)
 * on mobile, and keep one push code path for iOS + Android. The relay
 * adds Expo Inc. as a processor — disclosed in PRIVACY.md.
 */

import * as admin from 'firebase-admin'
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk'

// Initialize the admin SDK if no other entrypoint has — sendPush.ts may
// be imported in isolation from a future Cloud Function that doesn't
// touch agentChat first.
if (admin.apps.length === 0) admin.initializeApp()
const adminDb = admin.firestore()

// One client per cold start. The Expo SDK is stateless aside from
// concurrency tracking, so reuse is safe across invocations.
const expo = new Expo()

interface DeviceDoc {
  token: string
  platform: string
  updatedAt: number
}

/** What the caller hands in. The to-field is filled in per device. */
export interface PushPayload {
  title: string
  body: string
  /** Arbitrary JSON the client gets in the notification response. Keep
   * small — Expo caps the whole message at ~4 KiB. */
  data?: Record<string, unknown>
}

interface SendResult {
  attempted: number
  invalidatedTokens: number
}

/**
 * Sends `payload` to every device registered for `uid`. Returns the
 * number of tokens addressed plus how many were invalidated (deleted
 * from Firestore because the relay reported the token is dead).
 *
 * Never throws — push failures are logged but treated as non-fatal so
 * the caller (a Cloud Function handling some other primary action) can
 * still complete successfully.
 */
export async function sendPushToUser(
  uid: string,
  payload: PushPayload,
): Promise<SendResult> {
  const devicesSnap = await adminDb.collection(`users/${uid}/devices`).get()
  if (devicesSnap.empty) return { attempted: 0, invalidatedTokens: 0 }

  // Collect tokens and remember which token came from which doc so we
  // can clean up dead tokens after the relay responds.
  const tokenToDocId = new Map<string, string>()
  const messages: ExpoPushMessage[] = []
  for (const docSnap of devicesSnap.docs) {
    const data = docSnap.data() as Partial<DeviceDoc>
    const token = data.token
    if (typeof token !== 'string' || !Expo.isExpoPushToken(token)) {
      // Bad-shape doc — drop it so it doesn't pollute future sends.
      await docSnap.ref.delete().catch(() => {})
      continue
    }
    tokenToDocId.set(token, docSnap.id)
    messages.push({
      to: token,
      sound: null, // calm-default: never play a sound
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    })
  }

  if (messages.length === 0) return { attempted: 0, invalidatedTokens: 0 }

  // Expo caps at 100 messages per HTTP call — chunkPushNotifications
  // returns batches of <= 100 in send-order.
  const chunks = expo.chunkPushNotifications(messages)
  const tickets: ExpoPushTicket[] = []
  for (const chunk of chunks) {
    try {
      const chunkTickets = await expo.sendPushNotificationsAsync(chunk)
      tickets.push(...chunkTickets)
    } catch (err) {
      // Whole-batch failure (network, Expo 5xx) — log but keep
      // processing remaining chunks. Each ticket would have been a
      // delivery attempt anyway.
      console.error('sendPushToUser: chunk send failed', err)
    }
  }

  // Walk tickets in send-order. Tickets are 1:1 with the messages
  // array, so index aligns to messages[i].to.
  let invalidatedTokens = 0
  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i]
    const message = messages[i]
    if (ticket.status !== 'error') continue
    const code = (ticket as { details?: { error?: string } }).details?.error
    if (code === 'DeviceNotRegistered') {
      const docId = tokenToDocId.get(message.to as string)
      if (docId) {
        await adminDb
          .doc(`users/${uid}/devices/${docId}`)
          .delete()
          .catch((err) => console.warn('sendPushToUser: cleanup failed', err))
        invalidatedTokens += 1
      }
    } else {
      // MessageTooBig / MessageRateExceeded / InvalidCredentials — log
      // for ops but don't auto-delete; these are usually call-site bugs
      // or transient, not "this device is dead".
      console.warn(
        'sendPushToUser: ticket error',
        code,
        (ticket as { message?: string }).message,
      )
    }
  }

  return { attempted: messages.length, invalidatedTokens }
}
