/**
 * Tool definitions for the Mochi agent. Single source of truth — both
 * the Cloud Function (which describes them to Claude via tool_use) and
 * the mobile client (which validates + applies the returned operations)
 * import from here. Adding a new tool means: append to the AGENT_TOOLS
 * array, add its `kind` to ProposedOperation, handle it in the client's
 * apply switch.
 *
 * Phase 0 ships ONLY `createTodo`. Future phases add editTodo, addSteps,
 * markDone, findTodo. Destructive ops (deleteTodo) are intentionally
 * absent — Sagely's "every destructive action is reversible or
 * confirmed" rule means we route trash through markDone, not delete.
 */

import type { Priority } from './types'

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
// Future variants:
// | { kind: 'editTodo';  args: { todoId: string; ...patch } }
// | { kind: 'addSteps';  args: { todoId: string; steps: ... } }
// | { kind: 'markDone';  args: { todoId: string } }

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
          maxLength: 4096,
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
          maxLength: 8000,
        },
      },
      required: ['text'],
    },
  },
]

/** Server-side validator. Returns the cleaned-up op or null on garbage
 * input. Defensive — Anthropic occasionally returns extra keys or
 * mistyped fields even with tool_use; we don't want to forward those
 * to the client. */
export function validateOperation(
  name: string,
  args: unknown,
  knownCategoryIds: ReadonlySet<string>,
): ProposedOperation | null {
  if (name === 'createTodo' && args && typeof args === 'object') {
    const a = args as Record<string, unknown>
    if (typeof a.text !== 'string' || a.text.trim().length === 0) return null
    const op: ProposedOperation = {
      kind: 'createTodo',
      args: { text: a.text.trim().slice(0, 4096) },
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
      op.args.notes = a.notes.slice(0, 8000)
    }
    return op
  }
  return null
}
