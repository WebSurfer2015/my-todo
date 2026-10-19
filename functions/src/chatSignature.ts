/**
 * Chat-turn signatures for agentChat fair use. PURE (node:crypto only — no
 * firebase-admin), so it's unit-testable.
 *
 * The hole this closes: fair use counts CONVERSATIONS, and "is this a new
 * conversation?" was decided from the client-sent history alone (exactly one
 * user turn → start). A client could prepend a fake earlier exchange to make
 * every request look like a follow-up and never take a slot.
 *
 * Contract (shared with the mobile client):
 *  - agentChat's response carries `sig` over the FINAL reply text (the server
 *    applies every user-visible normalization before signing — the client
 *    must echo the reply text byte-for-byte, never re-format it).
 *  - The client echoes each assistant turn back as `{ role, content, sig }`.
 *  - A request STARTS a conversation (takes a slot) when
 *    `conversationStart === true` OR isConversationStart(messages) OR ANY
 *    assistant turn in the window lacks a valid sig.
 *
 * What is signed: `uid | sha256(preceding user turn) | reply`. Binding the
 * caller's uid and the user turn the reply answered stops REPLAY — a sig
 * lifted from another account, or a fixed reply (SYNTHESIZED_ACK,
 * DROPPED_OPS_REPLY) re-attached after a different user turn, no longer
 * verifies. The preceding user turn is the nearest `user` turn before the
 * assistant turn in the NORMALIZED window (chatMessages.ts) — the same text
 * the server saw when it signed (normalization is deterministic).
 *
 * Key: sha256('sagely-chat-sig:' + ANTHROPIC_API_KEY) — derived from the
 * secret we already hold, so no new secret to provision. Rotating the API key
 * invalidates outstanding sigs, which only costs in-flight chats one slot.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { ChatMessage } from './chatMessages'

/** Derive the HMAC key from the Anthropic API key secret value. */
export function deriveChatSigKey(apiKey: string): Buffer {
  return createHash('sha256').update(`sagely-chat-sig:${apiKey}`).digest()
}

const sha256Hex = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

/** The exact bytes that are MAC'd. The user-turn digest is fixed-width hex,
 * so the fields can't be shifted into one another. */
export function signedPayload(uid: string, prevUserText: string, reply: string): string {
  return `${uid}|${sha256Hex(prevUserText)}|${reply}`
}

/** base64url HMAC-SHA256 over `uid | sha256(prevUserText) | reply`. */
export function signReply(key: Buffer, uid: string, prevUserText: string, reply: string): string {
  return createHmac('sha256', key)
    .update(signedPayload(uid, prevUserText, reply), 'utf8')
    .digest('base64url')
}

/** Constant-time check that `sig` is our signature over this reply, for this
 * uid, answering this user turn. */
export function verifyReplySig(
  key: Buffer,
  uid: string,
  prevUserText: string,
  reply: string,
  sig: unknown,
): boolean {
  if (typeof sig !== 'string' || sig.length === 0) return false
  const want = Buffer.from(signReply(key, uid, prevUserText, reply), 'utf8')
  const got = Buffer.from(sig, 'utf8')
  return got.length === want.length && timingSafeEqual(got, want)
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

/** True when some assistant turn in the (normalized) window has no valid sig
 * for THIS uid and ITS preceding user turn — history the server can't vouch
 * for. */
export function hasUnsignedAssistantTurn(
  messages: ChatMessage[],
  key: Buffer,
  uid: string,
): boolean {
  return messages.some(
    (m, i) =>
      m.role === 'assistant' &&
      !verifyReplySig(key, uid, precedingUserText(messages, i), m.content, m.sig),
  )
}
