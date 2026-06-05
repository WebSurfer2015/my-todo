import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

/**
 * Client wrappers for the aiInfer Cloud Function. One thin helper per
 * mode; the server-side dispatcher (web/functions/src/aiInfer.ts) owns
 * model selection, system prompts, and output validation. Calls return
 * typed results or throw — the caller decides how to surface errors.
 */

interface InferEnvelope<R> {
  result: R
  usage: { input: number; output: number }
  model: string
}

interface BreakdownInput {
  title: string
  notes?: string
}

interface BreakdownResult {
  subtasks: Array<{ text: string }>
}

const callAiInfer = httpsCallable<
  { mode: string; input: unknown },
  InferEnvelope<unknown>
>(functions, 'aiInfer')

/**
 * Retry once on a transient cold-start failure — the function runs with
 * minInstances:0, so the first call after idle can be 429'd by Cloud Run's
 * autoscaler before reaching our handler. Mirrors the mobile client's
 * cold-start retry (web previously had none). The quota cap
 * (functions/resource-exhausted) is a hard limit — never retry it.
 */
async function callAiInferRetry(payload: { mode: string; input: unknown }) {
  try {
    return await callAiInfer(payload)
  } catch (err) {
    if ((err as { code?: string } | null)?.code === 'functions/resource-exhausted') throw err
    await new Promise((r) => setTimeout(r, 1500))
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
