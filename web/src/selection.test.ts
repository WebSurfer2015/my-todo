import { describe, it, expect } from 'vitest'
import { applyBulkDelete, applyBulkRestore, toggleSelection } from './core-bindings/selection'
import type { Todo } from './core-bindings/types'

const order = ['1', '2', '3', '4', '5']

function call(
  prev: string[],
  id: string,
  opts: { shift?: boolean; last?: string | null; orderedIds?: string[] } = {},
) {
  return Array.from(
    toggleSelection({
      prev: new Set(prev),
      id,
      shiftKey: opts.shift ?? false,
      lastSelected: opts.last ?? null,
      orderedIds: opts.orderedIds ?? order,
    }),
  ).sort()
}

describe('toggleSelection (single click)', () => {
  it('adds id to empty selection', () => {
    expect(call([], '1')).toEqual(['1'])
  })

  it('toggles id off when already selected', () => {
    expect(call(['1', '2', '3'], '2')).toEqual(['1', '3'])
  })

  it('toggles id on when not selected', () => {
    expect(call(['1', '3'], '2')).toEqual(['1', '2', '3'])
  })

  it('preserves existing selections across sequential clicks', () => {
    let s: string[] = []
    s = call(s, '1')
    expect(s).toEqual(['1'])
    s = call(s, '2')
    expect(s).toEqual(['1', '2'])
    s = call(s, '3')
    expect(s).toEqual(['1', '2', '3'])
  })

  it('does NOT collapse to a single id when clicking sequentially', () => {
    let s = call([], '1')
    s = call(s, '2')
    s = call(s, '3')
    expect(s).toEqual(['1', '2', '3'])
    expect(s.length).toBe(3)
  })
})

describe('toggleSelection (shift-click range)', () => {
  it('falls back to plain toggle when no last-selected exists', () => {
    expect(call([], '3', { shift: true })).toEqual(['3'])
  })

  it('selects forward range (last < current)', () => {
    expect(call(['1'], '4', { shift: true, last: '2' })).toEqual([
      '1', '2', '3', '4',
    ])
  })

  it('selects backward range (last > current)', () => {
    expect(call(['5'], '2', { shift: true, last: '4' })).toEqual([
      '2', '3', '4', '5',
    ])
  })

  it('preserves existing selections in the range', () => {
    expect(call(['1', '5'], '4', { shift: true, last: '2' })).toEqual([
      '1', '2', '3', '4', '5',
    ])
  })

  it('does not throw when last-selected is no longer in the ordered list', () => {
    expect(call(['1'], '3', { shift: true, last: '99', orderedIds: order })).toEqual([
      '1', '3',
    ])
  })
})

const trashed = (id: string, overrides: Partial<Todo> = {}): Todo => ({
  id,
  text: `task ${id}`,
  done: false,
  priority: 'medium',
  dueDate: '',
  category: 'home',
  trashed: true,
  trashedAt: 1000,
  ...overrides,
})

describe('applyBulkRestore', () => {
  it('clears trashed flag and trashedAt for selected ids only', () => {
    const todos: Todo[] = [trashed('1'), trashed('2'), trashed('3')]
    const result = applyBulkRestore(todos, new Set(['1', '3']))
    expect(result[0]).toMatchObject({ id: '1', trashed: false })
    expect(result[0].trashedAt).toBeUndefined()
    expect(result[1]).toMatchObject({ id: '2', trashed: true, trashedAt: 1000 })
    expect(result[2]).toMatchObject({ id: '3', trashed: false })
    expect(result[2].trashedAt).toBeUndefined()
  })

  it('returns todos untouched when selection is empty', () => {
    const todos: Todo[] = [trashed('1'), trashed('2')]
    expect(applyBulkRestore(todos, new Set())).toEqual(todos)
  })
})

describe('applyBulkDelete', () => {
  it('removes only the selected todos', () => {
    const todos: Todo[] = [trashed('1'), trashed('2'), trashed('3')]
    const result = applyBulkDelete(todos, new Set(['1', '3']))
    expect(result.map((t) => t.id)).toEqual(['2'])
  })

  it('returns todos untouched when selection is empty', () => {
    const todos: Todo[] = [trashed('1'), trashed('2')]
    expect(applyBulkDelete(todos, new Set())).toEqual(todos)
  })

  it('keeps non-trashed todos that happen to be in the selection set', () => {
    const todos: Todo[] = [
      { ...trashed('1'), trashed: false, trashedAt: undefined },
      trashed('2'),
    ]
    expect(applyBulkDelete(todos, new Set(['1'])).map((t) => t.id)).toEqual([
      '2',
    ])
  })
})
