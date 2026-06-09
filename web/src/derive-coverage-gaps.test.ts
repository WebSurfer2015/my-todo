import { describe, it, expect } from 'vitest'
import {
  newTodo,
  snapDueDateToRecurrence,
  generateRecurringInstances,
  subtaskClearAll,
  todoClearDone,
  selectOverdue,
} from '../../core/src/logic/derive'
import type { Todo } from '../../core/src/domain/types'

/**
 * Backfill for pure derive helpers that shipped without direct tests.
 * These guard correctness/data-safety paths (recurrence weekday anchor,
 * series seeding, subtask clear, Done-bin purge, overdue selection).
 */

const weekdayOf = (date: string) => new Date(`${date}T00:00:00`).getDay()

describe('snapDueDateToRecurrence', () => {
  it('returns the date unchanged when there is no weekday filter', () => {
    expect(snapDueDateToRecurrence('2026-06-06', undefined)).toBe('2026-06-06')
    expect(snapDueDateToRecurrence('2026-06-06', { byWeekday: [] })).toBe('2026-06-06')
  })

  it('snaps forward to the next listed weekday (within 7 days)', () => {
    // Pick Wednesday(3); result must land on a Wednesday on/after the input.
    const out = snapDueDateToRecurrence('2026-06-06', { byWeekday: [3] })
    expect(weekdayOf(out)).toBe(3)
    expect(out >= '2026-06-06').toBe(true)
    // ...and within a week of the input.
    expect(out <= '2026-06-13').toBe(true)
  })

  it('leaves the date untouched when it already falls on a listed weekday', () => {
    const sat = '2026-06-06'
    const out = snapDueDateToRecurrence(sat, { byWeekday: [weekdayOf(sat)] })
    expect(out).toBe(sat)
  })

  it('preserves the time-of-day suffix while snapping the date part', () => {
    const out = snapDueDateToRecurrence('2026-06-06T09:30', { byWeekday: [3] })
    expect(out.endsWith('T09:30')).toBe(true)
    expect(weekdayOf(out.slice(0, 10))).toBe(3)
  })

  it('returns the original value when the date is unparseable', () => {
    expect(snapDueDateToRecurrence('not-a-date', { byWeekday: [1] })).toBe('not-a-date')
  })
})

describe('generateRecurringInstances', () => {
  it('seeds exactly one rolling instance carrying the recurrence', () => {
    const out = generateRecurringInstances({
      text: 'Water plants',
      priority: 'medium',
      dueDate: '2026-06-10',
      recurrence: { freq: 'weekly', interval: 2 },
    })
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe('Water plants')
    expect(out[0].dueDate).toBe('2026-06-10')
    expect(out[0].recurrence?.freq).toBe('weekly')
    expect(out[0].recurrence?.interval).toBe(2)
  })

  it('clones subtasks fresh — new ids, all reset to not-done', () => {
    const out = generateRecurringInstances({
      text: 'Chores',
      priority: 'low',
      dueDate: '2026-06-10',
      recurrence: { freq: 'daily' },
      subtasks: [{ id: 'orig-1', text: 'Sweep', done: true }],
    })
    const subs = out[0].subtasks!
    expect(subs).toHaveLength(1)
    expect(subs[0].text).toBe('Sweep')
    expect(subs[0].done).toBe(false) // reset
    expect(subs[0].id).not.toBe('orig-1') // fresh id
  })

  it('omits the subtasks field entirely when none are given', () => {
    const out = generateRecurringInstances({
      text: 'Solo',
      priority: 'medium',
      dueDate: '2026-06-10',
      recurrence: { freq: 'daily' },
    })
    expect(out[0].subtasks).toBeUndefined()
  })
})

describe('subtaskClearAll', () => {
  const withSubs = (): Todo => ({
    ...newTodo({ text: 'Parent', priority: 'medium', dueDate: '' }),
    id: 'p1',
    subtasks: [
      { id: 's1', text: 'a', done: true },
      { id: 's2', text: 'b', done: false },
    ],
  })

  it('drops the subtasks field entirely (not [] ) for the target', () => {
    const out = subtaskClearAll([withSubs()], 'p1')
    expect(out[0].subtasks).toBeUndefined()
    expect('subtasks' in out[0]).toBe(false)
  })

  it('stamps updatedAt on the cleared todo', () => {
    const before = Date.now()
    const out = subtaskClearAll([withSubs()], 'p1')
    expect(out[0].updatedAt!).toBeGreaterThanOrEqual(before)
  })

  it('returns the same reference for a todo that has no subtasks (no churn)', () => {
    const plain: Todo = { ...newTodo({ text: 'x', priority: 'low', dueDate: '' }), id: 'p2' }
    const arr = [plain]
    const out = subtaskClearAll(arr, 'p2')
    expect(out[0]).toBe(plain) // untouched identity
  })

  it('leaves non-target todos untouched', () => {
    const target = withSubs()
    const other: Todo = { ...newTodo({ text: 'y', priority: 'low', dueDate: '' }), id: 'other' }
    const out = subtaskClearAll([target, other], 'p1')
    expect(out[1]).toBe(other)
  })
})

describe('todoClearDone', () => {
  const open = (id: string): Todo => ({
    ...newTodo({ text: id, priority: 'medium', dueDate: '' }),
    id,
  })

  it('removes done AND trashed items, keeps open ones, and reports removed ids', () => {
    const a = open('a')
    const b: Todo = { ...open('b'), done: true }
    const c: Todo = { ...open('c'), trashed: true }
    const { todos, trashedIds } = todoClearDone([a, b, c])
    expect(todos.map((t) => t.id)).toEqual(['a'])
    expect(trashedIds.sort()).toEqual(['b', 'c'])
  })

  it('handles an empty list', () => {
    expect(todoClearDone([])).toEqual({ todos: [], trashedIds: [] })
  })

  it('removes nothing when all items are open', () => {
    const { todos, trashedIds } = todoClearDone([open('a'), open('b')])
    expect(todos).toHaveLength(2)
    expect(trashedIds).toEqual([])
  })
})

describe('selectOverdue', () => {
  const at = (id: string, dueDate: string, over: Partial<Todo> = {}): Todo => ({
    ...newTodo({ text: id, priority: 'medium', dueDate }),
    id,
    ...over,
  })
  const TODAY = '2026-06-09'

  it('includes only undone, untrashed items dated strictly before today', () => {
    const yesterday = at('y', '2026-06-08')
    const today = at('t', '2026-06-09')
    const noDate = at('n', '')
    const done = at('d', '2026-06-01', { done: true })
    const trashed = at('x', '2026-06-01', { trashed: true })
    const ids = selectOverdue([yesterday, today, noDate, done, trashed], TODAY).map((t) => t.id)
    expect(ids).toEqual(['y'])
  })

  it('treats a timed task earlier today as NOT overdue, but a timed task yesterday as overdue', () => {
    const todayTimed = at('tt', '2026-06-09T08:00')
    const yesterdayTimed = at('yt', '2026-06-08T23:59')
    const ids = selectOverdue([todayTimed, yesterdayTimed], TODAY).map((t) => t.id)
    expect(ids).toEqual(['yt'])
  })
})
