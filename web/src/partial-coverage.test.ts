import { describe, it, expect } from 'vitest'
import {
  newTodo,
  todoPermanentlyDelete,
  todoRestoreFromTrash,
} from '../../core/src/logic/derive'
import type { Todo } from '../../core/src/domain/types'
import {
  inferGroceryGroupLocal,
  SEED_GROCERY_GROUPS,
} from '../../core/src/data/groceries'

/**
 * Deepens coverage for helpers that previously had only shallow tests:
 * the merged Done-bin's hard-delete + restore paths (data-safety), and
 * the grocery dept heuristic's multi-word + tokenizer branches.
 */

describe('todoPermanentlyDelete (hard delete)', () => {
  const mk = (id: string, over: Partial<Todo> = {}): Todo => ({
    ...newTodo({ text: id, priority: 'medium', dueDate: '' }),
    id,
    ...over,
  })

  it('removes exactly the target id and keeps everything else', () => {
    const out = todoPermanentlyDelete([mk('a'), mk('b'), mk('c')], 'b')
    expect(out.map((t) => t.id)).toEqual(['a', 'c'])
  })

  it('keeps same-series siblings — only the one id is hard-deleted', () => {
    const todos = [mk('s1', { seriesId: 'S' }), mk('s2', { seriesId: 'S' })]
    const out = todoPermanentlyDelete(todos, 's1')
    expect(out.map((t) => t.id)).toEqual(['s2'])
  })

  it('is a no-op (no removals) for an id that is not present', () => {
    const out = todoPermanentlyDelete([mk('a'), mk('b')], 'zzz')
    expect(out.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('handles an empty list', () => {
    expect(todoPermanentlyDelete([], 'a')).toEqual([])
  })
})

describe('todoRestoreFromTrash (Done-bin → active)', () => {
  // A completed-then-trashed row carrying completion metadata.
  const trashed = (): Todo => ({
    ...newTodo({ text: 'Buy milk', priority: 'high', dueDate: '2026-06-01', category: 'home' }),
    id: 'r1',
    done: true,
    trashed: true,
    trashedAt: 111,
    completionDate: '2026-06-02',
    reminders: [{ id: 'rem1', at: '2026-06-01T09:00' }],
  })

  it('clears both flags so the row returns to the active list', () => {
    const out = todoRestoreFromTrash([trashed()], 'r1')[0]
    expect(out.done).toBe(false)
    expect(out.trashed).toBe(false)
  })

  it('strips completion metadata (completionDate + trashedAt) on restore', () => {
    const out = todoRestoreFromTrash([trashed()], 'r1')[0]
    expect('completionDate' in out).toBe(false)
    expect('trashedAt' in out).toBe(false)
  })

  it('preserves the rest of the todo (text, category, reminders)', () => {
    const out = todoRestoreFromTrash([trashed()], 'r1')[0]
    expect(out.text).toBe('Buy milk')
    expect(out.category).toBe('home')
    expect(out.reminders).toEqual([{ id: 'rem1', at: '2026-06-01T09:00' }])
  })

  it('stamps updatedAt and leaves non-target rows untouched (same reference)', () => {
    const before = Date.now()
    const other: Todo = { ...newTodo({ text: 'x', priority: 'low', dueDate: '' }), id: 'other' }
    const out = todoRestoreFromTrash([trashed(), other], 'r1')
    expect(out[0].updatedAt!).toBeGreaterThanOrEqual(before)
    expect(out[1]).toBe(other)
  })
})

describe('inferGroceryGroupLocal — multi-word + tokenizer branches', () => {
  const groups = SEED_GROCERY_GROUPS

  it('matches a multi-word phrase ahead of any single token', () => {
    expect(inferGroceryGroupLocal('ground beef', groups)).toBe('meat')
  })

  it('matches a multi-word phrase even when embedded in a longer string', () => {
    expect(inferGroceryGroupLocal('1 lb organic ground beef', groups)).toBe('meat')
  })

  it('tokenizes on punctuation to find a single-word match', () => {
    // Comma/qualifier shouldn't block the "apples" token from matching.
    expect(inferGroceryGroupLocal('apples, organic', groups)).toBe('produce')
    expect(inferGroceryGroupLocal('milk (2%)', groups)).toBe('dairy')
  })
})
