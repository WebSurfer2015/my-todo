/**
 * Platform-pure wire contract for the `aiInfer` Cloud Function.
 *
 * These are the CLIENT-side request/response shapes shared by web + mobile.
 * The server owns its own copies (functions/src/aiInfer*.ts) because the
 * functions package is deployed standalone with its own tsconfig and cannot
 * import core/. A text-parity test (mobile/src/__tests__/aiInfer-contract-
 * parity.test.ts) guards these against drift with the server output types —
 * keep the field shapes here in lockstep with:
 *   - aiInferBreakdown.ts      (BreakdownInput / BreakdownOutput)
 *   - aiInferClassifyDept.ts   (ClassifyDeptInput / ClassifyDeptOutput)
 *   - aiInferSuggestFields.ts  (SuggestFieldsInput / SuggestFieldsOutput)
 *   - aiInferLinkStore.ts      (LinkStoreInput / LinkStoreOutput)
 *
 * It also owns the CLIENT copy of the agentChat `ProposedOperation` union
 * (server: functions/src/agentTools.ts), guarded by mobile/src/__tests__/
 * proposedOperation-parity.test.ts, so core's pure op planner
 * (logic/mochiOps.ts) can type against it.
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

// ---------------------------------------------------------------------------
// agentChat (Ask Mochi) — proposed operations
// ---------------------------------------------------------------------------

export type AgentPriority = 'high' | 'medium' | 'low'

/** Mirrors the server's AgentRecurrence (agentTools.ts) — the safe subset
 * the agent can propose. The client maps this onto the real Recurrence. */
export interface AgentRecurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval?: number
  byWeekday?: number[]
}

/** Mirrors the server's AgentReminder. `at` is a local ISO datetime; the
 * client mints the stable `id` on apply. */
export interface AgentReminder {
  at: string
  offsetMinutes?: number
  intervalMinutes?: number
}

/**
 * Mirrors the server's ProposedOperation union (functions/src/
 * agentTools.ts). Keep in lockstep — the server validates + returns these,
 * the client applies them after the user confirms.
 *
 * `newCategoryLabel` (createTodo / editTodo) names a category being created
 * in the SAME turn — the client resolves it to that category's id on apply.
 * `editTodo.dueDate: ''` means "clear the date" (the server only sends it
 * when the user asked to clear). `pickTodos.totalMatches` is how many to-dos
 * matched in all, when more matched than the candidates listed.
 */
export type ProposedOperation =
  | {
      kind: 'createTodo'
      args: {
        text: string
        dueDate?: string
        priority?: AgentPriority
        category?: string
        newCategoryLabel?: string
        notes?: string
        recurrence?: AgentRecurrence
        reminders?: AgentReminder[]
      }
    }
  | {
      kind: 'editTodo'
      args: {
        todoId: string
        text?: string
        dueDate?: string
        priority?: AgentPriority
        category?: string
        newCategoryLabel?: string
        notes?: string
        recurrence?: AgentRecurrence
        reminders?: AgentReminder[]
      }
    }
  | {
      kind: 'addSteps'
      args: { todoId: string; steps: Array<{ text: string }> }
    }
  | {
      kind: 'markDone'
      args: { todoId: string }
    }
  | {
      kind: 'createCategory'
      args: { label: string; color?: string; icon?: string }
    }
  | {
      kind: 'createStore'
      args: { name: string }
    }
  | {
      kind: 'addGroceryItem'
      args: { text: string; stores?: string[]; groupId?: string }
    }
  | {
      kind: 'deleteTodo'
      args: { todoId: string }
    }
  | {
      kind: 'deleteGroceryItem'
      args: { groceryId: string }
    }
  | {
      kind: 'pickTodos'
      args: {
        action: 'delete' | 'markDone' | 'edit' | 'addSteps'
        todoIds: string[]
        query?: string
        totalMatches?: number
        edit?: {
          text?: string
          dueDate?: string
          priority?: AgentPriority
          category?: string
          notes?: string
          recurrence?: AgentRecurrence
          reminders?: AgentReminder[]
        }
        steps?: Array<{ text: string }>
      }
    }
  | {
      kind: 'editGroceryItem'
      args: {
        groceryId: string
        text?: string
        stores?: string[]
        groupId?: string
      }
    }
  | {
      kind: 'editCategory'
      args: { categoryId: string; label?: string; color?: string; icon?: string }
    }
  | {
      kind: 'deleteCategory'
      args: { categoryId: string }
    }
  | {
      kind: 'setGroceryChecked'
      args: { groceryId: string; checked: boolean }
    }
  | {
      kind: 'renameStore'
      args: { from: string; to: string }
    }
  | {
      kind: 'deleteStore'
      args: { name: string }
    }
  | {
      kind: 'skipTodo'
      args: { todoId: string; scope?: 'one' | 'series' }
    }
  | {
      kind: 'markUndone'
      args: { todoId: string }
    }
  | {
      kind: 'deferOverdue'
      args: { dueDate: string }
    }
  | {
      kind: 'restoreTodo'
      args: { todoId: string }
    }
  | {
      kind: 'subtaskAction'
      args: {
        todoId: string
        subtaskText: string
        action: 'complete' | 'uncomplete' | 'remove' | 'rename'
        newText?: string
      }
    }

/** The op of one kind, e.g. `OpOf<'pickTodos'>`. */
export type OpOf<K extends ProposedOperation['kind']> = Extract<ProposedOperation, { kind: K }>
