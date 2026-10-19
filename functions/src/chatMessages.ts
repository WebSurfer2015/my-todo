/**
 * Normalize the client-sent Mochi conversation for agentChat. PURE (no
 * firebase-admin) so it's unit-testable.
 *
 * The client sends the FULL alternating history ending on a user turn — an
 * odd length. A plain `.slice(-MAX_TURNS)` of an odd-length history always
 * starts on an ASSISTANT turn, which the Anthropic API (and our own guard)
 * rejects — so every send after the 20th user turn used to 400. After
 * windowing, drop leading assistant turns so the window starts on a user turn.
 */

/** One conversation turn on the wire. `assistant` turns carry only the
 * reply text — proposed operations are re-derived per request, never
 * replayed back to the model. */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Assistant turns only: the server's HMAC over this reply text, echoed
   * back by the client (chatSignature.ts). Proves the turn really came from
   * agentChat, so a client can't fake earlier history to skip the fair-use
   * slot. Server-side bookkeeping ONLY — never forwarded to Anthropic. */
  sig?: string
}

/** Signatures are base64url SHA-256 HMACs (43 chars); anything longer is junk. */
const MAX_SIG_CHARS = 128

/** Our own prompt-envelope tags. User-written text (turns, to-do/category/
 * store names) must never contain them, or it could close the envelope early
 * and smuggle text outside the "untrusted data" boundary. */
const ENVELOPE_TAG_RE = /<\/?\s*(user_request|context|todo|grocery)\s*>/gi

/** Strip our envelope tags from user-supplied text before it is wrapped. */
export function neutralizeEnvelopeTags(text: string): string {
  // Repeat until stable: a single pass let a nested tag reassemble itself
  // ("</user_<context>request>" → "</user_request>").
  let out = text
  for (let prev = ''; prev !== out; ) {
    prev = out
    out = out.replace(ENVELOPE_TAG_RE, '')
  }
  return out
}

export const MAX_TURNS = 40
export const MAX_TURN_CHARS = 2000

function isChatMessage(m: unknown): m is ChatMessage {
  return (
    !!m &&
    typeof m === 'object' &&
    ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'assistant') &&
    typeof (m as ChatMessage).content === 'string'
  )
}

/** Validate + window the client's `messages` history. Non-array → []. */
export function normalizeChatMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages)) return []
  const window = messages.filter(isChatMessage).slice(-MAX_TURNS)
  const firstUser = window.findIndex((m) => m.role === 'user')
  if (firstUser === -1) return []
  return window.slice(firstUser).map((m) => {
    const out: ChatMessage = {
      role: m.role,
      content: neutralizeEnvelopeTags(m.content).slice(0, MAX_TURN_CHARS),
    }
    // Carry the signature through for assistant turns only (a sig on a user
    // turn means nothing). Verification happens against `content` AFTER this
    // normalization — the server signs replies that already pass through it
    // unchanged (see signableReply in agentChatCore.ts).
    if (m.role === 'assistant' && typeof m.sig === 'string' && m.sig.length <= MAX_SIG_CHARS) {
      out.sig = m.sig
    }
    return out
  })
}
