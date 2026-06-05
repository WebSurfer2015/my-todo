/**
 * Tests for web/functions/src/agentTools.ts — the Mochi agent's tool
 * registry + the server-side validateOperation guard, THE EXACT FILE the
 * agentChat Cloud Function executes (index.ts imports it). The validator
 * is the security boundary between Anthropic's tool_use response and the
 * client's apply path; bad input there means corrupt todos.
 *
 * Imports the functions copy directly (not a core duplicate) so green here
 * means the deployed validator is green. The functions package can't import
 * core (its tsconfig rootDir is `src` + it deploys standalone), so this
 * file is the single source of truth; vitest can still load it because
 * it's pure TS with no runtime imports.
 */
import { describe, expect, it } from 'vitest'
import {
  AGENT_TOOLS,
  validateOperation,
  type ProposedOperation,
} from '../functions/src/agentTools'

const knownCats = new Set(['home', 'work', 'school'])

const knownTodoIds = new Set(['t-1', 't-2', 't-3'])

describe('AGENT_TOOLS registry', () => {
  it('exposes the v1 proposal-style tool set', () => {
    const names = AGENT_TOOLS.map((t) => t.name)
    expect(names).toContain('createTodo')
    expect(names).toContain('editTodo')
    expect(names).toContain('addSteps')
    expect(names).toContain('markDone')
  })
  it('every tool has a name, description, and JSON-schema-shaped input', () => {
    for (const tool of AGENT_TOOLS) {
      expect(typeof tool.name).toBe('string')
      expect(tool.name.length).toBeGreaterThan(0)
      expect(typeof tool.description).toBe('string')
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool.input_schema.type).toBe('object')
      expect(typeof tool.input_schema.properties).toBe('object')
    }
  })
  it('createTodo requires text', () => {
    const t = AGENT_TOOLS.find((x) => x.name === 'createTodo')!
    expect(t.input_schema.required).toContain('text')
  })
})

describe('validateOperation — createTodo', () => {
  it('returns null for unknown tool name', () => {
    expect(validateOperation('unknown', { text: 'x' }, knownCats)).toBeNull()
  })
  it('returns null when args is not an object', () => {
    expect(validateOperation('createTodo', null, knownCats)).toBeNull()
    expect(validateOperation('createTodo', 'string', knownCats)).toBeNull()
  })
  it('returns null when text is missing / empty / whitespace', () => {
    expect(validateOperation('createTodo', {}, knownCats)).toBeNull()
    expect(validateOperation('createTodo', { text: '' }, knownCats)).toBeNull()
    expect(validateOperation('createTodo', { text: '   ' }, knownCats)).toBeNull()
  })
  it('accepts a minimal text-only payload', () => {
    const op = validateOperation('createTodo', { text: 'Buy milk' }, knownCats)
    expect(op).toEqual({
      kind: 'createTodo',
      args: { text: 'Buy milk' },
    } satisfies ProposedOperation)
  })
  it('trims + caps text at 4096', () => {
    const op = validateOperation(
      'createTodo',
      { text: '  ' + 'x'.repeat(5000) + '  ' },
      knownCats,
    )
    expect(op?.args.text.length).toBe(4096)
  })
  it('accepts a well-formed ISO date', () => {
    const op = validateOperation(
      'createTodo',
      { text: 'X', dueDate: '2026-05-20' },
      knownCats,
    )
    expect(op?.args.dueDate).toBe('2026-05-20')
  })
  it('drops a malformed dueDate', () => {
    const op = validateOperation(
      'createTodo',
      { text: 'X', dueDate: 'tomorrow' },
      knownCats,
    )
    expect(op?.args.dueDate).toBeUndefined()
  })
  it('accepts the three valid priorities', () => {
    for (const p of ['high', 'medium', 'low'] as const) {
      const op = validateOperation(
        'createTodo',
        { text: 'X', priority: p },
        knownCats,
      )
      expect(op?.args.priority).toBe(p)
    }
  })
  it('drops an invalid priority', () => {
    const op = validateOperation(
      'createTodo',
      { text: 'X', priority: 'urgent' },
      knownCats,
    )
    expect(op?.args.priority).toBeUndefined()
  })
  it('accepts only known category ids', () => {
    const op = validateOperation(
      'createTodo',
      { text: 'X', category: 'home' },
      knownCats,
    )
    expect(op?.args.category).toBe('home')
  })
  it('drops an unknown category id', () => {
    const op = validateOperation(
      'createTodo',
      { text: 'X', category: 'recreation' },
      knownCats,
    )
    expect(op?.args.category).toBeUndefined()
  })
  it('accepts notes + caps at 8000', () => {
    const op = validateOperation(
      'createTodo',
      { text: 'X', notes: 'y'.repeat(9000) },
      knownCats,
    )
    expect(op?.args.notes?.length).toBe(8000)
  })
  it('drops empty notes', () => {
    const op = validateOperation(
      'createTodo',
      { text: 'X', notes: '' },
      knownCats,
    )
    expect(op?.args.notes).toBeUndefined()
  })
})

// ─── editTodo ──────────────────────────────────────────────────────

describe('validateOperation — editTodo', () => {
  it('returns null when todoId is missing or unknown', () => {
    expect(validateOperation('editTodo', { text: 'x' }, knownCats, knownTodoIds)).toBeNull()
    expect(
      validateOperation('editTodo', { todoId: 'missing', text: 'x' }, knownCats, knownTodoIds),
    ).toBeNull()
  })
  it('returns null when no field is changed', () => {
    expect(
      validateOperation('editTodo', { todoId: 't-1' }, knownCats, knownTodoIds),
    ).toBeNull()
  })
  it('accepts a text patch', () => {
    const op = validateOperation(
      'editTodo',
      { todoId: 't-1', text: 'Updated' },
      knownCats,
      knownTodoIds,
    )
    expect(op?.kind).toBe('editTodo')
    expect(op?.args.text).toBe('Updated')
  })
  it('drops whitespace-only text patch', () => {
    expect(
      validateOperation('editTodo', { todoId: 't-1', text: '   ' }, knownCats, knownTodoIds),
    ).toBeNull()
  })
  it('preserves empty-string dueDate as a clear signal', () => {
    const op = validateOperation(
      'editTodo',
      { todoId: 't-1', dueDate: '' },
      knownCats,
      knownTodoIds,
    )
    expect(op?.args.dueDate).toBe('')
  })
  it('preserves empty-string notes as a clear signal', () => {
    const op = validateOperation(
      'editTodo',
      { todoId: 't-1', notes: '' },
      knownCats,
      knownTodoIds,
    )
    expect(op?.args.notes).toBe('')
  })
  it('only accepts known category ids', () => {
    expect(
      validateOperation(
        'editTodo',
        { todoId: 't-1', category: 'unknown' },
        knownCats,
        knownTodoIds,
      ),
    ).toBeNull() // no other field changed, so null
    const op = validateOperation(
      'editTodo',
      { todoId: 't-1', category: 'home' },
      knownCats,
      knownTodoIds,
    )
    expect(op?.args.category).toBe('home')
  })
  it('drops malformed dueDate', () => {
    expect(
      validateOperation(
        'editTodo',
        { todoId: 't-1', dueDate: 'tomorrow' },
        knownCats,
        knownTodoIds,
      ),
    ).toBeNull() // no other field, so null
  })
})

// ─── addSteps ──────────────────────────────────────────────────────

describe('validateOperation — addSteps', () => {
  it('returns null when todoId is missing or unknown', () => {
    expect(
      validateOperation(
        'addSteps',
        { steps: [{ text: 'a' }] },
        knownCats,
        knownTodoIds,
      ),
    ).toBeNull()
    expect(
      validateOperation(
        'addSteps',
        { todoId: 'missing', steps: [{ text: 'a' }] },
        knownCats,
        knownTodoIds,
      ),
    ).toBeNull()
  })
  it('returns null when steps is missing / empty / non-array', () => {
    expect(
      validateOperation('addSteps', { todoId: 't-1' }, knownCats, knownTodoIds),
    ).toBeNull()
    expect(
      validateOperation('addSteps', { todoId: 't-1', steps: [] }, knownCats, knownTodoIds),
    ).toBeNull()
    expect(
      validateOperation(
        'addSteps',
        { todoId: 't-1', steps: 'not an array' },
        knownCats,
        knownTodoIds,
      ),
    ).toBeNull()
  })
  it('returns null when every step has no usable text', () => {
    expect(
      validateOperation(
        'addSteps',
        { todoId: 't-1', steps: [{ text: '' }, { text: '   ' }] },
        knownCats,
        knownTodoIds,
      ),
    ).toBeNull()
  })
  it('trims, caps, and dedupes empty entries', () => {
    const op = validateOperation(
      'addSteps',
      {
        todoId: 't-1',
        steps: [
          { text: '  Step one  ' },
          { text: '' },
          { text: 'x'.repeat(200) },
          { foo: 'bar' },
          { text: 42 },
        ],
      },
      knownCats,
      knownTodoIds,
    )
    expect(op?.kind).toBe('addSteps')
    if (op?.kind === 'addSteps') {
      expect(op.args.steps.length).toBe(2)
      expect(op.args.steps[0]).toEqual({ text: 'Step one' })
      expect(op.args.steps[1].text.length).toBe(80)
    }
  })
  it('caps step count at 8', () => {
    const tenSteps = Array.from({ length: 10 }, (_, i) => ({ text: `step ${i}` }))
    const op = validateOperation(
      'addSteps',
      { todoId: 't-1', steps: tenSteps },
      knownCats,
      knownTodoIds,
    )
    if (op?.kind === 'addSteps') {
      expect(op.args.steps.length).toBe(8)
    }
  })
})

// ─── markDone ──────────────────────────────────────────────────────

describe('validateOperation — markDone', () => {
  it('accepts a known todoId', () => {
    const op = validateOperation('markDone', { todoId: 't-2' }, knownCats, knownTodoIds)
    expect(op).toEqual({ kind: 'markDone', args: { todoId: 't-2' } })
  })
  it('rejects unknown todoIds', () => {
    expect(
      validateOperation('markDone', { todoId: 'ghost' }, knownCats, knownTodoIds),
    ).toBeNull()
  })
  it('rejects missing todoId', () => {
    expect(validateOperation('markDone', {}, knownCats, knownTodoIds)).toBeNull()
  })
  it('safe-by-default when knownTodoIds is omitted (returns null)', () => {
    expect(validateOperation('markDone', { todoId: 't-1' }, knownCats)).toBeNull()
  })
})
