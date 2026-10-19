/**
 * Sagely ambient-AI endpoint.
 *
 * One callable, multiple modes. Unlike agentChat (conversational +
 * tool_use), aiInfer is one-shot: structured JSON in, structured JSON
 * out, no multi-turn state, no tool loop. Modes are added by extending
 * the MODES table — each one picks its own model, max_tokens, system
 * prompt, and output validator.
 *
 * Per-mode prompts / validators / parsers / post-process logic live
 * in sibling aiInfer<Mode>.ts files. This file is the dispatcher +
 * registry only.
 *
 * Token discipline (see feedback_ai_token_efficiency.md):
 *   • Default model is Haiku 4.5; only modes that need reasoning depth
 *     opt up to Sonnet.
 *   • System prompts are short. (They are all BELOW the model's minimum
 *     cacheable prefix — 4096 tokens on Haiku 4.5 — so no mode sends
 *     cache_control: it would be silently ignored.)
 *   • max_tokens is tight per mode.
 *   • The profile opt-out (agentEnabled === false) is enforced server-side
 *     before any model call — failing CLOSED — so an opted-out user never
 *     reaches the AI.
 *
 * Quota: shares the per-uid daily cap with agentChat via reserveDailyCall.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import * as admin from 'firebase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { refundUsage, reserveDailyCall } from './quota'
import { neutralizeEnvelopeTags } from './chatMessages'
import { APP_CHECK_ENFORCED, logAppCheck } from './appCheck'

import {
  BREAKDOWN_SYSTEM,
  validateBreakdownInput,
  buildBreakdownUserBlock,
  parseBreakdownOutput,
  type BreakdownInput,
} from './aiInferBreakdown'
import {
  CLASSIFY_DEPT_SYSTEM,
  validateClassifyDeptInput,
  buildClassifyDeptUserBlock,
  parseClassifyDeptOutput,
  postProcessClassifyDept,
  type ClassifyDeptInput,
  type ClassifyDeptOutput,
} from './aiInferClassifyDept'
import {
  SUGGEST_FIELDS_SYSTEM,
  validateSuggestFieldsInput,
  buildSuggestFieldsUserBlock,
  parseSuggestFieldsOutput,
  type SuggestFieldsInput,
} from './aiInferSuggestFields'
import {
  LINK_STORE_SYSTEM,
  validateLinkStoreInput,
  buildLinkStoreUserBlock,
  parseLinkStoreOutput,
  postProcessLinkStore,
  type LinkStoreInput,
  type LinkStoreOutput,
} from './aiInferLinkStore'

// Re-export parsers + post-process so the test file (and any future
// consumer) can import them from the canonical './aiInfer' path.
export {
  parseBreakdownOutput,
  parseClassifyDeptOutput,
  parseSuggestFieldsOutput,
  parseLinkStoreOutput,
  postProcessClassifyDept,
  postProcessLinkStore,
}

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')

if (admin.apps.length === 0) admin.initializeApp()
const adminDb = admin.firestore()

export type Mode = 'breakdown-subtasks' | 'classify-grocery-dept' | 'suggest-todo-fields' | 'link-store-to-items'

/**
 * Per-mode handler. Each call sequence is: validateInput → buildUserBlock
 * → model call → parseOutput.
 */
interface ModeConfig {
  model: string
  maxTokens: number
  system: string
  validateInput: (raw: unknown) => unknown
  buildUserBlock: (input: unknown) => string
  parseOutput: (text: string) => unknown
  /** Envelope the user block is wrapped in — MUST match the tag the mode's
   * system prompt tells the model to treat as untrusted data. */
  envelope?: 'todo' | 'grocery'
}

// --- Mode registry --------------------------------------------------------

export const MODES: Record<Mode, ModeConfig> = {
  'breakdown-subtasks': {
    model: 'claude-sonnet-4-6',
    maxTokens: 256,
    system: BREAKDOWN_SYSTEM,
    validateInput: validateBreakdownInput,
    buildUserBlock: (input) => buildBreakdownUserBlock(input as BreakdownInput),
    parseOutput: parseBreakdownOutput,
  },
  'classify-grocery-dept': {
    // Haiku 4.5 — one-shot classification against a small label set,
    // so reasoning depth doesn't help and the smaller model is ~4x
    // cheaper. max_tokens=240 covers the {"groupId":"...","storeHint":...,
    // "recommendedStores":["A","B","C"]} envelope with a comfortable
    // margin (was 120 — too tight when recommendedStores has 3 long
    // names like "Trader Joe's", forcing the model to either truncate
    // or output empty).
    model: 'claude-haiku-4-5',
    maxTokens: 240,
    system: CLASSIFY_DEPT_SYSTEM,
    validateInput: validateClassifyDeptInput,
    envelope: 'grocery',
    buildUserBlock: (input) => buildClassifyDeptUserBlock(input as ClassifyDeptInput),
    parseOutput: parseClassifyDeptOutput,
  },
  'suggest-todo-fields': {
    // Haiku 4.5 — fires on every typing pause, so cost discipline is
    // critical. NOT prompt-cached: the system prompt (~2k tokens) is below
    // Haiku 4.5's 4096-token minimum cacheable prefix, so cache_control was
    // silently ignored (cache_read_tokens stayed 0). Revisit only if the
    // prompt grows past the minimum.
    model: 'claude-haiku-4-5',
    maxTokens: 100, // was 80; the full envelope (recurrence + reminder + cleanedText) could overrun. ≤100 hot-path guard (aiInfer.test.ts)
    system: SUGGEST_FIELDS_SYSTEM,
    validateInput: validateSuggestFieldsInput,
    buildUserBlock: (input) => buildSuggestFieldsUserBlock(input as SuggestFieldsInput),
    parseOutput: parseSuggestFieldsOutput,
  },
  'link-store-to-items': {
    // Haiku 4.5 — pure mapping decision over a bounded item list.
    // max_tokens=300 covers up to ~25 short uuid-like ids in the
    // {"linkedItemIds":[...]} envelope.
    model: 'claude-haiku-4-5',
    maxTokens: 512, // ~25 tokens per UUID; 300 truncated at ~11 matches → parse fail → "no match". 512 = the per-mode cost guard (~19 matches). TODO: return item indexes, not UUIDs
    system: LINK_STORE_SYSTEM,
    validateInput: validateLinkStoreInput,
    envelope: 'grocery',
    buildUserBlock: (input) => buildLinkStoreUserBlock(input as LinkStoreInput),
    parseOutput: parseLinkStoreOutput,
  },
}

// --- Profile gate ---------------------------------------------------------

/**
 * Pure decision for the profile gate. The `agentEnabled` field is
 * tri-state (on-by-default):
 *   - undefined → ON (default)
 *   - true      → ON (explicit)
 *   - false     → OFF (explicit opt-out)
 * No profile doc / no envelope → ON (nothing was opted out). An envelope
 * that doesn't parse → OFF: we can't tell whether it holds an opt-out, and
 * the privacy promise is that opted-out users NEVER reach the AI.
 */
export function agentEnabledFromProfile(exists: boolean, raw: unknown): boolean {
  if (!exists) return true
  const value = raw && typeof raw === 'object' ? (raw as { value?: unknown }).value : undefined
  if (typeof value !== 'string') return true
  try {
    const parsed = JSON.parse(value) as { data?: unknown } | null
    const profile = parsed?.data
    const v = profile && typeof profile === 'object'
      ? (profile as { agentEnabled?: unknown }).agentEnabled
      : undefined
    return v !== false
  } catch {
    return false
  }
}

/**
 * Reads users/{uid}/state/profile (a versioned `{value: <json>, updatedAt}`
 * envelope) and returns whether AI assistance is enabled.
 *
 * Fails CLOSED: on a Firestore read error we return false. (It used to fail
 * open to match the client default, which meant a Firestore blip could send
 * an opted-out user's text to the model.) A blip now briefly shows the
 * "AI is off" path instead — the clients fall back to manual capture.
 */
export async function isAgentEnabled(uid: string): Promise<boolean> {
  try {
    const snap = await adminDb.doc(`users/${uid}/state/profile`).get()
    return agentEnabledFromProfile(snap.exists, snap.data())
  } catch (err) {
    console.warn('isAgentEnabled: read failed, failing closed', err)
    return false
  }
}

// --- Dispatcher -----------------------------------------------------------

interface InferRequest {
  mode: Mode
  input: unknown
}

interface InferResponse {
  result: unknown
  usage: { input: number; output: number }
  model: string
}

export const aiInfer = onCall(
  // Cost cap — same reasoning as agentChat (paid Anthropic call per request).
  // App Check: measured, not enforced, until rollout completes (appCheck.ts).
  {
    secrets: [ANTHROPIC_API_KEY],
    region: 'us-central1',
    maxInstances: 5,
    enforceAppCheck: APP_CHECK_ENFORCED,
  },
  async (request): Promise<InferResponse> => {
    const startedAt = Date.now()
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in to use AI assistance.')
    }
    logAppCheck('aiInfer', request)

    const data = request.data as Partial<InferRequest> | undefined
    const mode = data?.mode
    // Own keys only: `in` also matches inherited names ("constructor",
    // "toString"), which then crashed on config.validateInput → INTERNAL.
    if (typeof mode !== 'string' || !Object.hasOwn(MODES, mode)) {
      throw new HttpsError('invalid-argument', 'Unknown AI mode.')
    }
    const config = MODES[mode]

    // Profile gate. Cheap (one Firestore read); keeps opted-out users away
    // from the model. Server-side so a tampered client can't bypass it.
    // Fails closed (isAgentEnabled).
    if (!(await isAgentEnabled(request.auth.uid))) {
      throw new HttpsError(
        'failed-precondition',
        'AI assistance is off in your profile.',
      )
    }

    // Validate FIRST so a rejected input (e.g. suggest-fields text > 200
    // chars) can't burn a slot of the shared daily cap without a model call.
    const input = config.validateInput(data?.input)

    // Reserve a quota slot before doing any expensive work. Shared
    // counter with agentChat so a user can't game the cap by spreading
    // calls across endpoints. Refunded below if the model call fails.
    const charge = await reserveDailyCall(request.auth.uid, 'AI')

    const userBlock = config.buildUserBlock(input as never)
    const tag = config.envelope ?? 'todo'
    // Post-process hook: only classify-grocery-dept and
    // link-store-to-items need one today. Logic lives in the per-mode
    // files for testability.
    const postProcess: ((raw: unknown) => unknown) | null =
      mode === 'classify-grocery-dept'
        ? (raw) =>
            postProcessClassifyDept(
              raw as ClassifyDeptOutput,
              input as ClassifyDeptInput,
            )
        : mode === 'link-store-to-items'
          ? (raw) =>
              postProcessLinkStore(
                raw as LinkStoreOutput,
                input as LinkStoreInput,
              )
          : null

    // Own the latency/retry budget against the function's 60s timeout: the
    // SDK default (maxRetries:2 + long timeout) can stack backoff past the
    // function deadline and surface as a generic timeout. One bounded attempt
    // with a ~25s ceiling leaves room to return a clean error instead.
    const client = new Anthropic({
      apiKey: ANTHROPIC_API_KEY.value(),
      maxRetries: 0,
      timeout: 25_000,
    })

    let response
    try {
      response = await client.messages.create({
        model: config.model,
        max_tokens: config.maxTokens,
        // Plain string: every mode's prompt is under the minimum cacheable
        // prefix, so cache_control would be ignored (see file header).
        system: config.system,
        messages: [
          {
            role: 'user',
            content: `<${tag}>\n${neutralizeEnvelopeTags(userBlock)}\n</${tag}>`,
          },
        ],
      })
    } catch (err) {
      // Log only the safe envelope (status/name/request_id) — the raw SDK
      // error object can carry request metadata (user task text) into Cloud
      // Logging. request_id stays for support correlation with Anthropic.
      console.error(
        'aiInfer: Anthropic SDK error',
        err instanceof Anthropic.APIError
          ? { status: err.status, name: err.name, requestId: err.request_id }
          : String(err),
      )
      // The user got nothing — give the daily-cap slot back.
      await refundUsage(request.auth.uid, charge)
      throw new HttpsError('internal', "Couldn't reach the AI service.")
    }

    let text = ''
    // A truncated reply parses as nothing — make it visible in the logs.
    if (response.stop_reason === 'max_tokens') {
      console.warn('aiInfer: hit max_tokens', { mode, maxTokens: config.maxTokens })
    }
    for (const block of response.content) {
      if (block.type === 'text') text += block.text
    }
    const parsed = config.parseOutput(text)
    const result = postProcess ? postProcess(parsed) : parsed

    // Structured telemetry for Cloud Logging — per-mode cost/usage so ops
    // can track spend + anomalies. (Review gap: usage returned, never logged.)
    // The pinned SDK Usage type omits the cache_* fields the API returns.
    const usageExt = response.usage as {
      cache_read_input_tokens?: number | null
      cache_creation_input_tokens?: number | null
    }
    console.log(
      JSON.stringify({
        event: 'aiInfer',
        mode,
        uid: request.auth?.uid ?? null,
        model: config.model,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        // Prompt-cache effectiveness — expected 0 (no mode caches; see the
        // file header). Kept so a regression/opportunity is visible.
        cache_read_tokens: usageExt.cache_read_input_tokens ?? 0,
        cache_creation_tokens: usageExt.cache_creation_input_tokens ?? 0,
        duration_ms: Date.now() - startedAt,
      }),
    )

    return {
      result,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
      model: config.model,
    }
  },
)
