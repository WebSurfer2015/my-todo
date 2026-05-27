/**
 * Tests for core/src/agentTools.ts — the Mochi agent's tool registry +
 * the server-side validateOperation guard. The validator is the
 * security boundary between Anthropic's tool_use response and the
 * client's apply path; bad input there means corrupt todos for the
 * user.
 */
import { describe, expect, it } from 'vitest'
import {
  AGENT_TOOLS,
  validateOperation,
  type ProposedOperation,
} from '../../core/src/agentTools'

const knownCats = new Set(['home', 'work', 'school'])

describe('AGENT_TOOLS registry', () => {
  it('exposes createTodo today (Phase 0 scope)', () => {
    expect(AGENT_TOOLS.some((t) => t.name === 'createTodo')).toBe(true)
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
