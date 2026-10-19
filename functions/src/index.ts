/**
 * Sagely Cloud Functions entrypoints.
 *
 * - agentChat: conversational Mochi (Haiku + tool_use, multi-turn).
 *   Client passes the running message history; the function asks a
 *   follow-up (reply, no operations) until it has enough, then returns
 *   proposed operations the client previews + applies after user confirm.
 *   The handler here is the thin I/O shell (auth, profile gate, fair-use
 *   reservation + refund, the Anthropic call, telemetry); the request
 *   building and response walking are pure helpers in agentChatCore.ts.
 * - aiInfer:   one-shot ambient AI (mode dispatch, structured JSON).
 *   See aiInfer.ts. Lives in its own file so adding ambient modes
 *   doesn't grow this file.
 *
 * Auth is handled automatically by onCall. Required secret:
 * ANTHROPIC_API_KEY (set via firebase functions:secrets:set ANTHROPIC_API_KEY).
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import Anthropic from '@anthropic-ai/sdk'
import type { ProposedOperation } from './agentTools'
import { refundUsage, reserveChatTurn, reserveMochiRequest } from './quota'
import { isAgentEnabled } from './aiInfer'
import { normalizeChatMessages, type ChatMessage } from './chatMessages'
import { deriveChatSigKey, historyHash, precedingUserText, signReply } from './chatSignature'
import { APP_CHECK_ENFORCED, logAppCheck } from './appCheck'
import {
  MODEL,
  buildAgentRequest,
  buildContextBlock,
  fitContextBudget,
  sanitizeChatContext,
  claimFollowUp,
  walkAgentResponse,
  type ChatContext,
} from './agentChatCore'

export { aiInfer } from './aiInfer'
export { revenuecatWebhook } from './revenuecat'
export { onUserDeleted } from './deleteUserData'
export { metricsRollup } from './metricsRollupJob'

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')

// Tier-aware fair-use enforcement. When true, agentChat reserves against the
// per-tier INVISIBLE ceiling (monthly + daily sub-cap; Premium gets the larger
// one); over it the server returns RESOURCE_EXHAUSTED and the client falls
// back to manual capture (no wall, no paywall, no top-ups — de-metered model,
// docs/MOCHI-MONETIZATION-MODEL.md). When false, everyone shares the flat
// 150/day cap (reserveChatTurn: one slot per conversation).
//
// OFF again 2026-10-18 (first deploy of the dev functions to production): IAP
// can't be sold until the Apple org conversion + Paid Apps Agreement, so the
// shipped app's users would be held to the free tier with no way to upgrade.
// Everyone gets the flat fair-use cap (reserveChatTurn). Flip to true in the
// v2.0.0 release deploy, once the IAP products are live.
const MOCHI_TIER_ENFORCEMENT = false

interface ChatRequest {
  /** Multi-turn: the running conversation. First message must be `user`.
   * Assistant turns echo the server's `sig` (chatSignature.ts). */
  messages?: ChatMessage[]
  /** Client hint: no SERVER reply exists yet in this chat. Needed because an
   * intent chip prepends a canned local user+assistant exchange, so the first
   * real request has two user turns and would look like a follow-up. */
  conversationStart?: boolean
  context?: ChatContext
}

interface ChatResponse {
  reply: string
  /** `${convId}.${iat}.${hmac}` — HMAC-SHA256 over
   * `uid | convId | iat | sha256(last user turn) | reply` (chatSignature.ts).
   * OPAQUE to the client, which echoes it back on this assistant turn so the
   * server can tell a live, recorded conversation from fabricated, replayed
   * or stale history. `reply` is
   * FINAL (question "?" normalization already applied server-side): the
   * client must render and echo it verbatim or the sig won't verify. */
  sig: string
  operations: ProposedOperation[]
  /** True when Mochi has proposed operations awaiting the user's Confirm.
   * `false` (with an empty `operations`) means Mochi asked a follow-up
   * question and is waiting for the next user turn. */
  awaitingConfirmation: boolean
  /** Token usage for the turn — surfaced so we can build per-user
   * budgets and observability without re-parsing logs. */
  usage: { input: number; output: number }
  model: string
}

// Fair-use errors (all RESOURCE_EXHAUSTED, same de-metered message):
//  - Shared flat cap (DAILY_CALL_LIMIT; also blocks aiInfer): NO `details`.
//    The client should pause all AI for the day.
//  - Chat-only turn backstop (MAX_CHAT_TURNS_PER_DAY): `details: { reason:
//    'turns' }` (CHAT_TURNS_EXHAUSTED_DETAILS in quota.ts).
//  - Chat-only TIER conversation ceiling (MOCHI_TIER_ENFORCEMENT on; the
//    Mochi-only daily/monthly counters): `details: { reason: 'tier' }`
//    (CHAT_TIER_EXHAUSTED_DETAILS).
//  For 'turns' and 'tier' only Mochi chat is out — ambient aiInfer still
//  works. On the wire (raw callable HTTP):
//    { "error": { "status": "RESOURCE_EXHAUSTED", "message": "…",
//                 "details": { "reason": "turns" } } }

export const agentChat = onCall(
  // maxInstances caps runaway cost (each Mochi call is a paid Anthropic
  // request); 5 × 80 concurrency still absorbs ~400 simultaneous requests.
  // App Check: measured, not enforced, until rollout completes (appCheck.ts).
  {
    secrets: [ANTHROPIC_API_KEY],
    region: 'us-central1',
    maxInstances: 5,
    enforceAppCheck: APP_CHECK_ENFORCED,
  },
  async (request): Promise<ChatResponse> => {
    const startedAt = Date.now()
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in to use Mochi.')
    }
    logAppCheck('agentChat', request)
    const uid = request.auth.uid

    const data = request.data as Partial<ChatRequest> | undefined
    // Windowing keeps the last 40 turns AND starts on a user turn (an odd-length
    // history sliced to 40 used to start on an assistant turn → 400).
    const messages: ChatMessage[] = normalizeChatMessages(data?.messages)

    if (messages.length === 0 || messages.every((m) => m.content.trim().length === 0)) {
      throw new HttpsError('invalid-argument', 'Empty message.')
    }
    if (messages[0].role !== 'user') {
      throw new HttpsError('invalid-argument', 'Conversation must start with a user turn.')
    }
    // ...and END on one: a trailing assistant turn would be sent as a
    // prefill (the model continues text the client wrote). Rejected before
    // the reservation, so a malformed request never takes a slot.
    if (messages[messages.length - 1].role !== 'user') {
      throw new HttpsError('invalid-argument', 'Conversation must end with a user turn.')
    }

    // Profile gate — same opt-out check aiInfer enforces. Cheap (one
    // Firestore read) and BEFORE the quota reserve so a user who turned
    // AI off in their profile can't spend tokens (or a quota slot) via
    // Mochi. Server-side so a tampered client can't bypass it. Fails closed.
    if (!(await isAgentEnabled(uid))) {
      throw new HttpsError('failed-precondition', 'AI assistance is off in your profile.')
    }

    // Reserve before doing any expensive work: the turn is counted (committed
    // in a transaction) before the Anthropic request runs, so a hammered model
    // endpoint can't drain past the cap. Fair use counts CONVERSATIONS: only a
    // request that starts one takes a slot. A follow-up must prove a live,
    // server-signed conversation (agentChatCore.claimFollowUp) whose convId is
    // recorded for this uid (checked in the reservation transaction); a start
    // mints the convId every reply in the conversation is signed with.
    // Follow-ups are free, bounded per conversation
    // (chatQuota.ts MAX_TURNS_PER_CONVERSATION) and by the per-day turn
    // backstop (MAX_CHAT_TURNS_PER_DAY).
    const apiKey = ANTHROPIC_API_KEY.value()
    const sigKey = deriveChatSigKey(apiKey)
    const claim = {
      claimedConvId: claimFollowUp(data?.conversationStart, messages, sigKey, uid, Date.now()),
      startHash: historyHash(messages),
    }
    const { charge, convId, startsConversation: isStart } = MOCHI_TIER_ENFORCEMENT
      ? await reserveMochiRequest(uid, claim)
      : await reserveChatTurn(uid, claim)

    // Validated, capped, budgeted context — the model sees exactly what the
    // anti-hallucination allow-lists are built from.
    const ctx = fitContextBudget(sanitizeChatContext(data?.context))

    // Own the latency/retry budget against the function's 60s timeout: the
    // SDK default (maxRetries:2 + long timeout) can stack backoff past the
    // function deadline and surface as a generic timeout. One bounded attempt
    // with a ~25s ceiling leaves room to return a clean error instead.
    const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 25_000 })

    let response
    try {
      response = await client.messages.create(buildAgentRequest(messages, buildContextBlock(ctx)))
    } catch (err) {
      // Swallow upstream SDK errors so internal state (model name details,
      // SDK stack frames, rate-limit messages) doesn't leak to the client
      // via HttpsError. Log only the safe envelope (status/name/request_id) —
      // the raw SDK error can carry request metadata (user message text) into
      // Cloud Logging. request_id stays for support correlation.
      console.error(
        'agentChat: Anthropic SDK error',
        err instanceof Anthropic.APIError
          ? { status: err.status, name: err.name, requestId: err.request_id }
          : String(err),
      )
      // The user got nothing — give the fair-use reservation back.
      await refundUsage(uid, charge)
      throw new HttpsError('internal', "Mochi couldn't think just now.")
    }

    const { reply, operations, truncated } = walkAgentResponse(response, ctx)
    // Truncated tool calls are silently dropped — make it visible.
    if (truncated) console.warn('agentChat: hit max_tokens')

    // Structured telemetry for Cloud Logging — cost/usage per call so ops
    // can track spend, anomalies, and tool-proposal rates without a side
    // channel. The pinned SDK Usage type omits the cache_* fields the API returns.
    const usageExt = response.usage as {
      cache_read_input_tokens?: number | null
      cache_creation_input_tokens?: number | null
    }
    console.log(
      JSON.stringify({
        event: 'agentChat',
        uid,
        model: MODEL,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        // Cache effectiveness — read = prompt-cache HIT (tools+system
        // reused), creation = the turn that seeded it.
        cache_read_tokens: usageExt.cache_read_input_tokens ?? 0,
        cache_creation_tokens: usageExt.cache_creation_input_tokens ?? 0,
        ops: operations.length,
        starts_conversation: isStart,
        duration_ms: Date.now() - startedAt,
      }),
    )

    return {
      reply,
      // Bound to the caller, the conversation, the signing time and the user
      // turn it answers (anti-replay).
      sig: signReply(
        sigKey,
        uid,
        convId,
        Math.floor(Date.now() / 1000),
        precedingUserText(messages, messages.length),
        reply,
      ),
      operations,
      awaitingConfirmation: operations.length > 0,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
      model: MODEL,
    }
  },
)
