// @vitest-environment happy-dom
/**
 * Details' close "Changes saved · Undo" (buildDetailsUndo) against the REAL
 * todos slice: a repeat added to a one-off while details was open generated
 * a series — one Undo must remove it all and put the row back as it opened,
 * without a misleading "later changes were kept" (the date snap and close
 * flush edited the row after the repeat change).
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTodosSlice, PARTIAL_UNDO_MESSAGE, type TodosSliceDeps } from '../store/slices/useTodosSlice'
import { buildDetailsUndo, type RecurrenceStep } from '../features/task/TaskDetailsSheet/detailsUndo'
import { createTodoStore } from '../../../core/src/store'
import { strings } from '../../../core/src/data/i18n'
import { wrapEnvelope, type StorageAdapter } from '../../../core/src/ports/persistence'
import type { Recurrence, Todo } from '../../../core/src/domain/types'
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

async function setup(todos: Todo[]) {
  const snacks: Snack[] = []
  const data = new Map<string, string>([['todos', wrapEnvelope(todos)]])
  const adapter: StorageAdapter = {
    async getItem(key) { return data.get(key) ?? null },
    async setItem(key, value) { data.set(key, value) },
    async removeItem(key) { data.delete(key) },
  }
  const deps: TodosSliceDeps = {
    filter: 'all',
    filterRef: { current: 'all' },
    uid: null,
    today: todayLocal(),
    t: strings.en as unknown as TodosSliceDeps['t'],
    notify: { showSnackbar: (o) => { snacks.push(o) }, retractSnackbar: () => {} },
    actions: createTodoStore({ t: strings.en }).actions,
  }
  const hook = renderHook(() => useTodosSlice(adapter, deps))
  await waitFor(() => expect(hook.result.current.todosLoaded).toBe(true))
  await waitFor(() => expect(hook.result.current.todos.length).toBeGreaterThan(0))
  return { hook, snacks }
}

describe('buildDetailsUndo', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('a repeat added to a one-off, then the row edited: one Undo removes the series and restores the row', async () => {
    const entry = mk('a', { text: 'Water plants', dueDate: '2026-10-19' })
    const { hook, snacks } = await setup([entry])
    const slice = () => hook.result.current
    const steps: RecurrenceStep[] = []
    act(() => {
      const undo = slice().updateRecurrence('a', { freq: 'daily' })
      const rowAfter = slice().todosRef.current.find((td) => td.id === 'a')
      if (undo && rowAfter) steps.push({ rowAfter, undo })
    })
    // Later in the session (and the close flush): the row is edited again.
    act(() => {
      slice().updateText('a', 'Water the plants')
      slice().updateDueDate('a', '2026-10-20')
    })
    expect(slice().todos.length).toBeGreaterThan(1)
    const snap = entry
    let result = false
    act(() => {
      result = buildDetailsUndo(snap, steps, slice().revertTodo)()
    })
    expect(result).toBe(true)
    await waitFor(() => expect(slice().todos.length).toBe(1))
    const row = slice().todos[0]
    expect(row.text).toBe('Water plants')
    expect(row.dueDate).toBe('2026-10-19')
    expect(row.recurrence).toBeUndefined()
    expect(row.seriesId).toBeUndefined()
    expect(snacks.some((s) => s.message === PARTIAL_UNDO_MESSAGE)).toBe(false)
  })

  it('two repeat changes in one session unwind newest-first', async () => {
    const entry = mk('a', { text: 'Stretch', dueDate: '2026-10-19' })
    const { hook } = await setup([entry])
    const slice = () => hook.result.current
    const steps: RecurrenceStep[] = []
    const record = (r: Recurrence) => {
      const undo = slice().updateRecurrence('a', r)
      const rowAfter = slice().todosRef.current.find((td) => td.id === 'a')
      if (undo && rowAfter) steps.push({ rowAfter, undo })
    }
    act(() => record({ freq: 'daily' }))
    act(() => record({ freq: 'weekly' }))
    act(() => {
      buildDetailsUndo(entry, steps, slice().revertTodo)()
    })
    await waitFor(() => expect(slice().todos.length).toBe(1))
    expect(slice().todos[0].recurrence).toBeUndefined()
  })

  it('no repeat change: just restores the snapshot (pure)', () => {
    const revert = vi.fn(() => true)
    const snap = mk('a')
    expect(buildDetailsUndo(snap, [], revert)()).toBe(true)
    expect(revert).toHaveBeenCalledWith(snap)
  })

  it('order: each step re-poses its row then runs its Undo, newest first; the snapshot last (pure)', () => {
    const calls: string[] = []
    const revert = (row: Todo) => { calls.push(`revert:${row.text}`); return true }
    const steps: RecurrenceStep[] = [
      { rowAfter: mk('a', { text: 'after1' }), undo: () => { calls.push('undo1'); return true } },
      { rowAfter: mk('a', { text: 'after2' }), undo: () => { calls.push('undo2'); return false } },
    ]
    buildDetailsUndo(mk('a', { text: 'entry' }), steps, revert)()
    expect(calls).toEqual(['revert:after2', 'undo2', 'revert:after1', 'undo1', 'revert:entry'])
  })

  it('reports false when nothing was put back', () => {
    expect(buildDetailsUndo(mk('a'), [{ rowAfter: mk('a'), undo: () => false }], () => false)()).toBe(false)
  })
})
