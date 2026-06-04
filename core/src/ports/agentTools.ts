/**
 * Tool definitions for the Mochi agent. Single source of truth — both
 * the Cloud Function (which describes them to Claude via tool_use) and
 * the mobile client (which validates + applies the returned operations)
 * import from here. Adding a new tool means: append to the AGENT_TOOLS
 * array, add its `kind` to ProposedOperation, handle it in the client's
 * apply switch.
 *
 * Tool set today (proposal-style — the server validates + returns the
 * args; the client applies after user confirms):
 *   - createTodo  — add a new task
 *   - editTodo    — patch fields on an existing task
 *   - addSteps    — append subtasks to a task
 *   - markDone    — flip a task to done
 *
 * Intentionally NOT in this set:
 *   - deleteTodo: Sagely's "every destructive action is reversible or
 *     confirmed" rule routes trash through markDone, not delete.
 *   - findTodo: needs server-side read of the user's Firestore state,
 *     which is a different architectural pattern. Deferred until
 *     agentChat learns to fetch user data inside the tool loop.
 */

import type { Priority } from '../domain/types'

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

// ─── Shared cap constants ──────────────────────────────────────────
const MAX_TEXT_LEN = 4096
const MAX_NOTES_LEN = 8000
const MAX_STEP_LEN = 80
const MAX_STEPS = 8
const MAX_TODO_ID_LEN = 64

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
          pattern: '^(\\d{4}-\\d{2}-\\d{2})?$',
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
          pattern: '^(\\d{4}-\\d{2}-\\d{2})?$',
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
]

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
): ProposedOperation | null {
  if (!args || typeof args !== 'object') return null
  const a = args as Record<string, unknown>

  if (name === 'createTodo') {
    if (typeof a.text !== 'string' || a.text.trim().length === 0) return null
    const op: ProposedOperation = {
      kind: 'createTodo',
      args: { text: a.text.trim().slice(0, MAX_TEXT_LEN) },
    }
    if (typeof a.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.dueDate)) {
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
    if (typeof a.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.dueDate)) {
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

  return null
}
