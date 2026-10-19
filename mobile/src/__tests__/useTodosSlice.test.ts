// @vitest-environment happy-dom
/**
 * useTodosSlice snackbars that must reflect what an action actually did:
 *   - series edit counts (read from the live list, not a setTodos updater)
 *   - finishing a to-do's last step shows the completion snackbar + exact Undo
 *   - defer carries one missed occurrence per series and counts what moved
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTodosSlice, deferSnackbarMessage, type TodosSliceDeps } from '../store/slices/useTodosSlice'
import { createTodoStore } from '../../../core/src/store'
import { strings } from '../../../core/src/data/i18n'
import type { StorageAdapter } from '../../../core/src/ports/persistence'
import type { Filter, Todo } from '../../../core/src/domain/types'
import { wrap } from '../storage/envelope'

type Snack = Parameters<TodosSliceDeps['notify']['showSnackbar']>[0]

const mk = (id: string, extra: Partial<Todo> = {}): Todo => ({
  id,
  text: id,
  done: false,
  priority: 'medium',
  dueDate: '',
  trashed: false,
  ...extra,
})

function adapterWith(todos: Todo[]): StorageAdapter {
  const data = new Map<string, string>([['todos', wrap(todos)]])
  return {
    async getItem(key) { return data.get(key) ?? null },
    async setItem(key, value) { data.set(key, value) },
    async removeItem(key) { data.delete(key) },
    async clear() { data.clear() },
  }
}

const t = {
  movedToTrash: 'trashed',
  movedToTrashMany: (n: number) => `trashed ${n}`,
  skippedSnackbar: 'skipped',
  completedSnackbar: (text: string) => `Done: ${text}`,
  completedSnackbarMany: (n: number) => `${n} done`,
  undo: 'Undo',
  undoAll: 'Undo all',
  emptyTrash: 'Empty',
  deletePermanentlyConfirm: (l: string) => l,
  filters: { trash: 'Trash' },
  cancel: 'Cancel',
  bulkDeletePermanently: 'Delete',
  bulkDeleteConfirm: (n: number) => String(n),
  clearAllCompleted: 'Clear',
  emptyTrashConfirm: (n: number) => String(n),
  deletePermanently: 'Delete',
  series: {
    editsApplied: (n: number) => `applied ${n}`,
    editsNothing: 'Nothing to apply',
    trashedMany: (n: number) => `trashed ${n}`,
    recurrenceRecreated: (n: number) => `recreated ${n}`,
    subtasksApplied: (n: number) => `steps ${n}`,
  },
  snooze: { toTomorrow: 'tomorrow', toNextWeek: 'next week', toDays: (n: number) => `${n} days` },
  defer: { done: (n: number) => `deferred ${n}` },
}

async function setup(todos: Todo[]) {
  const snacks: Snack[] = []
  const actions = createTodoStore({ t: strings.en }).actions
  const filter: Filter = 'all'
  const deps: TodosSliceDeps = {
    filter,
    filterRef: { current: filter },
    uid: null,
    today: new Date().toISOString().slice(0, 10),
    t,
    notify: { showSnackbar: (o) => { snacks.push(o) } },
    actions,
  }
  const adapter = adapterWith(todos)
  const hook = renderHook(() => useTodosSlice(adapter, deps))
  await waitFor(() => expect(hook.result.current.todosLoaded).toBe(true))
  await waitFor(() => expect(hook.result.current.todos.length).toBeGreaterThan(0))
  return { hook, snacks }
}

// A daily series already filled to its 7-day window, so the post-load
// top-up leaves it alone.
const dailySeries = (): Todo[] =>
  Array.from({ length: 8 }, (_, i) =>
    mk(`d${19 + i}`, {
      text: 'Walk',
      dueDate: `2026-10-${19 + i}`,
      seriesId: 's1',
      recurrence: { freq: 'daily' },
    }),
  )

describe('useTodosSlice snackbars', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('series edits report how many future occurrences changed', async () => {
    const { hook, snacks } = await setup(dailySeries())
    act(() => hook.result.current.applySeriesFutureEdits('d19', { text: 'Run' }))
    expect(snacks.at(-1)?.message).toBe('applied 7')
    act(() => hook.result.current.applySeriesSubtasks('d19', { keepDetached: true }))
    expect(snacks.at(-1)?.message).toBe('steps 7')
  })

  it('finishing the last step shows the completion snackbar with an exact Undo', async () => {
    const parent = mk('p', {
      text: 'Pack',
      dueDate: '2026-10-19',
      subtasks: [{ id: 's', text: 'bag', done: false, priority: 'medium', dueDate: '' }],
    })
    const { hook, snacks } = await setup([parent])
    act(() => hook.result.current.toggleSubtask('p', 's'))
    await waitFor(() => expect(hook.result.current.todos[0].done).toBe(true))
    const snack = snacks.at(-1)
    expect(snack?.message).toBe('Done: Pack')
    expect(snack?.actionLabel).toBe('Undo')
    expect(snack?.mergeKey).toBe('done')
    act(() => snack?.onAction?.())
    await waitFor(() => expect(hook.result.current.todos[0].done).toBe(false))
    expect(hook.result.current.todos[0].subtasks?.[0].done).toBe(false)
    expect(hook.result.current.todos[0].trashed).toBe(false)
  })

  it('defer moves one missed occurrence per series and counts it once', async () => {
    const missed = [16, 17, 18].map((d) =>
      mk(`m${d}`, { text: 'Walk', dueDate: `2026-10-${d}`, seriesId: 's2', recurrence: { freq: 'weekly' } }),
    )
    // Weekly window (a month) already covered by m18 + future rows.
    const future = [25, 32, 39].map((d, i) =>
      mk(`f${i}`, {
        text: 'Walk',
        dueDate: d <= 31 ? `2026-10-${d}` : `2026-11-${String(d - 31).padStart(2, '0')}`,
        seriesId: 's2',
        recurrence: { freq: 'weekly' },
      }),
    )
    const { hook, snacks } = await setup([...missed, ...future, mk('solo', { dueDate: '2026-10-10' })])
    const before = hook.result.current.todos
    act(() => hook.result.current.deferOverdue(1))
    expect(snacks.at(-1)?.message).toBe('deferred 2 · 2 earlier repeats tucked into Done.')
    const byId = Object.fromEntries(hook.result.current.todos.map((x) => [x.id, x]))
    expect(byId.m18.dueDate).toBe('2026-10-20')
    expect(byId.solo.dueDate).toBe('2026-10-20')
    expect(byId.m16.status).toBe('notDo')
    act(() => snacks.at(-1)?.onAction?.())
    await waitFor(() => {
      const after = Object.fromEntries(hook.result.current.todos.map((x) => [x.id, x]))
      expect(after.m16.status).toBeUndefined()
    })
    expect(hook.result.current.todos.map((x) => x.dueDate).sort()).toEqual(before.map((x) => x.dueDate).sort())
  })

  it('bulkDeferTodos (Ask Mochi defer) keeps the time and returns an exact Undo', async () => {
    const { hook } = await setup([mk('a', { dueDate: '2026-10-10T09:30' }), mk('b', { dueDate: '2026-10-11' })])
    let undo: (() => void) | null = null
    act(() => {
      undo = hook.result.current.bulkDeferTodos(['a', 'b'], '2026-10-25')
    })
    const byId = () => Object.fromEntries(hook.result.current.todos.map((x) => [x.id, x]))
    expect(byId().a.dueDate).toBe('2026-10-25T09:30')
    expect(byId().b.dueDate).toBe('2026-10-25')
    expect(undo).not.toBeNull()
    act(() => undo!())
    await waitFor(() => expect(byId().a.dueDate).toBe('2026-10-10T09:30'))
    expect(byId().b.dueDate).toBe('2026-10-11')
  })

  it('bulkDeferTodos returns null when nothing moved', async () => {
    const { hook } = await setup([mk('a', { dueDate: '2026-10-10' })])
    let undo: (() => void) | null = () => {}
    act(() => {
      undo = hook.result.current.bulkDeferTodos(['a'], 'not-a-date')
    })
    expect(undo).toBeNull()
  })
})

describe('deferSnackbarMessage', () => {
  it('adds the tucked-away repeats, pluralized', () => {
    expect(deferSnackbarMessage('1 to-do deferred.', 0)).toBe('1 to-do deferred.')
    expect(deferSnackbarMessage('1 to-do deferred.', 1)).toBe(
      '1 to-do deferred · 1 earlier repeat tucked into Done.',
    )
    expect(deferSnackbarMessage('1 to-do deferred.', 3)).toBe(
      '1 to-do deferred · 3 earlier repeats tucked into Done.',
    )
  })
})

describe('useTodosSlice ordering + timing', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('a mixed Mochi batch (add X, then complete a series) undoes exactly the completion', async () => {
    const series = dailySeries()
    const { hook } = await setup(series)
    let undo: (() => void) | null = null
    act(() => {
      hook.result.current.addTask('Buy milk', 'medium', '')
      undo = hook.result.current.toggle('d19')
    })
    await waitFor(() => expect(hook.result.current.todos.find((x) => x.id === 'd19')?.done).toBe(true))
    // X + the appended next occurrence.
    expect(hook.result.current.todos.length).toBe(series.length + 2)
    act(() => undo?.())
    await waitFor(() => expect(hook.result.current.todos.find((x) => x.id === 'd19')?.done).toBe(false))
    // Only X remains added: the appended occurrence was reverted too.
    expect(hook.result.current.todos.length).toBe(series.length + 1)
    expect(hook.result.current.todos.some((x) => x.text === 'Buy milk')).toBe(true)
  })

  it('every mutation advances todosRef synchronously', async () => {
    const { hook } = await setup([mk('a')])
    act(() => {
      hook.result.current.updateText('a', 'renamed')
      expect(hook.result.current.todosRef.current[0].text).toBe('renamed')
      hook.result.current.addSubtask('a', 'step')
      expect(hook.result.current.todosRef.current[0].subtasks?.length).toBe(1)
    })
  })

  it('snooze keeps the time of day and moves an upcoming reminder with it', async () => {
    const at = new Date(2026, 9, 19, 14, 0, 0).toISOString()
    const { hook } = await setup([
      mk('t', { dueDate: '2026-10-19T15:00', reminders: [{ id: 'r', at }] }),
    ])
    act(() => hook.result.current.snooze('t', 1))
    const t1 = hook.result.current.todos[0]
    expect(t1.dueDate).toBe('2026-10-20T15:00')
    expect(new Date(t1.reminders![0].at).getDate()).toBe(20)
    expect(new Date(t1.reminders![0].at).getHours()).toBe(14)
  })

  it('bulk defer reports the earlier repeats it tucked into Done', async () => {
    const missed = [16, 17, 18].map((d) =>
      mk(`m${d}`, { text: 'Walk', dueDate: `2026-10-${d}`, seriesId: 's2', recurrence: { freq: 'weekly' } }),
    )
    const future = mk('f25', { text: 'Walk', dueDate: '2026-10-25', seriesId: 's2', recurrence: { freq: 'weekly' } })
    const { hook, snacks } = await setup([...missed, future])
    act(() => hook.result.current.bulkDeferTodos(['m16', 'm17', 'm18'], '2026-10-21'))
    expect(snacks.at(-1)?.message).toBe('1 to-do deferred · 2 earlier repeats tucked into Done.')
    expect(snacks.at(-1)?.actionLabel).toBe('Undo all')
  })
})

describe('series top-up waits for server-confirmed todos', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('does not top up cache-first data; tops up once a server snapshot lands', async () => {
    // A daily series with only today's occurrence: the top-up adds a tail.
    const lone = [mk('d19', { text: 'Walk', dueDate: '2026-10-19', seriesId: 's1', recurrence: { freq: 'daily' } })]
    type Cb = (v: string | null, meta?: { trusted: boolean; fromServer?: boolean }) => void
    const subs = new Map<string, Cb>()
    const adapter: StorageAdapter = {
      ...adapterWith(lone),
      subscribe: (k, cb) => {
        subs.set(k, cb)
        return () => { subs.delete(k) }
      },
    }
    const sub = (v: string | null, meta: { trusted: boolean; fromServer?: boolean }) => subs.get('todos')!(v, meta)
    const deps: TodosSliceDeps = {
      filter: 'all',
      filterRef: { current: 'all' },
      uid: 'u1',
      today: '2026-10-19',
      t,
      notify: { showSnackbar: () => {} },
      actions: createTodoStore({ t: strings.en }).actions,
    }
    const hook = renderHook(() => useTodosSlice(adapter, deps))
    await waitFor(() => expect(hook.result.current.todosLoaded).toBe(true))
    expect(hook.result.current.todos.length).toBe(1)
    // A cache snapshot is not server confirmation → still no top-up.
    act(() => sub(wrap(lone), { trusted: true, fromServer: false }))
    expect(hook.result.current.todos.length).toBe(1)
    act(() => sub(wrap(lone), { trusted: true, fromServer: true }))
    await waitFor(() => expect(hook.result.current.todos.length).toBeGreaterThan(1))
  })
})

describe('useTodosSlice exact Undos (round 3)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
  })
  afterEach(() => vi.useRealTimers())
  const byId = (todos: Todo[]) => Object.fromEntries(todos.map((x) => [x.id, x]))

  it('Undo reverts only its own change — a later edit survives', async () => {
    const { hook } = await setup([mk('a'), mk('b')])
    let undo: (() => void) | null = null
    act(() => {
      undo = hook.result.current.toggle('a')
    })
    act(() => hook.result.current.updateText('b', 'renamed'))
    act(() => undo!())
    await waitFor(() => expect(byId(hook.result.current.todos).a.done).toBe(false))
    expect(byId(hook.result.current.todos).b.text).toBe('renamed')
  })

  it('a local edit re-applies onto a remote snapshot that landed in the same tick', async () => {
    type Cb = (v: string | null, meta?: { trusted: boolean; fromServer?: boolean }) => void
    const subs = new Map<string, Cb>()
    const seed = [mk('a', { updatedAt: 1 }), mk('b', { updatedAt: 1 })]
    const adapter: StorageAdapter = {
      ...adapterWith(seed),
      subscribe: (k, cb) => {
        subs.set(k, cb)
        return () => { subs.delete(k) }
      },
    }
    const deps: TodosSliceDeps = {
      filter: 'all',
      filterRef: { current: 'all' },
      uid: 'u1',
      today: '2026-10-19',
      t,
      notify: { showSnackbar: () => {} },
      actions: createTodoStore({ t: strings.en }).actions,
    }
    const hook = renderHook(() => useTodosSlice(adapter, deps))
    await waitFor(() => expect(hook.result.current.todos.length).toBe(2))
    act(() => {
      subs.get('todos')!(wrap([mk('a', { updatedAt: 1 }), mk('b', { text: 'remote', updatedAt: 99 })]), {
        trusted: true,
        fromServer: true,
      })
      hook.result.current.updateText('a', 'local')
    })
    await waitFor(() => expect(byId(hook.result.current.todos).a.text).toBe('local'))
    expect(byId(hook.result.current.todos).b.text).toBe('remote')
  })

  it('a single-row defer offers "Undo", not "Undo all"', async () => {
    const { hook, snacks } = await setup([mk('a', { dueDate: '2026-10-10' })])
    act(() => {
      hook.result.current.bulkDeferTodos(['a'], '2026-10-25')
    })
    expect(snacks.at(-1)?.actionLabel).toBe('Undo')
  })

  it('updateRecurrence on a series occurrence changes the series rule, with an Undo', async () => {
    const { hook } = await setup(dailySeries())
    let undo: (() => void) | null = null
    act(() => {
      undo = hook.result.current.updateRecurrence('d19', { freq: 'weekly' })
    })
    const live = () => hook.result.current.todos.filter((x) => x.seriesId === 's1' && !x.trashed)
    // No open sibling keeps repeating the old daily rule.
    expect(live().every((x) => x.recurrence?.freq === 'weekly')).toBe(true)
    expect(live().some((x) => x.dueDate.startsWith('2026-10-20'))).toBe(false)
    expect(undo).not.toBeNull()
    act(() => undo!())
    await waitFor(() => expect(byId(hook.result.current.todos).d19.recurrence?.freq).toBe('daily'))
    expect(hook.result.current.todos.some((x) => x.recurrence?.freq === 'weekly')).toBe(false)
  })

  it('updateRecurrence on a one-off starts a series and fills its window; Undo removes it all', async () => {
    const { hook } = await setup([mk('a', { dueDate: '2026-10-19' })])
    let undo: (() => void) | null = null
    act(() => {
      undo = hook.result.current.updateRecurrence('a', { freq: 'daily' })
    })
    expect(hook.result.current.todos.length).toBeGreaterThan(1)
    act(() => undo!())
    await waitFor(() => expect(hook.result.current.todos.length).toBe(1))
    expect(hook.result.current.todos[0].recurrence).toBeUndefined()
  })

  it('step add / toggle / remove each return an exact Undo', async () => {
    const parent = mk('p', {
      subtasks: [
        { id: 's1', text: 'one', done: false, priority: 'medium', dueDate: '' },
        { id: 's2', text: 'two', done: false, priority: 'medium', dueDate: '' },
      ],
    })
    const { hook } = await setup([parent])
    const p = () => hook.result.current.todos[0]
    let u1: (() => void) | null = null
    let u2: (() => void) | null = null
    let u3: (() => void) | null = null
    act(() => {
      u1 = hook.result.current.toggleSubtask('p', 's1')
      u2 = hook.result.current.removeSubtask('p', 's2')
      u3 = hook.result.current.addSubtask('p', 'three')
    })
    expect(p().subtasks?.map((s) => s.text)).toEqual(['one', 'three'])
    act(() => u3!())
    act(() => u2!())
    act(() => u1!())
    await waitFor(() => expect(p().subtasks?.map((s) => [s.text, s.done])).toEqual([['one', false], ['two', false]]))
    expect(hook.result.current.toggleSubtask('missing', 'x')).toBeNull()
  })

  it('addTaskWithUndo removes every occurrence of a new repeating to-do', async () => {
    const { hook } = await setup([mk('keep')])
    let added: { id: string; undo: () => void } | null = null
    act(() => {
      added = hook.result.current.addTaskWithUndo('Stretch', 'medium', '2026-10-19', undefined, { freq: 'daily' })
    })
    expect(hook.result.current.todos.filter((x) => x.text === 'Stretch').length).toBeGreaterThan(1)
    act(() => {
      expect(hook.result.current.addTask('Plain', 'low', '')).toEqual(expect.any(String))
    })
    act(() => added!.undo())
    await waitFor(() => expect(hook.result.current.todos.some((x) => x.text === 'Stretch')).toBe(false))
    expect(hook.result.current.todos.map((x) => x.text).sort()).toEqual(['Plain', 'keep'])
  })
})
