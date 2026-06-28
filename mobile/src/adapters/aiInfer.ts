import auth from '@react-native-firebase/auth'
import { normalizeSuggestedReminder } from '../../../core/src/logic/suggestFields'
import {
  COLD_START_RETRY_MS,
  type InferEnvelope,
  type BreakdownInput,
  type BreakdownResult,
  type ClassifyDeptInput,
  type ClassifyDeptResult,
  type SuggestFieldsInput,
  type SuggestFieldsResult,
  type LinkStoreInput,
  type LinkStoreResult,
} from '../../../core/src/ports/aiContracts'

/**
 * Client wrappers for the aiInfer Cloud Function. Same pattern as
 * useMochiAgent: raw HTTPS POST against the callable URL with the
 * user's Firebase ID token in the Authorization header. Avoids pulling
 * in @react-native-firebase/functions just for one call.
 *
 * Server contract (callable functions): body wrapped in {data: ...},
 * response wrapped in {result: ...}.
 *
 * The wire contract types live in core/src/ports/aiContracts.ts (shared,
 * platform-pure) so web + mobile + the server's text-parity test stay in
 * lockstep. Re-export SuggestFieldsResult so existing callers that import
 * it from this module keep working.
 */

export type { SuggestFieldsResult } from '../../../core/src/ports/aiContracts'

const AI_INFER_URL =
  'https://us-central1-my-todos-1b079.cloudfunctions.net/aiInfer'

// A stalled connection (no response, no error) would otherwise hang the
// caller forever — bound every client fetch with a manual timeout. We use
// setTimeout + AbortController rather than AbortSignal.timeout(), which
// isn't reliably present in Hermes/RN 0.81.
const AI_FETCH_TIMEOUT_MS = 25000

async function callAiInfer<R>(
  mode: string,
  input: unknown,
  signal?: AbortSignal,
): Promise<R> {
  const user = auth().currentUser
  if (!user) throw new Error('Sign in to use AI assistance.')
  const idToken = await user.getIdToken()
  // Retry once on a transient 429. The function runs with minInstances:0,
  // so the first request after idle hits a cold start (~1-2s); a follow-up
  // landing in that window can get 429'd by Cloud Run's autoscaler before
  // reaching our handler. One retry after a brief pause absorbs that gap.
  let res = await fetchAi(idToken, mode, input, signal)
  if (res.status === 429) {
    // Two very different 429s: a HARD daily-quota cap (the callable throws
    // resource-exhausted → body.error.status === RESOURCE_EXHAUSTED) vs a
    // transient cold-start throttle. Only the latter is worth retrying —
    // retrying the cap just wastes an invocation + the back-off sleep.
    const peek = (await res.json().catch(() => null)) as {
      error?: { status?: string; message?: string }
    } | null
    if (peek?.error?.status === 'RESOURCE_EXHAUSTED') {
      throw new Error(peek.error.message ?? 'AI daily limit reached.')
    }
    await new Promise((resolve) => setTimeout(resolve, COLD_START_RETRY_MS))
    res = await fetchAi(idToken, mode, input, signal)
  }
  if (!res.ok) {
    // Prefer the server's own message ("AI assistance is off in your
    // profile") over a bare status code when the body carries one.
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string }
    } | null
    throw new Error(body?.error?.message ?? `AI request failed (${res.status}).`)
  }
  const body = (await res.json()) as { result?: InferEnvelope<R>; error?: { message?: string } }
  if (body.error) throw new Error(body.error.message ?? 'AI request failed.')
  if (!body.result) throw new Error('Empty AI response.')
  return body.result.result
}

function fetchAi(
  idToken: string,
  mode: string,
  input: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  // One controller drives both the timeout abort and the caller's
  // cancellation signal (unmount / new send). AbortSignal.any() isn't
  // reliable in Hermes/RN 0.81, so we forward the caller's signal manually.
  const controller = new AbortController()
  if (signal?.aborted) controller.abort()
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  const timeout = setTimeout(() => controller.abort(), AI_FETCH_TIMEOUT_MS)
  return fetch(AI_INFER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data: { mode, input } }),
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', onAbort)
  })
}

/** Breaks a single to-do into 3–6 concrete steps. */
export async function suggestSubtasks(
  input: BreakdownInput,
  signal?: AbortSignal,
): Promise<BreakdownResult> {
  return callAiInfer<BreakdownResult>('breakdown-subtasks', input, signal)
}

/**
 * Asks the server to pick a grocery department for a single item, or
 * suggest a new one if nothing in the list fits. Returns all-null
 * when the model isn't confident — caller should leave the item in
 * Uncategorized. Same null-on-failure contract for network/quota
 * errors so the caller can ignore failures silently.
 */
export async function classifyGroceryDept(input: ClassifyDeptInput): Promise<ClassifyDeptResult> {
  try {
    return await callAiInfer<ClassifyDeptResult>('classify-grocery-dept', input)
  } catch (err) {
    // Surface 429s + network errors to the console so they don't
    // disappear into the all-null fallback. Catching at all is
    // intentional — this is an ambient feature, not a load-bearing
    // call, so we never want it to break the compose UX.
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('429') || msg.includes('rate')) {
      console.warn('[ai] classifyGroceryDept rate-limited — store auto-select skipped')
    } else {
      console.warn('[ai] classifyGroceryDept failed:', msg)
    }
    return { groupId: null, newGroupLabel: null, storeHint: null, recommendedStores: [] }
  }
}

/**
 * Reads a typed to-do title and suggests field values (category,
 * priority, dueDate) the user can tap to apply. Every field is
 * independently nullable — the model is told to be conservative.
 * Same null-on-failure contract: any error returns all-null so the
 * caller never has to try/catch for an ambient feature.
 */
export async function suggestTodoFields(
  input: SuggestFieldsInput,
  signal?: AbortSignal,
): Promise<SuggestFieldsResult> {
  try {
    const res = await callAiInfer<SuggestFieldsResult>('suggest-todo-fields', input, signal)
    // Drop a recurrence-cadence-as-reminder mis-parse (pure helper in core,
    // unit-tested there).
    return { ...res, reminder: normalizeSuggestedReminder(res.recurrence, res.reminder) }
  } catch {
    // Any failure (incl. an aborted request on unmount/supersede) resolves
    // to the all-null no-op — this is an ambient feature, never surfaced.
    return { category: null, newCategoryLabel: null, priority: null, dueDate: null, recurrence: null, reminder: null, cleanedText: null }
  }
}

/**
 * Given a newly added store + the user's current items, returns the
 * subset of item ids that would typically be available at that
 * store. Caller decides whether/how to apply (auto-link silently,
 * snackbar with Undo, etc.). Empty array on failure — silent no-op
 * is the right behavior for an ambient assist.
 */
export async function linkStoreToItems(input: LinkStoreInput): Promise<LinkStoreResult> {
  try {
    return await callAiInfer<LinkStoreResult>('link-store-to-items', input)
  } catch {
    return { linkedItemIds: [] }
  }
}
