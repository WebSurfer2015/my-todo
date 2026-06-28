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
const knownGroceryGroupIds = new Set(['produce', 'dairy'])
const knownGroceryIds = new Set(['g-1', 'g-2'])

describe('AGENT_TOOLS registry', () => {
  it('exposes the v1 proposal-style tool set', () => {
    const names = AGENT_TOOLS.map((t) => t.name)
    expect(names).toContain('createTodo')
    expect(names).toContain('editTodo')
    expect(names).toContain('addSteps')
    expect(names).toContain('markDone')
    expect(names).toContain('deleteTodo')
    expect(names).toContain('deleteGroceryItem')
    expect(names).toContain('editGroceryItem')
    expect(names).toContain('pickTodos')
    expect(names).toContain('editCategory')
    expect(names).toContain('deleteCategory')
    expect(names).toContain('setGroceryChecked')
    expect(names).toContain('renameStore')
    expect(names).toContain('deleteStore')
    expect(names).toContain('skipTodo')
    expect(names).toContain('markUndone')
    expect(names).toContain('deferOverdue')
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

// ─── deleteTodo ────────────────────────────────────────────────────

describe('validateOperation — deleteTodo', () => {
  it('accepts a known todoId', () => {
    const op = validateOperation('deleteTodo', { todoId: 't-3' }, knownCats, knownTodoIds)
    expect(op).toEqual({ kind: 'deleteTodo', args: { todoId: 't-3' } })
  })
  it('rejects a hallucinated (unknown) todoId', () => {
    expect(
      validateOperation('deleteTodo', { todoId: 'ghost' }, knownCats, knownTodoIds),
    ).toBeNull()
  })
  it('rejects missing / non-string todoId', () => {
    expect(validateOperation('deleteTodo', {}, knownCats, knownTodoIds)).toBeNull()
    expect(validateOperation('deleteTodo', { todoId: 42 }, knownCats, knownTodoIds)).toBeNull()
  })
  it('safe-by-default when knownTodoIds is omitted (returns null)', () => {
    expect(validateOperation('deleteTodo', { todoId: 't-1' }, knownCats)).toBeNull()
  })
})

// ─── deleteGroceryItem ─────────────────────────────────────────────

describe('validateOperation — deleteGroceryItem', () => {
  it('accepts a known groceryId', () => {
    const op = validateOperation(
      'deleteGroceryItem',
      { groceryId: 'g-2' },
      knownCats,
      knownTodoIds,
      knownGroceryGroupIds,
      knownGroceryIds,
    )
    expect(op).toEqual({ kind: 'deleteGroceryItem', args: { groceryId: 'g-2' } })
  })
  it('rejects a hallucinated (unknown) groceryId', () => {
    expect(
      validateOperation(
        'deleteGroceryItem',
        { groceryId: 'ghost' },
        knownCats,
        knownTodoIds,
        knownGroceryGroupIds,
        knownGroceryIds,
      ),
    ).toBeNull()
  })
  it('rejects missing groceryId', () => {
    expect(
      validateOperation(
        'deleteGroceryItem',
        {},
        knownCats,
        knownTodoIds,
        knownGroceryGroupIds,
        knownGroceryIds,
      ),
    ).toBeNull()
  })
  it('safe-by-default when knownGroceryIds is omitted (returns null)', () => {
    expect(
      validateOperation('deleteGroceryItem', { groceryId: 'g-1' }, knownCats, knownTodoIds),
    ).toBeNull()
  })
})

// ─── Tier 1/2 capability ops ───────────────────────────────────────

describe('validateOperation — category/store/task ops', () => {
  it('editCategory: known id + ≥1 field, drops bad color', () => {
    expect(
      validateOperation('editCategory', { categoryId: 'work', label: 'Office' }, knownCats),
    ).toEqual({ kind: 'editCategory', args: { categoryId: 'work', label: 'Office' } })
    expect(
      validateOperation('editCategory', { categoryId: 'work', color: 'green' }, knownCats),
    ).toBeNull() // no valid field
    expect(validateOperation('editCategory', { categoryId: 'ghost', label: 'X' }, knownCats)).toBeNull()
  })
  it('deleteCategory: known id only', () => {
    expect(validateOperation('deleteCategory', { categoryId: 'home' }, knownCats)).toEqual({
      kind: 'deleteCategory',
      args: { categoryId: 'home' },
    })
    expect(validateOperation('deleteCategory', { categoryId: 'ghost' }, knownCats)).toBeNull()
  })
  it('setGroceryChecked: known id + boolean', () => {
    const op = validateOperation(
      'setGroceryChecked',
      { groceryId: 'g-1', checked: true },
      knownCats,
      knownTodoIds,
      knownGroceryGroupIds,
      knownGroceryIds,
    )
    expect(op).toEqual({ kind: 'setGroceryChecked', args: { groceryId: 'g-1', checked: true } })
    expect(
      validateOperation(
        'setGroceryChecked',
        { groceryId: 'g-1', checked: 'yes' },
        knownCats,
        knownTodoIds,
        knownGroceryGroupIds,
        knownGroceryIds,
      ),
    ).toBeNull()
  })
  it('renameStore / deleteStore: non-empty names', () => {
    expect(validateOperation('renameStore', { from: 'Costco', to: "BJ's" }, knownCats)).toEqual({
      kind: 'renameStore',
      args: { from: 'Costco', to: "BJ's" },
    })
    expect(validateOperation('renameStore', { from: '', to: 'X' }, knownCats)).toBeNull()
    expect(validateOperation('deleteStore', { name: 'Costco' }, knownCats)).toEqual({
      kind: 'deleteStore',
      args: { name: 'Costco' },
    })
  })
  it('skipTodo: known id, optional series scope', () => {
    expect(
      validateOperation('skipTodo', { todoId: 't-1', scope: 'series' }, knownCats, knownTodoIds),
    ).toEqual({ kind: 'skipTodo', args: { todoId: 't-1', scope: 'series' } })
    expect(validateOperation('skipTodo', { todoId: 'ghost' }, knownCats, knownTodoIds)).toBeNull()
  })
  it('markUndone: known id', () => {
    expect(validateOperation('markUndone', { todoId: 't-2' }, knownCats, knownTodoIds)).toEqual({
      kind: 'markUndone',
      args: { todoId: 't-2' },
    })
  })
  it('deferOverdue: ISO date only', () => {
    expect(validateOperation('deferOverdue', { dueDate: '2026-07-06' }, knownCats)).toEqual({
      kind: 'deferOverdue',
      args: { dueDate: '2026-07-06' },
    })
    expect(validateOperation('deferOverdue', { dueDate: 'monday' }, knownCats)).toBeNull()
  })
})

// ─── editGroceryItem ───────────────────────────────────────────────

describe('validateOperation — editGroceryItem', () => {
  it('renames a known item', () => {
    const op = validateOperation(
      'editGroceryItem',
      { groceryId: 'g-1', text: 'milk' },
      knownCats,
      knownTodoIds,
      knownGroceryGroupIds,
      knownGroceryIds,
    )
    expect(op).toEqual({ kind: 'editGroceryItem', args: { groceryId: 'g-1', text: 'milk' } })
  })
  it('rejects a hallucinated groceryId', () => {
    expect(
      validateOperation(
        'editGroceryItem',
        { groceryId: 'ghost', text: 'milk' },
        knownCats,
        knownTodoIds,
        knownGroceryGroupIds,
        knownGroceryIds,
      ),
    ).toBeNull()
  })
  it('rejects a no-op edit (no fields)', () => {
    expect(
      validateOperation(
        'editGroceryItem',
        { groceryId: 'g-1' },
        knownCats,
        knownTodoIds,
        knownGroceryGroupIds,
        knownGroceryIds,
      ),
    ).toBeNull()
  })
  it('drops an unknown groupId but keeps a valid text change', () => {
    const op = validateOperation(
      'editGroceryItem',
      { groceryId: 'g-2', text: 'eggs', groupId: 'ghostdept' },
      knownCats,
      knownTodoIds,
      knownGroceryGroupIds,
      knownGroceryIds,
    )
    expect(op).toEqual({ kind: 'editGroceryItem', args: { groceryId: 'g-2', text: 'eggs' } })
  })
})

// ─── pickTodos ─────────────────────────────────────────────────────

describe('validateOperation — pickTodos', () => {
  it('accepts a delete pick with 2+ known ids + query', () => {
    const op = validateOperation(
      'pickTodos',
      { action: 'delete', todoIds: ['t-1', 't-2'], query: 'water' },
      knownCats,
      knownTodoIds,
    )
    expect(op).toEqual({
      kind: 'pickTodos',
      args: { action: 'delete', todoIds: ['t-1', 't-2'], query: 'water' },
    })
  })
  it('rejects a single match — that should use the single-target tool', () => {
    expect(
      validateOperation('pickTodos', { action: 'delete', todoIds: ['t-1'] }, knownCats, knownTodoIds),
    ).toBeNull()
  })
  it('drops unknown + duplicate ids; null when <2 survive', () => {
    expect(
      validateOperation(
        'pickTodos',
        { action: 'markDone', todoIds: ['t-1', 'ghost', 't-1'] },
        knownCats,
        knownTodoIds,
      ),
    ).toBeNull()
  })
  it('keeps known, de-duped ids in order', () => {
    const op = validateOperation(
      'pickTodos',
      { action: 'markDone', todoIds: ['t-1', 't-2', 't-2', 'ghost', 't-3'] },
      knownCats,
      knownTodoIds,
    )
    expect(op?.kind === 'pickTodos' && op.args.todoIds).toEqual(['t-1', 't-2', 't-3'])
  })
  it('rejects an unknown action', () => {
    expect(
      validateOperation(
        'pickTodos',
        { action: 'archive', todoIds: ['t-1', 't-2'] },
        knownCats,
        knownTodoIds,
      ),
    ).toBeNull()
  })
  it('edit action requires at least one field', () => {
    expect(
      validateOperation(
        'pickTodos',
        { action: 'edit', todoIds: ['t-1', 't-2'], edit: {} },
        knownCats,
        knownTodoIds,
      ),
    ).toBeNull()
  })
  it('edit action carries the validated patch (and drops unknown category)', () => {
    const op = validateOperation(
      'pickTodos',
      {
        action: 'edit',
        todoIds: ['t-1', 't-2'],
        edit: { priority: 'high', dueDate: '2026-07-01', category: 'ghostcat' },
      },
      knownCats,
      knownTodoIds,
    )
    expect(op?.kind === 'pickTodos' && op.args.edit).toEqual({
      priority: 'high',
      dueDate: '2026-07-01',
    })
  })
  it('addSteps action requires steps', () => {
    expect(
      validateOperation(
        'pickTodos',
        { action: 'addSteps', todoIds: ['t-1', 't-2'] },
        knownCats,
        knownTodoIds,
      ),
    ).toBeNull()
    const op = validateOperation(
      'pickTodos',
      { action: 'addSteps', todoIds: ['t-1', 't-2'], steps: [{ text: 'do it' }] },
      knownCats,
      knownTodoIds,
    )
    expect(op?.kind === 'pickTodos' && op.args.steps).toEqual([{ text: 'do it' }])
  })
  it('safe-by-default when knownTodoIds omitted (all ids drop → null)', () => {
    expect(
      validateOperation('pickTodos', { action: 'delete', todoIds: ['t-1', 't-2'] }, knownCats),
    ).toBeNull()
  })

  // The reliable path: the model passes a `query`, the server resolves it to
  // ids against the context todos (so the model never enumerates UUIDs).
  const knownTodosList = [
    { id: 't-1', text: 'Work on AI project' },
    { id: 't-2', text: 'Work on AI project' },
    { id: 't-3', text: 'Buy milk' },
  ]
  it('resolves a query to matching ids server-side (no ids from the model)', () => {
    const op = validateOperation(
      'pickTodos',
      { action: 'delete', query: 'AI project' },
      knownCats,
      knownTodoIds,
      new Set(),
      new Set(),
      knownTodosList,
    )
    expect(op?.kind === 'pickTodos' && op.args.todoIds).toEqual(['t-1', 't-2'])
    expect(op?.kind === 'pickTodos' && op.args.query).toBe('AI project')
  })
  it('query matching is case-insensitive substring', () => {
    const op = validateOperation(
      'pickTodos',
      { action: 'markDone', query: 'work ON' },
      knownCats,
      knownTodoIds,
      new Set(),
      new Set(),
      knownTodosList,
    )
    expect(op?.kind === 'pickTodos' && op.args.todoIds).toEqual(['t-1', 't-2'])
  })
  it('null when the query resolves to fewer than 2 matches', () => {
    expect(
      validateOperation(
        'pickTodos',
        { action: 'delete', query: 'milk' },
        knownCats,
        knownTodoIds,
        new Set(),
        new Set(),
        knownTodosList,
      ),
    ).toBeNull()
  })
})
