import auth from '@react-native-firebase/auth'

/**
 * Client wrappers for the aiInfer Cloud Function. Same pattern as
 * useMochiAgent: raw HTTPS POST against the callable URL with the
 * user's Firebase ID token in the Authorization header. Avoids pulling
 * in @react-native-firebase/functions just for one call.
 *
 * Server contract (callable functions): body wrapped in {data: ...},
 * response wrapped in {result: ...}.
 */

const AI_INFER_URL =
  'https://us-central1-my-todos-1b079.cloudfunctions.net/aiInfer'

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

async function callAiInfer<R>(mode: string, input: unknown): Promise<R> {
  const user = auth().currentUser
  if (!user) throw new Error('Sign in to use AI assistance.')
  const idToken = await user.getIdToken()
  const res = await fetch(AI_INFER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data: { mode, input } }),
  })
  if (!res.ok) {
    throw new Error(`AI request failed (${res.status}).`)
  }
  const body = (await res.json()) as { result?: InferEnvelope<R>; error?: { message?: string } }
  if (body.error) throw new Error(body.error.message ?? 'AI request failed.')
  if (!body.result) throw new Error('Empty AI response.')
  return body.result.result
}

/** Breaks a single to-do into 3–6 concrete steps. */
export async function suggestSubtasks(input: BreakdownInput): Promise<BreakdownResult> {
  return callAiInfer<BreakdownResult>('breakdown-subtasks', input)
}
