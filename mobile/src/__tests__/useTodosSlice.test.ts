// @vitest-environment happy-dom
/**
 * useTodosSlice snackbars that must reflect what an action actually did:
 *   - series edit counts (read from the live list, not a setTodos updater)
 *   - finishing a to-do's last step shows the completion snackbar + exact Undo
 *   - defer carries one missed occurrence per series and counts what moved
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import {
  useTodosSlice,
  deferSnackbarMessage,
  recurrenceChangedMessage,
  type TodosSliceDeps,
} from '../store/slices/useTodosSlice'
import { createTodoStore } from '../../../core/src/store'
import { strings } from '../../../core/src/data/i18n'
import type { StorageAdapter } from '../../../core/src/ports/persistence'
import type { Filter, Todo } from '../../../core/src/domain/types'
import { wrap } from '../storage/envelope'
import { todayLocal } from '../../../core/src/logic/utils'

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
  changesSaved: 'Changes saved',
  series: {
    trashedMany: (n: number) => `trashed ${n}`,
  },
  snooze: { toTomorrow: 'tomorrow', toNextWeek: 'next week', toDays: (n: number) => `${n} days` },
  defer: { done: (n: number) => `deferred ${n}` },
}

async function setup(todos: Todo[], filter: Filter = 'all') {
  const snacks: Snack[] = []
  const retracted: Array<() => void> = []
  const actions = createTodoStore({ t: strings.en }).actions
  const deps: TodosSliceDeps = {
    filter,
    filterRef: { current: filter },
    uid: null,
    // Local calendar day (toISOString is UTC — wrong under TZ=Etc/GMT+12).
    today: todayLocal(),
    t,
    notify: { showSnackbar: (o) => { snacks.push(o) }, retractSnackbar: (a) => { retracted.push(a) } },
    actions,
  }
  const adapter = adapterWith(todos)
  const hook = renderHook(() => useTodosSlice(adapter, deps))
  await waitFor(() => expect(hook.result.current.todosLoaded).toBe(true))
  await waitFor(() => expect(hook.result.current.todos.length).toBeGreaterThan(0))
  return { hook, snacks, retracted }
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

  it('series edits report how many future occurrences changed, with one exact Undo', async () => {
    const { hook, snacks } = await setup(dailySeries())
    const before = hook.result.current.todos
    act(() => {
      hook.result.current.commitSeriesEdits('d19', { fields: { text: 'Run', priority: 'high' } })
    })
    expect(hook.result.current.todos.every((x) => x.text === 'Run' && x.priority === 'high')).toBe(true)
    const snack = snacks.at(-1)!
    expect(snack.message).toBe('Applied to 7 upcoming to-dos')
    expect(snack.actionLabel).toBe('Undo')
    // Undo reverts this row AND every sibling.
    act(() => snack.onAction!())
    await waitFor(() => expect(hook.result.current.todos.map((x) => x.text)).toEqual(before.map((x) => x.text)))
    expect(hook.result.current.todos.every((x) => x.priority === 'medium')).toBe(true)
  })

  it('steps "Replace all" reports its count and undoes the copy', async () => {
    const series = dailySeries()
    series[0] = { ...series[0], subtasks: [{ id: 'st', text: 'shoes', done: false, priority: 'medium', dueDate: '' }] }
    const { hook, snacks } = await setup(series)
    act(() => {
      hook.result.current.commitSeriesEdits('d19', { fields: {}, subtasks: { keepDetached: false } })
    })
    expect(hook.result.current.todos.filter((x) => x.subtasks?.length).length).toBe(8)
    expect(snacks.at(-1)?.message).toBe('Steps applied to 7 upcoming to-dos')
    act(() => snacks.at(-1)!.onAction!())
    await waitFor(() => expect(hook.result.current.todos.filter((x) => x.subtasks?.length).length).toBe(1))
  })

  it('a series edit that reaches no sibling says "Changes saved" — still with Undo', async () => {
    // Every future sibling is detached → the edit lands on this row only.
    const { hook, snacks } = await setup(dailySeries().map((x) => (x.id === 'd19' ? x : { ...x, detachedFromSeries: true })))
    act(() => {
      hook.result.current.commitSeriesEdits('d19', { fields: { notes: 'bring water' } })
    })
    expect(snacks.at(-1)).toMatchObject({ message: 'Changes saved', actionLabel: 'Undo' })
    act(() => snacks.at(-1)!.onAction!())
    await waitFor(() => expect(hook.result.current.todos.find((x) => x.id === 'd19')?.notes).toBeUndefined())
  })

  it('field edits + a rule change fold into ONE Undo', async () => {
    const { hook, snacks } = await setup(dailySeries())
    const before = hook.result.current.todos.map((x) => x.id)
    const n = snacks.length
    act(() => {
      hook.result.current.commitSeriesEdits('d19', {
        fields: { text: 'Run' },
        recurrence: { value: { freq: 'weekly' }, keepDetached: true },
      })
    })
    expect(snacks.length).toBe(n + 1)
    expect(snacks.at(-1)?.message).toBe('Repeat updated · 7 upcoming to-dos replaced')
    act(() => snacks.at(-1)!.onAction!())
    await waitFor(() => expect(hook.result.current.todos.map((x) => x.id)).toEqual(before))
    expect(hook.result.current.todos.every((x) => x.text === 'Walk' && x.recurrence?.freq === 'daily')).toBe(true)
  })

  it('a rule change honors keepDetached: true keeps a detached sibling, false replaces it', async () => {
    const withDetached = () =>
      dailySeries().map((x) => (x.id === 'd22' ? { ...x, text: 'Long walk', detachedFromSeries: true } : x))
    const kept = await setup(withDetached())
    act(() => {
      kept.hook.result.current.commitSeriesEdits('d19', { fields: {}, recurrence: { value: { freq: 'weekly' }, keepDetached: true } })
    })
    expect(kept.hook.result.current.todos.find((x) => x.id === 'd22' && !x.trashed)?.text).toBe('Long walk')
    kept.hook.unmount()
    const replaced = await setup(withDetached())
    act(() => {
      replaced.hook.result.current.commitSeriesEdits('d19', { fields: {}, recurrence: { value: { freq: 'weekly' }, keepDetached: false } })
    })
    expect(replaced.hook.result.current.todos.some((x) => x.id === 'd22' && !x.trashed)).toBe(false)
  })

  it('finishing the last step: the inline Undo also retracts its own snackbar', async () => {
    const parent = mk('p', {
      text: 'Pack',
      subtasks: [{ id: 's', text: 'bag', done: false, priority: 'medium', dueDate: '' }],
    })
    const { hook, snacks, retracted } = await setup([parent])
    let inline: (() => void) | null = null
    act(() => {
      inline = hook.result.current.toggleSubtask('p', 's')
    })
    const snack = snacks.at(-1)!
    expect(inline).not.toBe(snack.onAction)
    act(() => inline!())
    expect(retracted).toEqual([snack.onAction])
    await waitFor(() => expect(hook.result.current.todos[0].done).toBe(false))
  })

  it('silent (Ask Mochi) actions show no snackbar but still return an Undo', async () => {
    const parent = mk('p', { subtasks: [{ id: 's', text: 'bag', done: false, priority: 'medium', dueDate: '' }] })
    const { hook, snacks } = await setup([mk('a'), mk('b'), mk('c', { dueDate: '2026-10-10' }), mk('d'), parent])
    const n = snacks.length
    const undos: Array<(() => void) | null> = []
    act(() => {
      undos.push(hook.result.current.toggleSubtask('p', 's', { silent: true }))
      undos.push(hook.result.current.skipTodo('d', { silent: true }))
      undos.push(hook.result.current.bulkDeferTodos(['c'], '2026-10-25', { silent: true }))
    })
    expect(undos.every(Boolean)).toBe(true)
    expect(snacks.length).toBe(n)
    let undo: (() => void) | null = null
    act(() => {
      undo = hook.result.current.toggle('b', { silent: true })
    })
    expect(snacks.length).toBe(n)
    expect(undo).not.toBeNull()
    act(() => {
      hook.result.current.moveToTrash('a', { silent: true })
    })
    expect(snacks.length).toBe(n)
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
    expect(snacks.at(-1)?.message).toBe('Deferred to Wed, Oct 21 · 2 earlier repeats tucked into Done.')
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
    const before = hook.result.current.todos.map((x) => x.id)
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
    // The removed daily siblings come back, in their original order.
    expect(hook.result.current.todos.map((x) => x.id)).toEqual(before)
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

describe('useTodosSlice round 4', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('addTaskWithUndo returns the seed — the earliest occurrence — of a new series', async () => {
    const { hook } = await setup([mk('keep')])
    let added: { id: string } | null = null
    act(() => {
      added = hook.result.current.addTaskWithUndo('Stretch', 'medium', '2026-10-19', undefined, { freq: 'daily' })
    })
    const rows = hook.result.current.todos.filter((x) => x.text === 'Stretch')
    expect(rows.length).toBeGreaterThan(1)
    const earliest = [...rows].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
    expect(added!.id).toBe(earliest.id)
    expect(earliest.dueDate.startsWith('2026-10-19')).toBe(true)
  })

  it('updateRecurrence keeps a detached sibling exactly as the user left it', async () => {
    const todos = dailySeries().map((x) =>
      x.id === 'd22' ? { ...x, text: 'Long walk', detachedFromSeries: true } : x,
    )
    const { hook } = await setup(todos)
    act(() => {
      hook.result.current.updateRecurrence('d19', { freq: 'weekly' })
    })
    const kept = hook.result.current.todos.find((x) => x.id === 'd22')
    expect(kept).toBeDefined()
    expect(kept!.text).toBe('Long walk')
    expect(kept!.dueDate).toBe('2026-10-22')
    expect(kept!.trashed).toBe(false)
    // The plain daily siblings were replaced by the weekly tail.
    expect(hook.result.current.todos.some((x) => x.id === 'd20')).toBe(false)
  })

  it('a series rule change from details offers an exact Undo on its snackbar', async () => {
    const { hook, snacks } = await setup(dailySeries())
    const before = hook.result.current.todos.map((x) => x.id)
    let undo: (() => void) | null = null
    act(() => {
      undo = hook.result.current.commitSeriesEdits('d19', { fields: {}, recurrence: { value: { freq: 'weekly' }, keepDetached: true } })
    })
    const snack = snacks.at(-1)!
    expect(snack.message).toBe('Repeat updated · 7 upcoming to-dos replaced')
    expect(snack.actionLabel).toBe('Undo')
    expect(undo).not.toBeNull()
    act(() => snack.onAction!())
    await waitFor(() => expect(hook.result.current.todos.map((x) => x.id)).toEqual(before))
    expect(hook.result.current.todos.every((x) => x.recurrence?.freq === 'daily')).toBe(true)
  })

  it('a series commit that changes nothing returns no Undo and says nothing', async () => {
    const { hook, snacks } = await setup([mk('solo')])
    const n = snacks.length
    let undo: (() => void) | null = () => {}
    act(() => {
      undo = hook.result.current.commitSeriesEdits('solo', { fields: {}, recurrence: { value: { freq: 'weekly' }, keepDetached: true } })
    })
    expect(undo).toBeNull()
    expect(snacks.length).toBe(n)
  })
})

describe('recurrenceChangedMessage', () => {
  it('pluralizes and drops the count when nothing was replaced', () => {
    expect(recurrenceChangedMessage(0)).toBe('Repeat updated')
    expect(recurrenceChangedMessage(1)).toBe('Repeat updated · 1 upcoming to-do replaced')
    expect(recurrenceChangedMessage(3)).toBe('Repeat updated · 3 upcoming to-dos replaced')
  })
})

describe('useTodosSlice round 6', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('a category-only series edit reaches this row and every future sibling; Undo restores them', async () => {
    const { hook, snacks } = await setup(dailySeries())
    act(() => {
      hook.result.current.commitSeriesEdits('d19', { fields: { category: 'work' } })
    })
    expect(hook.result.current.todos.every((x) => x.category === 'work')).toBe(true)
    expect(snacks.at(-1)?.message).toBe('Applied to 7 upcoming to-dos')
    act(() => snacks.at(-1)!.onAction!())
    await waitFor(() => expect(hook.result.current.todos.every((x) => x.category === undefined)).toBe(true))
  })

  it("series mode: this occurrence's date + reminders ride the same commit and its one Undo", async () => {
    const { hook, snacks } = await setup(dailySeries())
    const reminders = [{ id: 'r1', at: '2026-10-21T09:00' }] as unknown as NonNullable<Todo['reminders']>
    act(() => {
      hook.result.current.commitSeriesEdits('d19', {
        fields: { priority: 'high' },
        thisRow: { dueDate: '2026-10-19T08:30', reminders },
      })
    })
    const row = () => hook.result.current.todos.find((x) => x.id === 'd19')!
    expect(row().dueDate).toBe('2026-10-19T08:30')
    expect(row().reminders).toEqual(reminders)
    // Siblings keep their own dates.
    expect(hook.result.current.todos.find((x) => x.id === 'd20')!.dueDate).toBe('2026-10-20')
    act(() => snacks.at(-1)!.onAction!())
    await waitFor(() => expect(row().dueDate).toBe('2026-10-19'))
    expect(row().reminders ?? []).toEqual([])
    expect(row().priority).toBe('medium')
  })

  it('a date-only series-mode commit still saves, with "Changes saved · Undo"', async () => {
    const { hook, snacks } = await setup(dailySeries())
    let undo: (() => void) | null = null
    act(() => {
      undo = hook.result.current.commitSeriesEdits('d19', { fields: {}, thisRow: { dueDate: '2026-10-19T07:00' } })
    })
    expect(undo).not.toBeNull()
    expect(snacks.at(-1)?.message).toBe('Changes saved')
  })

  it('reopening from Done says "Moved back…" with an exact Undo — and nothing when silent', async () => {
    const done = (id: string) => mk(id, { done: true, trashed: true, completedAt: '2026-10-18' } as Partial<Todo>)
    const { hook, snacks } = await setup([done('x'), done('y'), mk('open')], 'done')
    const n = snacks.length
    act(() => {
      hook.result.current.toggle('y', { silent: true })
    })
    expect(snacks.length).toBe(n)
    act(() => {
      hook.result.current.toggle('x')
    })
    const snack = snacks.at(-1)!
    expect(snack.message).toBe('Moved back to your open list.')
    expect(snack.actionLabel).toBe('Undo')
    expect(hook.result.current.todos.find((x) => x.id === 'x')!.done).toBe(false)
    act(() => snack.onAction!())
    await waitFor(() => expect(hook.result.current.todos.find((x) => x.id === 'x')!.done).toBe(true))
  })

  it('restoreFromTrash in the Done view offers an Undo (silent: none)', async () => {
    const { hook, snacks } = await setup([mk('t1', { trashed: true }), mk('t2', { trashed: true }), mk('o')], 'trash')
    const n = snacks.length
    act(() => hook.result.current.restoreFromTrash('t2', { silent: true }))
    expect(snacks.length).toBe(n)
    act(() => hook.result.current.restoreFromTrash('t1'))
    const snack = snacks.at(-1)!
    expect(snack.message).toBe('Moved back to your open list.')
    expect(hook.result.current.todos.find((x) => x.id === 't1')!.trashed).toBe(false)
    act(() => snack.onAction!())
    await waitFor(() => expect(hook.result.current.todos.find((x) => x.id === 't1')!.trashed).toBe(true))
  })

  it('un-ticking a step of a done to-do in the Done view reopens it with an Undo; silent says nothing', async () => {
    const step = { id: 's', text: 'bag', done: true, priority: 'medium' as const, dueDate: '' }
    const doneWithStep = (id: string) => mk(id, { done: true, trashed: true, subtasks: [{ ...step }] } as Partial<Todo>)
    const { hook, snacks } = await setup([doneWithStep('p'), doneWithStep('q'), mk('o')], 'done')
    const n = snacks.length
    act(() => {
      hook.result.current.toggleSubtask('q', 's', { silent: true })
    })
    expect(snacks.length).toBe(n)
    act(() => {
      hook.result.current.toggleSubtask('p', 's')
    })
    expect(snacks.at(-1)?.message).toBe('Moved back to your open list.')
    expect(snacks.at(-1)?.actionLabel).toBe('Undo')
  })
})

