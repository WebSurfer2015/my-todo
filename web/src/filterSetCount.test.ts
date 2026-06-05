import { describe, it, expect } from 'vitest'
import { countTodosForFilterSet } from '../../core/src/logic/filters'
import type { Todo } from '../../core/src/domain/types'

/** Counts for Dashboard pinned-filter cards — mirrors deriveState's
 * OR-within / AND-across predicate. */
const td = (over: Partial<Todo>): Todo => ({
  id: Math.random().toString(36).slice(2),
  text: 't',
  done: false,
  priority: 'medium',
  dueDate: '',
  category: 'home',
  trashed: false,
  ...over,
})

const TODAY = '2026-06-05'

describe('countTodosForFilterSet', () => {
  const todos: Todo[] = [
    td({ category: 'home', priority: 'high', done: false }),
    td({ category: 'home', priority: 'low', done: false }),
    td({ category: 'work', priority: 'high', done: false }),
    td({ category: 'home', priority: 'high', done: true, completionDate: TODAY, trashed: true }),
    td({ category: 'home', priority: 'high', trashed: true }), // trashed, not today
  ]

  it('single status: open = non-trashed & !done', () => {
    expect(countTodosForFilterSet(todos, ['open'], TODAY)).toBe(3)
  })

  it('single category excludes trashed (non-today)', () => {
    // home: 2 open + 1 done-today(trashed, grace) ; the plain-trashed one drops
    expect(countTodosForFilterSet(todos, ['cat:home'], TODAY)).toBe(3)
  })

  it('AND across groups: high + open + home', () => {
    // open(non-trashed,!done) AND high AND home → only the first todo
    expect(countTodosForFilterSet(todos, ['pri:high', 'open', 'cat:home'], TODAY)).toBe(1)
  })

  it('OR within a group: high OR low priority, open', () => {
    expect(countTodosForFilterSet(todos, ['pri:high', 'pri:low', 'open'], TODAY)).toBe(3)
  })

  it('done includes trashed/done items', () => {
    expect(countTodosForFilterSet(todos, ['done'], TODAY)).toBe(2)
  })

  it('empty set counts all non-trashed (+ done-today grace)', () => {
    expect(countTodosForFilterSet(todos, [], TODAY)).toBe(4)
  })
})
