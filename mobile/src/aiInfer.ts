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

interface ClassifyDeptInput {
  text: string
  departments: Array<{ id: string; label: string }>
  /** Existing stores in the user's profile. Sent so the model can
   * decide isNew for a detected store mention. */
  stores?: string[]
}

interface ClassifyDeptResult {
  groupId: string | null
  /** Set when the AI proposes a department label that doesn't exist
   * in the user's list. The caller should confirm with the user
   * before creating + assigning. Mutually exclusive with groupId. */
  newGroupLabel: string | null
  /** Set when the text explicitly mentions a store ("from Target",
   * "at Costco"). isNew indicates whether the name matches an
   * existing store in the user's profile (case-insensitive). */
  storeHint: { name: string; isNew: boolean } | null
}

interface SuggestFieldsInput {
  text: string
  today: string
  categories: Array<{ id: string; label: string }>
}

export interface SuggestFieldsResult {
  category: string | null
  /** Set when the AI proposes a category label that doesn't exist
   * in the user's list. UI should confirm with the user before
   * creating + assigning. Mutually exclusive with `category`. */
  newCategoryLabel: string | null
  priority: 'high' | 'medium' | 'low' | null
  dueDate: string | null
  /** Basic recurrence — frequency, optional byWeekday filter, and
   * optional end date. Caller constructs the full Recurrence on
   * apply; user can refine bySetPos via the Repeat sub-view. */
  recurrence: {
    freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
    /** Days of week (0=Sun..6=Sat). Meaningful for weekly only
     * in this v1 ("every mon and tue" → [1,2]). */
    byWeekday?: number[]
    endDate?: string
  } | null
  /** Reminder spec. One-shot when no intervalMinutes; recurring
   * when interval+until set. Null when no clock time mentioned. */
  reminder: {
    at: string
    intervalMinutes?: number
    until?: string
  } | null
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
  } catch {
    return { groupId: null, newGroupLabel: null, storeHint: null }
  }
}

/**
 * Reads a typed to-do title and suggests field values (category,
 * priority, dueDate) the user can tap to apply. Every field is
 * independently nullable — the model is told to be conservative.
 * Same null-on-failure contract: any error returns all-null so the
 * caller never has to try/catch for an ambient feature.
 */
export async function suggestTodoFields(input: SuggestFieldsInput): Promise<SuggestFieldsResult> {
  try {
    return await callAiInfer<SuggestFieldsResult>('suggest-todo-fields', input)
  } catch {
    return { category: null, newCategoryLabel: null, priority: null, dueDate: null, recurrence: null, reminder: null }
  }
}
