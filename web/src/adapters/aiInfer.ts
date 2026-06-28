import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import {
  InferEnvelope,
  BreakdownInput,
  BreakdownResult,
  COLD_START_RETRY_MS,
} from '../../../core/src/ports/aiContracts'

/**
 * Client wrappers for the aiInfer Cloud Function. One thin helper per
 * mode; the server-side dispatcher (web/functions/src/aiInfer.ts) owns
 * model selection, system prompts, and output validation. Calls return
 * typed results or throw — the caller decides how to surface errors.
 *
 * The wire contract types (InferEnvelope / BreakdownInput / BreakdownResult)
 * are shared with mobile via core/src/ports/aiContracts.
 */

const callAiInfer = httpsCallable<
  { mode: string; input: unknown },
  InferEnvelope<unknown>
>(functions, 'aiInfer')

/**
 * Retry once on a genuinely transient PLATFORM failure — the function runs
 * with minInstances:0, so the first call after idle can hit a Cloud Run cold
 * start that surfaces as functions/unavailable or functions/deadline-exceeded.
 * Everything else is rethrown immediately: a quota cap
 * (functions/resource-exhausted, which Firebase ALSO maps the cold-start 429
 * onto — but a retry can't tell them apart, so we don't gamble a paid call)
 * and deterministic server errors (functions/internal, thrown after the model
 * call when output parsing fails) would just fail again on retry — and
 * breakdown-subtasks is a Sonnet call (~$0.01), so a blind retry double-charges.
 */
async function callAiInferRetry(payload: { mode: string; input: unknown }) {
  try {
    return await callAiInfer(payload)
  } catch (err) {
    const code = (err as { code?: string } | null)?.code
    if (code !== 'functions/unavailable' && code !== 'functions/deadline-exceeded') throw err
    await new Promise((r) => setTimeout(r, COLD_START_RETRY_MS))
    return await callAiInfer(payload)
  }
}

/**
 * Asks the server to break a single to-do into 3–6 concrete steps.
 * Throws on quota exhaustion, agentEnabled off, network, or model
 * parse failure — caller decides whether to show an inline error or a
 * snackbar.
 */
export async function suggestSubtasks(input: BreakdownInput): Promise<BreakdownResult> {
  const res = await callAiInferRetry({ mode: 'breakdown-subtasks', input })
  return res.data.result as BreakdownResult
}
