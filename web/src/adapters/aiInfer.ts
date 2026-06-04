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
 * Asks the server to break a single to-do into 3–6 concrete steps.
 * Throws on quota exhaustion, agentEnabled off, network, or model
 * parse failure — caller decides whether to show an inline error or a
 * snackbar.
 */
export async function suggestSubtasks(input: BreakdownInput): Promise<BreakdownResult> {
  const res = await callAiInfer({ mode: 'breakdown-subtasks', input })
  return res.data.result as BreakdownResult
}
