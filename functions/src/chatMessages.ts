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
}

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
  return window
    .slice(firstUser)
    .map((m) => ({ role: m.role, content: neutralizeEnvelopeTags(m.content).slice(0, MAX_TURN_CHARS) }))
}
