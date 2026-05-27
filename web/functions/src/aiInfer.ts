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
 *   • System prompts are short and use prompt caching.
 *   • max_tokens is tight per mode.
 *   • profile.agentEnabled === true is enforced server-side before any
 *     model call, so an opted-out user never spends tokens.
 *
 * Quota: shares the per-uid daily cap with agentChat via reserveDailyCall.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import * as admin from 'firebase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { reserveDailyCall } from './quota'

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

type Mode = 'breakdown-subtasks' | 'classify-grocery-dept' | 'suggest-todo-fields' | 'link-store-to-items'

/**
 * Per-mode handler. Each call sequence is: validateInput → buildUserBlock
 * → model call → parseOutput. Prompt caching is opt-in per mode via the
 * cacheableSystemModes set below.
 */
interface ModeConfig {
  model: string
  maxTokens: number
  system: string
  validateInput: (raw: unknown) => unknown
  buildUserBlock: (input: unknown) => string
  parseOutput: (text: string) => unknown
}

// --- Mode registry --------------------------------------------------------

const MODES: Record<Mode, ModeConfig> = {
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
    // cheaper. max_tokens=120 covers the {"groupId":"...","storeHint":...,
    // "recommendedStores":["A","B","C"]} envelope.
    model: 'claude-haiku-4-5',
    maxTokens: 120,
    system: CLASSIFY_DEPT_SYSTEM,
    validateInput: validateClassifyDeptInput,
    buildUserBlock: (input) => buildClassifyDeptUserBlock(input as ClassifyDeptInput),
    parseOutput: parseClassifyDeptOutput,
  },
  'suggest-todo-fields': {
    // Haiku 4.5 — fires on every typing pause, so cost discipline is
    // critical. max_tokens=80 covers the field JSON envelope. System
    // prompt is prompt-cached (see cacheableSystemModes below) so
    // calls within ~5 minutes of each other only re-bill the
    // user-block input delta.
    model: 'claude-haiku-4-5',
    maxTokens: 80,
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
    maxTokens: 300,
    system: LINK_STORE_SYSTEM,
    validateInput: validateLinkStoreInput,
    buildUserBlock: (input) => buildLinkStoreUserBlock(input as LinkStoreInput),
    parseOutput: parseLinkStoreOutput,
  },
}

// Modes whose system prompt is large + invariant across calls and that
// fire often enough to amortize the cache. Caching is opt-in per mode
// (rather than always-on) so a short low-frequency mode doesn't pay
// the cache_control overhead for no gain.
const cacheableSystemModes: ReadonlySet<Mode> = new Set([
  'suggest-todo-fields',
])

// --- Profile gate ---------------------------------------------------------

/**
 * Reads users/{uid}/state/profile and returns whether AI assistance is
 * enabled. As of the on-by-default flip, the field is tri-state:
 *   - undefined → ON (default)
 *   - true      → ON (explicit)
 *   - false     → OFF (explicit opt-out)
 *
 * The profile is stored as a versioned JSON envelope
 * (`{value: <json string>, updatedAt}`), so we have to parse.
 * On any read failure we default to ON — matching the client default
 * so the gate doesn't silently block users when Firestore is jittery.
 */
async function isAgentEnabled(uid: string): Promise<boolean> {
  try {
    const snap = await adminDb.doc(`users/${uid}/state/profile`).get()
    if (!snap.exists) return true
    const data = snap.data() as { value?: unknown } | undefined
    if (!data || typeof data.value !== 'string') return true
    const parsed = JSON.parse(data.value)
    const profile = (parsed as { data?: unknown }).data
    const v = profile && (profile as { agentEnabled?: unknown }).agentEnabled
    return v !== false
  } catch (err) {
    console.warn('isAgentEnabled: read failed, defaulting to on', err)
    return true
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
  { secrets: [ANTHROPIC_API_KEY], region: 'us-central1' },
  async (request): Promise<InferResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in to use AI assistance.')
    }

    const data = request.data as Partial<InferRequest> | undefined
    const mode = data?.mode
    if (!mode || !(mode in MODES)) {
      throw new HttpsError('invalid-argument', 'Unknown AI mode.')
    }
    const config = MODES[mode]

    // Profile gate. Cheap (one Firestore read) and protects token spend
    // on users who haven't opted in. Server-side so a tampered client
    // can't bypass it.
    if (!(await isAgentEnabled(request.auth.uid))) {
      throw new HttpsError(
        'failed-precondition',
        'AI assistance is off in your profile.',
      )
    }

    // Reserve a quota slot before doing any expensive work. Shared
    // counter with agentChat so a user can't game the cap by spreading
    // calls across endpoints.
    await reserveDailyCall(request.auth.uid, 'AI')

    const input = config.validateInput(data?.input)
    const userBlock = config.buildUserBlock(input as never)
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

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() })

    // Build the system payload. For cacheable modes we send the prompt
    // as a TextBlockParam array carrying cache_control: ephemeral so
    // Anthropic re-uses the cached system on subsequent calls within
    // ~5 minutes. Cast is needed because the SDK types in our pinned
    // version don't yet expose cache_control on TextBlockParam; the
    // server-side API has supported it for a while.
    const systemPayload = cacheableSystemModes.has(mode)
      ? ([
          { type: 'text', text: config.system, cache_control: { type: 'ephemeral' } },
        ] as unknown as Anthropic.Messages.MessageCreateParams['system'])
      : config.system

    let response
    try {
      response = await client.messages.create({
        model: config.model,
        max_tokens: config.maxTokens,
        system: systemPayload,
        messages: [
          {
            role: 'user',
            content: `<todo>\n${userBlock}\n</todo>`,
          },
        ],
      })
    } catch (err) {
      console.error('aiInfer: Anthropic SDK error', err)
      throw new HttpsError('internal', "Couldn't reach the AI service.")
    }

    let text = ''
    for (const block of response.content) {
      if (block.type === 'text') text += block.text
    }
    const parsed = config.parseOutput(text)
    const result = postProcess ? postProcess(parsed) : parsed

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
