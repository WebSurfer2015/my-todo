/**
 * NOTE: This file is intentionally a near-duplicate of
 * `core/src/agentTools.ts`. The mobile client also imports the same
 * shape. Phase 0 keeps a server-side copy for tsc rootDir simplicity;
 * if/when we land a build step that lets functions import from core
 * directly, drop this file and re-import.
 */

export interface AgentTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export type Priority = 'high' | 'medium' | 'low'

export type ProposedOperation = {
  kind: 'createTodo'
  args: {
    text: string
    dueDate?: string
    priority?: Priority
    category?: string
    notes?: string
  }
}

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
        text: { type: 'string', maxLength: 4096 },
        dueDate: { type: 'string', pattern: '^(\\d{4}-\\d{2}-\\d{2})?$' },
        priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        category: { type: 'string' },
        notes: { type: 'string', maxLength: 8000 },
      },
      required: ['text'],
    },
  },
]

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
