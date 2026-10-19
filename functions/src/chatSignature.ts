/**
 * Chat-turn signatures + conversation ids for agentChat fair use. PURE
 * (node:crypto only — no firebase-admin), so it's unit-testable.
 *
 * The hole this closes: fair use counts CONVERSATIONS, and "is this a new
 * conversation?" used to be decided from the client-sent history alone. A
 * client could prepend a fake earlier exchange — or REPLAY one of its own,
 * genuinely signed earlier exchanges as a prefix — to make every request look
 * like a follow-up and never take a slot.
 *
 * Contract (shared with the mobile client, which treats `sig` as OPAQUE):
 *  - When a request starts a conversation (takes a slot) the server mints a
 *    `convId` (96 random bits, base64url = 16 chars) and records it, with its
 *    issue time and a short hash of the starting history, in the user's
 *    agentUsage doc (chatQuota.ts resolveConversation, same transaction as
 *    the reservation).
 *  - Every reply in that conversation carries
 *      sig = `${convId}.${iat}.${hmac}`
 *    where iat is the signing time (unix SECONDS) and
 *      hmac = base64url HMAC-SHA256(key, `uid|convId|iat|sha256(prev user turn)|reply`).
 *    Wire length: 16 + 1 + 10 + 1 + 43 = 71 chars (chatMessages MAX_SIG_CHARS
 *    is 128). The reply is FINAL (every user-visible normalization applied
 *    before signing) — the client echoes it byte-for-byte as
 *    `{ role, content, sig }`.
 *  - A request is a FOLLOW-UP (no slot) only when claimFollowUp() finds:
 *    no conversationStart flag, more than one user turn, ≥1 assistant turn,
 *    the NEWEST assistant turn's sig verifies for this uid + its preceding
 *    user turn and was signed within FOLLOW_UP_MAX_IDLE_MS of now — AND
 *    (checked in the reservation transaction) its convId is in the user's
 *    recorded list with follow-ups left (chatQuota resolveConversation).
 *    Anything else is a new conversation. OLDER assistant turns are not
 *    checked: they can't make a request free on their own (the newest reply
 *    decides), and an attacker who holds a live signed reply can already
 *    send it as a bare [user, reply, newUser] window — so verifying them
 *    adds no protection, while it would charge a slot on every later turn
 *    of a chat whose early replies became unverifiable (key rotation, or a
 *    chat resumed after idle under a fresh convId).
 *
 * What the binding stops:
 *  - fabricated / forged history: the newest reply has no valid hmac;
 *  - cross-user replay: uid is MAC'd;
 *  - a reply moved after a different user turn: the predecessor is MAC'd;
 *  - an old exchange replayed as a prefix: its newest iat is stale (> 60 min),
 *    or its convId is no longer in the recorded list (24h idle / LRU cap);
 *  - splicing an old exchange in FRONT of nothing live: the newest reply
 *    decides, and it must be fresh + recorded.
 * Residual: forking a LIVE conversation (re-using its newest reply < 60 min
 * old as the prefix of a new request) — bounded per conversation by
 * chatQuota MAX_TURNS_PER_CONVERSATION (then it takes a slot) and per day by
 * MAX_CHAT_TURNS_PER_DAY.
 *
 * Key: sha256('sagely-chat-sig:' + ANTHROPIC_API_KEY) — derived from the
 * secret we already hold, so no new secret to provision. Rotating the API key
 * invalidates outstanding sigs: each in-flight chat's NEXT turn is a new
 * conversation (one slot); its reply is signed with the new key, and since
 * only the newest reply is verified, later turns are free again.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { ChatMessage } from './chatMessages'

/** A follow-up must arrive within this long of the newest signed reply. */
export const FOLLOW_UP_MAX_IDLE_MS = 60 * 60_000
/** Tolerated clock skew for an iat "in the future" (multi-instance clocks). */
const FUTURE_SKEW_S = 300

const CONV_ID_RE = /^[A-Za-z0-9_-]{16}$/
const SIG_RE = /^([A-Za-z0-9_-]{16})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/

/** Derive the HMAC key from the Anthropic API key secret value. */
export function deriveChatSigKey(apiKey: string): Buffer {
  return createHash('sha256').update(`sagely-chat-sig:${apiKey}`).digest()
}

const sha256Hex = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

/** A fresh conversation id: 96 random bits, base64url (16 chars). */
export function mintConvId(): string {
  return randomBytes(12).toString('base64url')
}

/** True for a well-formed conversation id (as minted by mintConvId). */
export function isConvId(v: unknown): v is string {
  return typeof v === 'string' && CONV_ID_RE.test(v)
}

/** The exact bytes that are MAC'd. convId and iat are fixed-alphabet fields
 * and the user-turn digest is fixed-width hex, so fields can't be shifted
 * into one another. */
export function signedPayload(
  uid: string,
  convId: string,
  iat: number,
  prevUserText: string,
  reply: string,
): string {
  return `${uid}|${convId}|${iat}|${sha256Hex(prevUserText)}|${reply}`
}

function mac(key: Buffer, payload: string): string {
  return createHmac('sha256', key).update(payload, 'utf8').digest('base64url')
}

/** The wire sig `${convId}.${iat}.${hmac}` for one reply. `iat` = unix seconds. */
export function signReply(
  key: Buffer,
  uid: string,
  convId: string,
  iat: number,
  prevUserText: string,
  reply: string,
): string {
  return `${convId}.${iat}.${mac(key, signedPayload(uid, convId, iat, prevUserText, reply))}`
}

export interface VerifiedSig {
  convId: string
  /** Unix seconds the reply was signed. */
  iat: number
}

/** Constant-time check that `sig` is our signature over this reply, for this
 * uid, answering this user turn. Returns the signed convId + iat, or null. */
export function verifyReplySig(
  key: Buffer,
  uid: string,
  prevUserText: string,
  reply: string,
  sig: unknown,
): VerifiedSig | null {
  if (typeof sig !== 'string') return null
  const m = SIG_RE.exec(sig)
  if (!m) return null
  const convId = m[1]
  const iat = Number(m[2])
  const want = Buffer.from(mac(key, signedPayload(uid, convId, iat, prevUserText, reply)), 'utf8')
  const got = Buffer.from(m[3], 'utf8')
  return got.length === want.length && timingSafeEqual(got, want) ? { convId, iat } : null
}

/** Text of the nearest `user` turn strictly before `index` ('' if none). For
 * a NEW reply, pass `messages.length` — the turn it answers is the last user
 * turn of the request. */
export function precedingUserText(messages: ChatMessage[], index: number): string {
  for (let i = Math.min(index, messages.length) - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content
  }
  return ''
}

/**
 * The conversation this (normalized) window can prove it continues, or null.
 * Non-null only when the NEWEST assistant turn's sig verifies for `uid` +
 * its preceding user turn and was signed within FOLLOW_UP_MAX_IDLE_MS of
 * `nowMs` (and not implausibly in the future). Older assistant turns are
 * ignored (see the contract above). The caller must still check the convId
 * against the user's recorded list (chatQuota resolveConversation) before
 * treating the request as a free follow-up.
 */
export function verifiedConversation(
  messages: ChatMessage[],
  key: Buffer,
  uid: string,
  nowMs: number,
): string | null {
  let i = messages.length - 1
  while (i >= 0 && messages[i].role !== 'assistant') i--
  if (i < 0) return null
  const m = messages[i]
  const v = verifyReplySig(key, uid, precedingUserText(messages, i), m.content, m.sig)
  if (!v) return null
  const nowS = Math.floor(nowMs / 1000)
  if (v.iat > nowS + FUTURE_SKEW_S) return null
  if (nowS - v.iat > FOLLOW_UP_MAX_IDLE_MS / 1000) return null
  return v.convId
}

/** Short (22-char base64url, 132-bit) hash of a normalized history — role +
 * content only, sigs excluded — used to recognise a conversation-start RETRY
 * (same history re-sent after a client timeout) so it doesn't take a second
 * slot. */
export function historyHash(messages: ChatMessage[]): string {
  const canon = JSON.stringify(messages.map((m) => [m.role, m.content]))
  return createHash('sha256').update(canon, 'utf8').digest('base64url').slice(0, 22)
}
