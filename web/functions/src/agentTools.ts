/**
 * Tool definitions + validator for the Mochi agent. SINGLE SOURCE OF TRUTH
 * for the SERVER: the agentChat Cloud Function (index.ts) imports AGENT_TOOLS
 * (to describe tools to Claude) and validateOperation (to guard the
 * tool_use response before returning it). The functions package can't
 * import core/ (its tsconfig rootDir is `src` and it deploys standalone),
 * so this lives here, NOT in core. The mobile client mirrors this union in
 * its own ProposedOperation type (see useMochiAgent); a parity test
 * (mobile/src/__tests__/proposedOperation-parity.test.ts) guards the two
 * copies against drift. Tested directly by web/src/agentTools.test.ts
 * (imports THIS file), so the deployed validator is what's covered.
 * (Previously duplicated in core/src/ports/agentTools.ts, which the test
 * pointed at — that orphan was deleted to remove the test-vs-deployed
 * drift risk.)
 *
 * Tool set today (proposal-style — the server validates + returns the
 * args; the client applies after user confirms). All ops are LIVE:
 * agentChat offers the full set and the mobile client applies each via the
 * same store mutations a manual edit uses.
 *   - createTodo        — add a new task
 *   - editTodo          — patch fields on an existing task
 *   - addSteps          — append subtasks to a task
 *   - markDone          — flip a task to done
 *   - deleteTodo        — remove an existing task (or its whole series)
 *   - deleteGroceryItem — remove an item from the shopping list
 *   - createCategory / createStore / addGroceryItem
 *
 * The two delete ops honor Sagely's "every destructive action is reversible
 * or confirmed" rule on the CLIENT: a delete is never auto-applied — it
 * needs an explicit Confirm — and a deleted to-do is routed through TRASH
 * (30-day retention), not a permanent purge. markDone stays the path for
 * COMPLETING a task; delete is for removing one the user no longer wants.
 *
 * Intentionally NOT in this set:
 *   - findTodo: needs server-side read of the user's Firestore state,
 *     which is a different architectural pattern. Deferred until
 *     agentChat learns to fetch user data inside the tool loop.
 */

// Inlined here because the CF tsconfig rootDir is `src`, so we can't
// reach core/src/types.ts. Keep this in lockstep with that file.
type Priority = 'high' | 'medium' | 'low'

/** JSON-schema-ish input shape for one tool. Loose `unknown` for the
 * Anthropic SDK boundary; the server validates shapes before forwarding
 * to the client. */
export interface AgentTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

/** Recurrence the agent can propose — a safe subset of the app's full
 * Recurrence type (no bySetPos/endDate; those are too ambiguous from
 * natural language). The client maps this onto the real Recurrence. */
export interface AgentRecurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  /** Every N periods (default 1). */
  interval?: number
  /** 0=Sunday..6=Saturday — for weekly ("every Mon/Wed"). */
  byWeekday?: number[]
}

/** Reminder the agent can propose. `at` is a local ISO datetime
 * (yyyy-mm-ddThh:mm). The CLIENT mints the stable `id` on apply — the
 * model can't produce reliable UUIDs. */
export interface AgentReminder {
  at: string
  /** "Before due" mode: minutes before the due datetime. The client keeps
   * `at` in sync + rebases per recurrence occurrence. */
  offsetMinutes?: number
  /** Repeat every N minutes after `at` (optional). */
  intervalMinutes?: number
}

/** What the client receives from the server: a validated operation
 * ready to apply via the existing store mutations. Each variant maps
 * 1:1 to a tool name. */
export type ProposedOperation =
  | {
      kind: 'createTodo'
      args: {
        text: string
        dueDate?: string
        priority?: Priority
        category?: string
        notes?: string
        recurrence?: AgentRecurrence
        reminders?: AgentReminder[]
      }
    }
  | {
      kind: 'editTodo'
      args: {
        todoId: string
        /** Each field is optional — the client patches only the
         * provided keys, leaving others untouched. At least one
         * field must be present (validator enforces). */
        text?: string
        dueDate?: string
        priority?: Priority
        category?: string
        notes?: string
        recurrence?: AgentRecurrence
        reminders?: AgentReminder[]
      }
    }
  | {
      kind: 'addSteps'
      args: {
        todoId: string
        /** 1-8 steps to append. Each step's text is capped at 80 chars
         * (matches breakdown-subtasks parser cap so the UX feels
         * consistent). */
        steps: Array<{ text: string }>
      }
    }
  | {
      kind: 'markDone'
      args: {
        todoId: string
      }
    }
  | {
      kind: 'createCategory'
      args: {
        /** Display label for the new category (e.g. "Garden"). */
        label: string
        /** Optional hex color (#rrggbb). The client picks a palette
         * default when omitted. */
        color?: string
        /** Optional icon key. The client defaults to 'tag'. */
        icon?: string
      }
    }
  | {
      kind: 'createStore'
      args: {
        /** Name of the new grocery store (e.g. "Costco"). */
        name: string
      }
    }
  | {
      kind: 'addGroceryItem'
      args: {
        /** Item text (e.g. "milk"). */
        text: string
        /** Optional store names to tag the item with. */
        stores?: string[]
        /** Optional grocery department/group id from context. Omit to let
         * the app auto-infer the department. */
        groupId?: string
      }
    }
  | {
      kind: 'deleteTodo'
      args: {
        /** The id of the existing to-do to delete, from the context list.
         * The client routes the delete through trash (reversible) and, for a
         * recurring series, asks whether to drop one occurrence or all. */
        todoId: string
      }
    }
  | {
      kind: 'deleteGroceryItem'
      args: {
        /** The id of the existing shopping item to remove, from the context
         * shopping-list. */
        groceryId: string
      }
    }

// ─── Shared cap constants ──────────────────────────────────────────
const MAX_TEXT_LEN = 4096
const MAX_NOTES_LEN = 8000
const MAX_STEP_LEN = 80
const MAX_STEPS = 8
const MAX_TODO_ID_LEN = 64
const MAX_REMINDERS = 5
const MAX_CATEGORY_LABEL_LEN = 40
const MAX_ICON_KEY_LEN = 40
const MAX_STORE_NAME_LEN = 64
const MAX_ITEM_STORES = 8
const MAX_GROUP_ID_LEN = 64
const MAX_GROCERY_ID_LEN = 64

// Shared JSON-schema fragments for recurrence + reminders (used by both
// createTodo and editTodo) so the model gets one consistent description.
const RECURRENCE_SCHEMA = {
  type: 'object',
  description:
    "Set when the user wants the task to REPEAT (e.g. 'every day', 'every " +
    "Monday and Wednesday', 'weekly'). Omit for one-off tasks.",
  properties: {
    freq: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly'] },
    interval: {
      type: 'integer',
      minimum: 1,
      description: "Every N periods (e.g. interval 2 + freq weekly = every other week). Default 1.",
    },
    byWeekday: {
      type: 'array',
      description: 'Weekdays for weekly recurrence: 0=Sunday .. 6=Saturday.',
      items: { type: 'integer', minimum: 0, maximum: 6 },
    },
  },
  required: ['freq'],
} as const

const REMINDERS_SCHEMA = {
  type: 'array',
  description:
    "Set when the user wants to be REMINDED (e.g. 'remind me at 9am', 'ping " +
    "me an hour before'). Resolve times against `today` and return a local " +
    "ISO datetime. Omit when no reminder was requested.",
  maxItems: MAX_REMINDERS,
  items: {
    type: 'object',
    properties: {
      at: {
        type: 'string',
        description:
          'Local ISO datetime yyyy-mm-ddThh:mm (e.g. 2026-06-07T09:00). For a ' +
          '"before due" reminder, compute it as the due moment minus the offset.',
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}',
      },
      offsetMinutes: {
        type: 'integer',
        minimum: 1,
        description:
          'Optional "before due" offset: minutes before the due datetime ' +
          '(e.g. 60 for "an hour before"). Set both this and the computed `at`.',
      },
      intervalMinutes: {
        type: 'integer',
        minimum: 1,
        description: 'Optional: repeat every N minutes after `at`.',
      },
    },
    required: ['at'],
  },
} as const

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'createTodo',
    description:
      "Add a new to-do for the user. Use when they want to capture a single new task. " +
      "Resolve relative dates ('Friday', 'next week', 'tomorrow') against the `today` " +
      "field in context and return them as ISO yyyy-mm-dd. Leave dueDate empty when the " +
      "user didn't mention a date. Map category names case-insensitively to one of the " +
      "user's existing categories (from context); leave category empty if no clean match.",
    input_schema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The to-do text. Keep concise and verbatim where possible.',
          maxLength: MAX_TEXT_LEN,
        },
        dueDate: {
          type: 'string',
          description:
            "ISO yyyy-mm-dd local date, or empty string when no date was mentioned.",
          pattern: '^(\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2})?)?$',
        },
        priority: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: "Default 'medium' when the user didn't signal urgency.",
        },
        category: {
          type: 'string',
          description:
            'Category id (not display label) from the user-provided list, or empty.',
        },
        notes: {
          type: 'string',
          description:
            'Optional free-form context the user mentioned (e.g. "smallest first step: open the doc"). Keep under 8000 chars.',
          maxLength: MAX_NOTES_LEN,
        },
        recurrence: RECURRENCE_SCHEMA,
        reminders: REMINDERS_SCHEMA,
      },
      required: ['text'],
    },
  },
  {
    name: 'editTodo',
    description:
      "Edit fields on an EXISTING to-do. Use when the user asks to change a property " +
      "on a specific task they're referring to in the conversation. The context will " +
      "include a list of recent todos with their ids — pick the matching todoId. " +
      "Only include fields the user actually asked to change; omit the rest. At least " +
      "one field besides todoId must be provided.",
    input_schema: {
      type: 'object',
      properties: {
        todoId: {
          type: 'string',
          description: 'The id of the existing to-do from the user-provided context list.',
        },
        text: {
          type: 'string',
          description: 'New text for the to-do. Omit to leave unchanged.',
          maxLength: MAX_TEXT_LEN,
        },
        dueDate: {
          type: 'string',
          description:
            "ISO yyyy-mm-dd local date. Resolve relative phrases against `today`. " +
            "Empty string CLEARS the existing due date.",
          pattern: '^(\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2})?)?$',
        },
        priority: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Omit to leave the existing priority unchanged.',
        },
        category: {
          type: 'string',
          description: 'Category id from the user-provided list. Omit to leave unchanged.',
        },
        notes: {
          type: 'string',
          description: 'New notes text. Empty string CLEARS the existing notes.',
          maxLength: MAX_NOTES_LEN,
        },
        recurrence: RECURRENCE_SCHEMA,
        reminders: REMINDERS_SCHEMA,
      },
      required: ['todoId'],
    },
  },
  {
    name: 'addSteps',
    description:
      "Append subtasks (steps) to an existing to-do. Use when the user asks to break " +
      "down a task they've already created, or to add specific concrete steps to one. " +
      "1-8 steps, each one a short imperative phrase under 80 characters.",
    input_schema: {
      type: 'object',
      properties: {
        todoId: {
          type: 'string',
          description: 'The id of the existing to-do from the user-provided context list.',
        },
        steps: {
          type: 'array',
          description: '1-8 steps to add, in order. Each step is one short action.',
          minItems: 1,
          maxItems: MAX_STEPS,
          items: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Short imperative phrase, e.g. "Email landlord about lease".',
                maxLength: MAX_STEP_LEN,
              },
            },
            required: ['text'],
          },
        },
      },
      required: ['todoId', 'steps'],
    },
  },
  {
    name: 'markDone',
    description:
      "Mark an existing to-do as done. Use when the user clearly indicates they've " +
      "completed a task (\"I finished the report\", \"done with grocery\"). The " +
      "client applies an undoable toggle, so a misread can be reversed — but only " +
      "use this when the user's intent is clearly completion, not just discussion.",
    input_schema: {
      type: 'object',
      properties: {
        todoId: {
          type: 'string',
          description: 'The id of the existing to-do from the user-provided context list.',
        },
      },
      required: ['todoId'],
    },
  },
  {
    name: 'createCategory',
    description:
      "Create a new to-do category. Use ONLY after the user has agreed to create a " +
      "category that doesn't already exist in the context list. Match existing category " +
      "labels case-insensitively first; never create a duplicate of one already present.",
    input_schema: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description: 'Display label for the new category, verbatim from the user.',
          maxLength: MAX_CATEGORY_LABEL_LEN,
        },
        color: {
          type: 'string',
          description: 'Optional hex color #rrggbb. Omit to let the app pick one.',
          pattern: '^#[0-9a-fA-F]{6}$',
        },
        icon: {
          type: 'string',
          description: 'Optional icon key. Omit to let the app default it.',
          maxLength: MAX_ICON_KEY_LEN,
        },
      },
      required: ['label'],
    },
  },
  {
    name: 'createStore',
    description:
      "Create a new grocery store. Use ONLY after the user has agreed to create a store " +
      "that isn't already in the context store list. Match existing store names " +
      "case-insensitively first; never create a duplicate.",
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the new grocery store, verbatim from the user.',
          maxLength: MAX_STORE_NAME_LEN,
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'addGroceryItem',
    description:
      "Add an item to the user's shopping list. Use when the user wants to add something " +
      "to buy (e.g. 'add milk to my shopping list'). Optionally tag it with store names " +
      "the user mentioned (match the context store list case-insensitively). Leave " +
      "groupId empty unless the user explicitly named a department from the context list — " +
      "the app auto-sorts items into departments.",
    input_schema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The grocery item, concise and verbatim (e.g. "milk").',
          maxLength: MAX_TEXT_LEN,
        },
        stores: {
          type: 'array',
          description: 'Optional store names to tag the item with, from the context list.',
          maxItems: MAX_ITEM_STORES,
          items: { type: 'string', maxLength: MAX_STORE_NAME_LEN },
        },
        groupId: {
          type: 'string',
          description: 'Optional grocery department/group id from the context list.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'deleteTodo',
    description:
      "Delete an EXISTING to-do the user wants to remove (\"delete the dentist task\", " +
      "\"remove buy paint\", \"get rid of that\"). Pick the matching todoId from the " +
      "context to-do list. Use this ONLY for removal — when the user has COMPLETED a " +
      "task, use markDone instead. The client confirms before deleting and routes it " +
      "through trash, so it's reversible; for a recurring task it asks whether to drop " +
      "one occurrence or the whole series.",
    input_schema: {
      type: 'object',
      properties: {
        todoId: {
          type: 'string',
          description: 'The id of the existing to-do from the user-provided context list.',
        },
      },
      required: ['todoId'],
    },
  },
  {
    name: 'deleteGroceryItem',
    description:
      "Remove an item from the user's shopping list (\"delete milk from shopping\", " +
      "\"take eggs off the list\"). Pick the matching groceryId from the context " +
      "shopping-list. The client confirms before removing it.",
    input_schema: {
      type: 'object',
      properties: {
        groceryId: {
          type: 'string',
          description: 'The id of the existing shopping item from the context shopping-list.',
        },
      },
      required: ['groceryId'],
    },
  },
]

/** Sanitize a proposed recurrence into the safe agent subset, or
 * undefined if malformed. */
function validateRecurrence(raw: unknown): AgentRecurrence | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (r.freq !== 'daily' && r.freq !== 'weekly' && r.freq !== 'monthly' && r.freq !== 'yearly') {
    return undefined
  }
  const out: AgentRecurrence = { freq: r.freq }
  if (typeof r.interval === 'number' && Number.isFinite(r.interval) && r.interval >= 1) {
    out.interval = Math.floor(r.interval)
  }
  if (Array.isArray(r.byWeekday)) {
    const days = r.byWeekday
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 6)
      .map((n) => Math.floor(n))
    const unique = Array.from(new Set(days)).sort((x, y) => x - y)
    if (unique.length > 0) out.byWeekday = unique
  }
  return out
}

/** Sanitize a proposed reminders array (drops malformed entries; caps
 * count). Undefined when none are valid. */
function validateReminders(raw: unknown): AgentReminder[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: AgentReminder[] = []
  for (const item of raw.slice(0, MAX_REMINDERS)) {
    if (!item || typeof item !== 'object') continue
    const at = (item as { at?: unknown }).at
    if (typeof at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at)) continue
    const rem: AgentReminder = { at }
    const off = (item as { offsetMinutes?: unknown }).offsetMinutes
    if (typeof off === 'number' && Number.isFinite(off) && off >= 1) {
      rem.offsetMinutes = Math.floor(off)
    }
    const iv = (item as { intervalMinutes?: unknown }).intervalMinutes
    if (typeof iv === 'number' && Number.isFinite(iv) && iv >= 1) {
      rem.intervalMinutes = Math.floor(iv)
    }
    out.push(rem)
  }
  return out.length > 0 ? out : undefined
}

/** Server-side validator. Returns the cleaned-up op or null on garbage
 * input. Defensive — Anthropic occasionally returns extra keys or
 * mistyped fields even with tool_use; we don't want to forward those
 * to the client.
 *
 * For tools that reference an existing todo (editTodo, addSteps,
 * markDone), `knownTodoIds` is required so the validator can drop a
 * hallucinated id before the proposal reaches the client. Pass an
 * empty Set if the call site doesn't have it yet — that just means
 * every id will be rejected (safe).
 */
export function validateOperation(
  name: string,
  args: unknown,
  knownCategoryIds: ReadonlySet<string>,
  knownTodoIds: ReadonlySet<string> = new Set(),
  knownGroceryGroupIds: ReadonlySet<string> = new Set(),
  knownGroceryIds: ReadonlySet<string> = new Set(),
): ProposedOperation | null {
  if (!args || typeof args !== 'object') return null
  const a = args as Record<string, unknown>

  if (name === 'createTodo') {
    if (typeof a.text !== 'string' || a.text.trim().length === 0) return null
    const op: ProposedOperation = {
      kind: 'createTodo',
      args: { text: a.text.trim().slice(0, MAX_TEXT_LEN) },
    }
    if (typeof a.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(a.dueDate)) {
      op.args.dueDate = a.dueDate
    }
    if (a.priority === 'high' || a.priority === 'medium' || a.priority === 'low') {
      op.args.priority = a.priority
    }
    if (typeof a.category === 'string' && knownCategoryIds.has(a.category)) {
      op.args.category = a.category
    }
    if (typeof a.notes === 'string' && a.notes.length > 0) {
      op.args.notes = a.notes.slice(0, MAX_NOTES_LEN)
    }
    const rec = validateRecurrence(a.recurrence)
    if (rec) op.args.recurrence = rec
    const rems = validateReminders(a.reminders)
    if (rems) op.args.reminders = rems
    return op
  }

  if (name === 'editTodo') {
    if (
      typeof a.todoId !== 'string' ||
      a.todoId.length === 0 ||
      a.todoId.length > MAX_TODO_ID_LEN ||
      !knownTodoIds.has(a.todoId)
    ) {
      return null
    }
    const op: ProposedOperation = {
      kind: 'editTodo',
      args: { todoId: a.todoId },
    }
    let hasField = false
    if (typeof a.text === 'string' && a.text.trim().length > 0) {
      op.args.text = a.text.trim().slice(0, MAX_TEXT_LEN)
      hasField = true
    }
    if (typeof a.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(a.dueDate)) {
      op.args.dueDate = a.dueDate
      hasField = true
    } else if (a.dueDate === '') {
      // Explicit empty string means "clear the date" — preserve that
      // signal so the client can distinguish "no change" from "clear".
      op.args.dueDate = ''
      hasField = true
    }
    if (a.priority === 'high' || a.priority === 'medium' || a.priority === 'low') {
      op.args.priority = a.priority
      hasField = true
    }
    if (typeof a.category === 'string' && knownCategoryIds.has(a.category)) {
      op.args.category = a.category
      hasField = true
    }
    if (typeof a.notes === 'string') {
      // Including empty string here so user can clear notes.
      op.args.notes = a.notes.slice(0, MAX_NOTES_LEN)
      hasField = true
    }
    const editRec = validateRecurrence(a.recurrence)
    if (editRec) {
      op.args.recurrence = editRec
      hasField = true
    }
    const editRems = validateReminders(a.reminders)
    if (editRems) {
      op.args.reminders = editRems
      hasField = true
    }
    // Reject when no actual change was proposed.
    if (!hasField) return null
    return op
  }

  if (name === 'addSteps') {
    if (
      typeof a.todoId !== 'string' ||
      a.todoId.length === 0 ||
      a.todoId.length > MAX_TODO_ID_LEN ||
      !knownTodoIds.has(a.todoId)
    ) {
      return null
    }
    if (!Array.isArray(a.steps) || a.steps.length === 0) return null
    const steps: Array<{ text: string }> = []
    for (const raw of a.steps.slice(0, MAX_STEPS)) {
      if (!raw || typeof raw !== 'object') continue
      const t = (raw as { text?: unknown }).text
      if (typeof t !== 'string') continue
      const trimmed = t.trim().slice(0, MAX_STEP_LEN)
      if (trimmed.length === 0) continue
      steps.push({ text: trimmed })
    }
    if (steps.length === 0) return null
    return { kind: 'addSteps', args: { todoId: a.todoId, steps } }
  }

  if (name === 'markDone') {
    if (
      typeof a.todoId !== 'string' ||
      a.todoId.length === 0 ||
      a.todoId.length > MAX_TODO_ID_LEN ||
      !knownTodoIds.has(a.todoId)
    ) {
      return null
    }
    return { kind: 'markDone', args: { todoId: a.todoId } }
  }

  if (name === 'createCategory') {
    if (typeof a.label !== 'string' || a.label.trim().length === 0) return null
    const op: ProposedOperation = {
      kind: 'createCategory',
      args: { label: a.label.trim().slice(0, MAX_CATEGORY_LABEL_LEN) },
    }
    if (typeof a.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(a.color)) {
      op.args.color = a.color
    }
    if (typeof a.icon === 'string' && a.icon.trim().length > 0) {
      op.args.icon = a.icon.trim().slice(0, MAX_ICON_KEY_LEN)
    }
    return op
  }

  if (name === 'createStore') {
    if (typeof a.name !== 'string' || a.name.trim().length === 0) return null
    return {
      kind: 'createStore',
      args: { name: a.name.trim().slice(0, MAX_STORE_NAME_LEN) },
    }
  }

  if (name === 'addGroceryItem') {
    if (typeof a.text !== 'string' || a.text.trim().length === 0) return null
    const op: ProposedOperation = {
      kind: 'addGroceryItem',
      args: { text: a.text.trim().slice(0, MAX_TEXT_LEN) },
    }
    if (Array.isArray(a.stores)) {
      const stores = a.stores
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .slice(0, MAX_ITEM_STORES)
        .map((s) => s.trim().slice(0, MAX_STORE_NAME_LEN))
      if (stores.length > 0) op.args.stores = stores
    }
    if (
      typeof a.groupId === 'string' &&
      a.groupId.length <= MAX_GROUP_ID_LEN &&
      knownGroceryGroupIds.has(a.groupId)
    ) {
      op.args.groupId = a.groupId
    }
    return op
  }

  if (name === 'deleteTodo') {
    if (
      typeof a.todoId !== 'string' ||
      a.todoId.length === 0 ||
      a.todoId.length > MAX_TODO_ID_LEN ||
      !knownTodoIds.has(a.todoId)
    ) {
      return null
    }
    return { kind: 'deleteTodo', args: { todoId: a.todoId } }
  }

  if (name === 'deleteGroceryItem') {
    if (
      typeof a.groceryId !== 'string' ||
      a.groceryId.length === 0 ||
      a.groceryId.length > MAX_GROCERY_ID_LEN ||
      !knownGroceryIds.has(a.groceryId)
    ) {
      return null
    }
    return { kind: 'deleteGroceryItem', args: { groceryId: a.groceryId } }
  }

  return null
}
