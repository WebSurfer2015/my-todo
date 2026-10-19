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
 *  - agentChat's response carries `sig` = base64url(HMAC-SHA256(key, reply)).
 *  - The client echoes each assistant turn back as `{ role, content, sig }`.
 *  - A request STARTS a conversation (takes a slot) when
 *    `conversationStart === true` OR isConversationStart(messages) OR ANY
 *    assistant turn in the window lacks a valid sig.
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

/** base64url HMAC-SHA256 over the assistant reply text. */
export function signReply(key: Buffer, reply: string): string {
  return createHmac('sha256', key).update(reply, 'utf8').digest('base64url')
}

/** Constant-time check that `sig` is our signature over `reply`. */
export function verifyReplySig(key: Buffer, reply: string, sig: unknown): boolean {
  if (typeof sig !== 'string' || sig.length === 0) return false
  const want = Buffer.from(signReply(key, reply), 'utf8')
  const got = Buffer.from(sig, 'utf8')
  return got.length === want.length && timingSafeEqual(got, want)
}

/** True when some assistant turn in the (normalized) window has no valid sig
 * — i.e. history the server can't vouch for. */
export function hasUnsignedAssistantTurn(messages: ChatMessage[], key: Buffer): boolean {
  return messages.some((m) => m.role === 'assistant' && !verifyReplySig(key, m.content, m.sig))
}
