/**
 * Platform-pure wire contract for the `aiInfer` Cloud Function.
 *
 * These are the CLIENT-side request/response shapes shared by web + mobile.
 * The server owns its own copies (web/functions/src/aiInfer*.ts) because the
 * functions package is deployed standalone with its own tsconfig and cannot
 * import core/. A text-parity test (mobile/src/__tests__/aiInfer-contract-
 * parity.test.ts) guards these against drift with the server output types —
 * keep the field shapes here in lockstep with:
 *   - aiInferBreakdown.ts      (BreakdownInput / BreakdownOutput)
 *   - aiInferClassifyDept.ts   (ClassifyDeptInput / ClassifyDeptOutput)
 *   - aiInferSuggestFields.ts  (SuggestFieldsInput / SuggestFieldsOutput)
 *   - aiInferLinkStore.ts      (LinkStoreInput / LinkStoreOutput)
 *
 * No React, Firebase, or platform deps — this stays importable from both apps.
 */

/** Envelope the callable function wraps every result in. */
export interface InferEnvelope<R> {
  result: R
  usage: { input: number; output: number }
  model: string
}

export interface BreakdownInput {
  title: string
  notes?: string
}

export interface BreakdownResult {
  subtasks: Array<{ text: string }>
}

export interface ClassifyDeptInput {
  text: string
  departments: Array<{ id: string; label: string }>
  /** Existing stores in the user's profile. Sent so the model can
   * decide isNew for a detected store mention. */
  stores?: string[]
}

export interface ClassifyDeptResult {
  groupId: string | null
  /** Set when the AI proposes a department label that doesn't exist
   * in the user's list. The caller should confirm with the user
   * before creating + assigning. Mutually exclusive with groupId. */
  newGroupLabel: string | null
  /** Set when the text explicitly mentions a store ("from Target",
   * "at Costco"). isNew indicates whether the name matches an
   * existing store in the user's profile (case-insensitive). */
  storeHint: { name: string; isNew: boolean } | null
  /** Up-to-3 stores from the user's existing configured list that
   * typically carry this item. Names are guaranteed to exist in
   * the input `stores` (server post-process filters out anything
   * unrecognized) and use the user's canonical casing. Empty when:
   * storeHint is non-null, no stores are configured, or the item
   * is too generic / niche to recommend confidently. */
  recommendedStores: string[]
}

export interface SuggestFieldsInput {
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
  /** Title with date/time/recurrence/reminder phrases removed, so the
   * title isn't redundant once those become structured fields. Null when
   * nothing temporal was found. */
  cleanedText: string | null
}

export interface LinkStoreInput {
  storeName: string
  items: Array<{ id: string; text: string }>
}

export interface LinkStoreResult {
  /** Subset of input ids the server judges would be available at
   * the new store. Already filtered server-side against the input
   * items so every id is guaranteed to exist in the user's items
   * list at dispatch time. */
  linkedItemIds: string[]
}

/**
 * Cold-start retry delay. The aiInfer / agentChat functions run with
 * minInstances:0, so the first request after idle hits a cold start
 * (~1-2s); a follow-up landing in that window can be 429'd by Cloud
 * Run's autoscaler before reaching our handler. One retry after this
 * pause absorbs the gap without adding standing cost. Only transient
 * 429s are retried — a hard quota cap (RESOURCE_EXHAUSTED) never is.
 */
export const COLD_START_RETRY_MS = 1500
