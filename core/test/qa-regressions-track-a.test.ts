import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  subtaskToggle,
  subtaskAdd,
  subtaskRemove,
  todoRestoreFromTrash,
  todoSet,
  setDueDates,
  todoDeferTo,
  todoToggle,
  deriveState,
} from '../src/logic/derive'
import { deleteCategoryCascade } from '../src/store'
import { strings } from '../src/data/i18n'
import type { CategoryDef } from '../src/data/categories'
import type { Todo } from '../src/domain/types'

// Fixed clock: Mon 2026-10-19, noon local.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
})
afterEach(() => {
  vi.useRealTimers()
})

const TODAY = '2026-10-19'

const mk = (id: string, extra: Partial<Todo> = {}): Todo => ({
  id,
  text: id,
  done: false,
  priority: 'medium',
  dueDate: '',
  trashed: false,
  ...extra,
})

const step = (id: string, done = false) => ({ id, text: id, done, priority: 'medium' as const, dueDate: '' })

describe('finishing the last step of a series instance rolls the series (3)', () => {
  const series = (): Todo[] => [
    mk('a', {
      dueDate: '2026-10-19',
      seriesId: 's1',
      recurrence: { freq: 'daily' },
      subtasks: [step('x', true), step('y')],
      reminders: [{ id: 'r1', at: '2026-10-19T18:00' }],
    }),
    mk('b', { dueDate: '2026-10-20', seriesId: 's1', recurrence: { freq: 'daily' } }),
  ]

  it('completes the parent, appends the next occurrence and moves its reminders on', () => {
    const out = subtaskToggle(series(), 'a', 'y', TODAY)
    const a = out.find((t) => t.id === 'a')!
    expect(a.done).toBe(true)
    expect(a.trashed).toBe(true)
    expect(a.completionDate).toBe(TODAY)
    expect(a.reminders).toBeUndefined()
    // One fresh tail, exactly as todoToggle does.
    expect(out).toHaveLength(3)
    expect(out[2].dueDate).toBe('2026-10-21')
    // R7 — the reminder moved to the next open occurrence, same clock time.
    const b = out.find((t) => t.id === 'b')!
    expect(b.reminders?.map((r) => r.at)).toEqual(['2026-10-20T18:00'])
  })

  it('matches todoToggle on the same row', () => {
    const viaStep = subtaskToggle(series(), 'a', 'y', TODAY)
    const viaCircle = todoToggle(series(), 'a', TODAY)
    expect(viaStep.length).toBe(viaCircle.length)
    expect(viaStep[2].dueDate).toBe(viaCircle[2].dueDate)
  })

  it('reopening a step does not append anything', () => {
    const done = subtaskToggle(series(), 'a', 'y', TODAY)
    const reopened = subtaskToggle(done, 'a', 'y', TODAY)
    expect(reopened).toHaveLength(done.length)
    const a = reopened.find((t) => t.id === 'a')!
    expect(a.done).toBe(false)
    expect(a.trashed).toBe(false)
    expect(a.trashedAt).toBeUndefined()
    expect(a.completionDate).toBeUndefined()
  })

  it('returns the same list for an unknown step', () => {
    const prev = series()
    expect(subtaskToggle(prev, 'a', 'nope', TODAY)).toBe(prev)
  })
})

describe('step add / remove keep the Done-bin fields consistent (4)', () => {
  it('adding a step to a done parent reopens it fully', () => {
    const prev = [
      mk('p', {
        done: true,
        trashed: true,
        trashedAt: 1,
        completionDate: '2026-10-18',
        subtasks: [step('x', true)],
      }),
    ]
    const [p] = subtaskAdd(prev, 'p', 'one more')
    expect(p.done).toBe(false)
    expect(p.trashed).toBe(false)
    expect(p.trashedAt).toBeUndefined()
    expect(p.completionDate).toBeUndefined()
    expect(p.subtasks).toHaveLength(2)
  })

  it('removing the only open step completes the parent', () => {
    const prev = [
      mk('p', {
        subtasks: [step('x', true), step('y')],
        reminders: [{ id: 'r', at: '2026-10-20T09:00' }],
      }),
    ]
    const [p] = subtaskRemove(prev, 'p', 'y')
    expect(p.done).toBe(true)
    expect(p.trashed).toBe(true)
    expect(typeof p.trashedAt).toBe('number')
    expect(p.completionDate).toBe(TODAY)
    expect(p.reminders).toBeUndefined()
  })

  it('removing the last step leaves the parent state alone', () => {
    const prev = [mk('p', { subtasks: [step('y')] })]
    const [p] = subtaskRemove(prev, 'p', 'y')
    expect(p.subtasks).toEqual([])
    expect(p.done).toBe(false)
    expect(p.trashed).toBe(false)
  })
})

describe('todoRestoreFromTrash on an active row (5)', () => {
  it('is a no-op — steps are not reopened', () => {
    const prev = [mk('p', { subtasks: [step('x', true), step('y')] })]
    expect(todoRestoreFromTrash(prev, 'p')).toBe(prev)
  })

  it('still restores a binned row', () => {
    const prev = [mk('p', { done: true, trashed: true, trashedAt: 1, completionDate: TODAY })]
    const [p] = todoRestoreFromTrash(prev, 'p')
    expect(p.done).toBe(false)
    expect(p.trashed).toBe(false)
  })
})

describe('overdue count matches the Carried-over list (6)', () => {
  const cats: CategoryDef[] = [{ id: 'home', color: '#000', icon: 'home' }]
  const t = strings.en

  it('excludes every binned / done past-due row (even one completed today)', () => {
    const todos = [
      mk('open', { dueDate: '2026-10-17' }),
      mk('doneEarlier', { dueDate: '2026-10-16', done: true, trashed: true, completionDate: '2026-10-17' }),
      mk('trashed', { dueDate: '2026-10-16', trashed: true, trashedAt: Date.now() }),
      mk('doneToday', { dueDate: '2026-10-18', done: true, trashed: true, completionDate: TODAY }),
      mk('future', { dueDate: '2026-10-25' }),
    ]
    const overdueList = deriveState({ todos, filters: ['overdue'], categories: cats, t }).filtered
    const counts = deriveState({ todos, filters: [], categories: cats, t }).systemCounts
    expect(overdueList.map((x) => x.id)).toEqual(['open'])
    expect(counts.overdue).toBe(overdueList.length)
  })
})

describe('reminders follow a moved due date (7, 13)', () => {
  const withReminders = (): Todo[] => [
    mk('a', {
      dueDate: '2026-10-20T10:00',
      reminders: [
        { id: 'future', at: '2026-10-20T09:00', offsetMinutes: 60 },
        { id: 'past', at: '2026-10-19T08:00' },
        { id: 'repeat', at: '2026-10-20T07:00', intervalMinutes: 30 },
      ],
    }),
  ]

  it('todoSet(dueDate) shifts future one-shot reminders by the day delta', () => {
    const [a] = todoSet(withReminders(), 'a', 'dueDate', '2026-10-23T10:00')
    const byId = Object.fromEntries((a.reminders ?? []).map((r) => [r.id, r]))
    expect(byId.future.at).toBe('2026-10-23T09:00')
    // (13) the before-due offset survives the roll.
    expect(byId.future.offsetMinutes).toBe(60)
    expect(byId.past.at).toBe('2026-10-19T08:00')
    expect(byId.repeat.at).toBe('2026-10-20T07:00')
  })

  it('setDueDates rebases the same way; a same-day change leaves reminders alone', () => {
    const [a] = setDueDates(withReminders(), new Map([['a', '2026-10-22']]))
    expect(a.reminders?.find((r) => r.id === 'future')?.at).toBe('2026-10-22T09:00')
    const prev = withReminders()
    const [same] = todoSet(prev, 'a', 'dueDate', '2026-10-20T15:00')
    expect(same.reminders).toBe(prev[0].reminders)
  })

  it('clearing the date keeps reminders where they were', () => {
    const prev = withReminders()
    const [a] = todoSet(prev, 'a', 'dueDate', '')
    expect(a.reminders).toBe(prev[0].reminders)
  })
})

describe('todoDeferTo — one carried-over instance per series (8)', () => {
  const daily = { freq: 'daily' as const }
  const todos = (): Todo[] => [
    mk('d16', { dueDate: '2026-10-16T07:30', seriesId: 's1', recurrence: daily, reminders: [{ id: 'r', at: '2026-10-16T07:00' }] }),
    mk('d17', { dueDate: '2026-10-17T07:30', seriesId: 's1', recurrence: daily }),
    mk('d18', { dueDate: '2026-10-18T07:30', seriesId: 's1', recurrence: daily }),
    mk('d19', { dueDate: '2026-10-19T07:30', seriesId: 's1', recurrence: daily }),
    mk('one', { dueDate: '2026-10-15T14:00', reminders: [{ id: 'q', at: '2026-10-21T13:00' }] }),
    mk('plain', { dueDate: '2026-10-14' }),
  ]

  it('moves only the newest missed occurrence and skips the older ones', () => {
    const ids = ['d16', 'd17', 'd18', 'one', 'plain']
    const { next, deferred, skipped } = todoDeferTo(todos(), ids, '2026-10-20', TODAY)
    expect(deferred).toBe(3)
    expect(skipped).toBe(2)
    const byId = Object.fromEntries(next.map((t) => [t.id, t]))
    // Time of day kept.
    expect(byId.d18.dueDate).toBe('2026-10-20T07:30')
    expect(byId.one.dueDate).toBe('2026-10-20T14:00')
    expect(byId.plain.dueDate).toBe('2026-10-20')
    for (const id of ['d16', 'd17']) {
      expect(byId[id].status).toBe('notDo')
      expect(byId[id].trashed).toBe(true)
      expect(byId[id].done).toBe(false)
      expect(byId[id].completionDate).toBe(TODAY)
      expect(byId[id].reminders).toBeUndefined()
      expect(byId[id].dueDate.slice(0, 10)).toBe(id === 'd16' ? '2026-10-16' : '2026-10-17')
    }
    // No tails appended, today's occurrence untouched.
    expect(next).toHaveLength(6)
    expect(byId.d19.dueDate).toBe('2026-10-19T07:30')
    // The one-off's future reminder moves with it (15th → 20th: +5 days).
    expect(byId.one.reminders?.[0].at).toBe('2026-10-26T13:00')
  })

  it('ignores done / trashed rows and returns prev when nothing applies', () => {
    const prev = [mk('x', { dueDate: '2026-10-10', done: true, trashed: true })]
    const r = todoDeferTo(prev, ['x'], '2026-10-20', TODAY)
    expect(r.next).toBe(prev)
    expect(r.deferred).toBe(0)
  })
})

describe('deleteCategoryCascade leaves no ghost references (10)', () => {
  const cat = (id: string): CategoryDef => ({ id, label: id, color: '#000', icon: 'home' })
  const categories = [cat('home'), cat('work'), cat('errands')]

  it('strips the category from filters, pinned sets (deduped) and stat tiles', () => {
    const res = deleteCategoryCascade({
      todos: [],
      categories,
      id: 'work',
      filter: 'all',
      filters: ['cat:work', 'done'],
      pinnedFilters: [['done'], ['cat:work', 'done'], ['cat:work'], ['cat:home']],
      homeStatTiles: ['cat:work', 'done'],
    })
    expect(res.filters).toEqual(['done'])
    expect(res.pinnedFilters).toEqual([['done'], ['cat:home']])
    expect(res.homeStatTiles).toEqual(['done'])
  })

  it('materializes the default tiles minus the deleted category', () => {
    const res = deleteCategoryCascade({
      todos: [], categories, id: 'home', filter: 'all', pinnedFilters: undefined,
    })
    expect(res.homeStatTiles).toEqual(['cat:work', 'done'])
    expect(res.filters).toBeNull()
  })

  it('keeps references unchanged when the category is not used', () => {
    const pinned = [['done']]
    const tiles = ['done']
    const res = deleteCategoryCascade({
      todos: [], categories, id: 'errands', filter: 'all', filters: ['open'], pinnedFilters: pinned, homeStatTiles: tiles,
    })
    expect(res.filters).toBeNull()
    expect(res.pinnedFilters).toBe(pinned)
    expect(res.homeStatTiles).toBe(tiles)
  })

  it('clears the category on open AND binned rows, and bins nothing', () => {
    const res = deleteCategoryCascade({
      todos: [
        mk('open', { category: 'work' }),
        mk('binned', { category: 'work', done: true, trashed: true, trashedAt: 5 }),
        mk('other', { category: 'home' }),
      ],
      categories,
      id: 'work',
      filter: 'all',
      pinnedFilters: undefined,
    })
    const byId = Object.fromEntries(res.todos.map((t) => [t.id, t]))
    expect(byId.open.trashed).toBe(false)
    expect(byId.open.category).toBeUndefined()
    expect(byId.binned.category).toBeUndefined()
    expect(byId.binned.trashedAt).toBe(5)
    expect(byId.other.category).toBe('home')
    const [restored] = todoRestoreFromTrash(res.todos, 'binned').filter((t) => t.id === 'binned')
    expect(restored.category).toBeUndefined()
  })
})
