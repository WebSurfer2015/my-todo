import { describe, it, expect } from 'vitest'
import type { Todo, Subtask } from '../src/domain/types'
import {
  completionCounts,
  isTodayActionable,
  splitCarriedOver,
  todayActionable,
} from '../src/logic/homeDashboard'

const TODAY = '2026-10-19'

function todo(over: Partial<Todo> = {}): Todo {
  return {
    id: over.id ?? 'x',
    text: 'task',
    done: false,
    priority: 'medium',
    dueDate: '',
    trashed: false,
    ...over,
  }
}

function sub(over: Partial<Subtask> = {}): Subtask {
  return { id: 's', text: 'step', done: false, ...over } as Subtask
}

describe('completionCounts', () => {
  it('counts done to-dos and done steps per window relative to today', () => {
    const todos = [
      todo({ id: 'a', done: true, completionDate: TODAY }),
      todo({ id: 'b', done: true, completionDate: '2026-10-18', trashed: true }),
      todo({ id: 'c', done: true, completionDate: '2026-10-13' }), // 6 days ago → week
      todo({ id: 'd', done: true, completionDate: '2026-10-12' }), // 7 days ago → month only
      todo({ id: 'e', done: true, completionDate: '2026-09-20' }), // 29 days ago → month
      todo({ id: 'f', done: true, completionDate: '2026-09-19' }), // 30 days ago → none
      todo({ id: 'g', done: false, completionDate: TODAY }), // not done → ignored
      todo({ id: 'h', done: true }), // no date → ignored
      todo({
        id: 'i',
        subtasks: [
          sub({ id: 's1', done: true, completionDate: TODAY }),
          sub({ id: 's2', done: false, completionDate: TODAY }),
          sub({ id: 's3', done: true }),
        ],
      }),
    ]
    expect(completionCounts(todos, TODAY)).toEqual({ today: 2, yesterday: 1, week: 4, month: 6 })
  })

  it('crosses month and year boundaries', () => {
    const c = completionCounts([todo({ done: true, completionDate: '2025-12-31' })], '2026-01-01')
    expect(c).toEqual({ today: 0, yesterday: 1, week: 1, month: 1 })
  })

  it('is all zeros for no todos', () => {
    expect(completionCounts([], TODAY)).toEqual({ today: 0, yesterday: 0, week: 0, month: 0 })
  })
})

describe('isTodayActionable', () => {
  it('excludes done and trashed rows', () => {
    expect(isTodayActionable(todo({ dueDate: TODAY, done: true }), TODAY)).toBe(false)
    expect(isTodayActionable(todo({ dueDate: TODAY, trashed: true }), TODAY)).toBe(false)
  })

  it('uses the own dueDate (incl. a time suffix) when there are no steps', () => {
    expect(isTodayActionable(todo({ dueDate: TODAY }), TODAY)).toBe(true)
    expect(isTodayActionable(todo({ dueDate: `${TODAY}T15:00` }), TODAY)).toBe(true)
    expect(isTodayActionable(todo({ dueDate: '2026-10-01' }), TODAY)).toBe(true)
    expect(isTodayActionable(todo({ dueDate: '2026-10-20' }), TODAY)).toBe(false)
    expect(isTodayActionable(todo({ dueDate: '' }), TODAY)).toBe(false)
  })

  it('lets an open dated step due today pull in a future/undated parent', () => {
    const t = todo({ dueDate: '2026-11-01', subtasks: [sub({ dueDate: TODAY })] })
    expect(isTodayActionable(t, TODAY)).toBe(true)
    const u = todo({ subtasks: [sub({ dueDate: `${TODAY}T08:00` })] })
    expect(isTodayActionable(u, TODAY)).toBe(true)
  })

  it('drops a parent once its today-or-earlier steps are done, even if later steps remain', () => {
    const t = todo({
      dueDate: TODAY,
      subtasks: [sub({ id: 'a', dueDate: TODAY, done: true }), sub({ id: 'b', dueDate: '2026-10-25' })],
    })
    expect(isTodayActionable(t, TODAY)).toBe(false)
  })

  it('falls back to the parent date when no open step is dated (undated steps still show)', () => {
    const t = todo({ dueDate: TODAY, subtasks: [sub({ id: 'a' }), sub({ id: 'b', dueDate: TODAY, done: true })] })
    expect(isTodayActionable(t, TODAY)).toBe(true)
    const future = todo({ dueDate: '2026-10-25', subtasks: [sub()] })
    expect(isTodayActionable(future, TODAY)).toBe(false)
  })
})

describe('todayActionable', () => {
  const rows = [
    todo({ id: 'low', priority: 'low', dueDate: TODAY }),
    todo({ id: 'med-late', priority: 'medium', dueDate: TODAY }),
    todo({ id: 'med-early', priority: 'medium', dueDate: '2026-10-10' }),
    todo({ id: 'high', priority: 'high', dueDate: TODAY }),
    todo({ id: 'future', priority: 'high', dueDate: '2026-10-30' }),
  ]

  it('filters to actionable rows sorted high → medium → low, then earliest due', () => {
    expect(todayActionable(rows, TODAY).map((t) => t.id)).toEqual(['high', 'med-early', 'med-late', 'low'])
  })

  it("follows the user's priority order", () => {
    expect(todayActionable(rows, TODAY, ['low', 'medium', 'high']).map((t) => t.id)).toEqual([
      'low',
      'med-early',
      'med-late',
      'high',
    ])
  })

  it('ranks a priority missing from the order as medium', () => {
    const order = ['high', 'medium'] as const
    // low ties with medium, so the dueDate tiebreak (then input order) decides.
    const expected = ['high', 'med-early', 'low', 'med-late']
    expect(todayActionable(rows, TODAY, order).map((t) => t.id)).toEqual(expected)
    expect(todayActionable(rows, TODAY, ['high']).map((t) => t.id)).toEqual(expected)
  })

  it('does not mutate the input', () => {
    const copy = rows.map((r) => r.id)
    todayActionable(rows, TODAY)
    expect(rows.map((r) => r.id)).toEqual(copy)
  })
})

describe('splitCarriedOver', () => {
  it('puts own-date-before-today rows in carriedOver, everything else in dueToday, order kept', () => {
    const items = [
      todo({ id: 'a', dueDate: '2026-10-01' }),
      todo({ id: 'b', dueDate: TODAY }),
      todo({ id: 'c', dueDate: '' }),
      todo({ id: 'd', dueDate: '2026-10-18T09:00' }),
      todo({ id: 'e', dueDate: '2026-11-01' }),
    ]
    const { carriedOver, dueToday } = splitCarriedOver(items, TODAY)
    expect(carriedOver.map((t) => t.id)).toEqual(['a', 'd'])
    expect(dueToday.map((t) => t.id)).toEqual(['b', 'c', 'e'])
  })
})
