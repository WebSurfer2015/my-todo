// @vitest-environment happy-dom
/**
 * useTodosSlice snackbars that must reflect what an action actually did:
 *   - series edit counts (read from the live list, not a setTodos updater)
 *   - finishing a to-do's last step shows the completion snackbar + exact Undo
 *   - defer carries one missed occurrence per series and counts what moved
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTodosSlice, type TodosSliceDeps } from '../store/slices/useTodosSlice'
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
    expect(snacks.at(-1)?.message).toBe('deferred 2')
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
})
