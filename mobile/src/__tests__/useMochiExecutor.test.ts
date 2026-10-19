// @vitest-environment happy-dom
/**
 * useMochiExecutor (Ask Mochi's apply path) against a fake store:
 *   - only the latest applied turn keeps its inline Undo (an older turn's
 *     revert could overwrite a newer edit) — mochiUndo generations
 *   - a captured REPEATING to-do's Undo silently removes the new series +
 *     the category it created (no "just this one / whole series" Alert)
 *   - setGroceryChecked's Undo restores the ABSOLUTE previous state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { Alert } from 'react-native'
import { useMochiExecutor, combineUndos } from '../app/useMochiExecutor'
import { beginMochiTurn, isUndoLive, useUndoLive } from '../app/mochiUndo'
import { strings } from '../../../core/src/data/i18n'
import type { Strings } from '../core-bindings/i18n'
import type { Todo } from '../../../core/src/domain/types'
import type { ProposedOperation } from '../../../core/src/ports/aiContracts'

const todo = (id: string, extra: Partial<Todo> = {}): Todo => ({
  id,
  text: id,
  done: false,
  priority: 'medium',
  dueDate: '',
  trashed: false,
  ...extra,
})

type Fake = {
  todos: Todo[]
  categories: Array<{ id: string; label?: string; color: string; icon: string }>
  groceries: Array<{ id: string; text: string; checked?: boolean }>
  todosRef: { current: Todo[] }
  calls: string[]
  [k: string]: unknown
}

function fakeStore(): Fake {
  const s: Fake = {
    todos: [todo('a'), todo('b')],
    categories: [{ id: 'home', label: 'Home', color: '#000', icon: 'home' }],
    groceries: [{ id: 'g', text: 'milk', checked: false }],
    todosRef: { current: [] },
    calls: [],
  }
  s.todosRef.current = s.todos
  s.toggle = vi.fn((id: string) => {
    s.calls.push(`toggle ${id}`)
    return () => s.calls.push(`undo toggle ${id}`)
  })
  s.moveToTrash = vi.fn((id: string) => () => s.calls.push(`undo trash ${id}`))
  s.moveSeriesFutureToTrash = vi.fn((id: string) => () => s.calls.push(`undo series trash ${id}`))
  s.skipTodo = vi.fn((id: string) => () => s.calls.push(`undo skip ${id}`))
  s.bulkDeferTodos = vi.fn(() => () => s.calls.push('undo defer'))
  s.toggleGroceryChecked = vi.fn((id: string) => {
    s.groceries = s.groceries.map((g) => (g.id === id ? { ...g, checked: !g.checked } : g))
    return 0
  })
  s.addCategory = vi.fn(() => {
    s.calls.push('addCategory')
    return 'newcat'
  })
  s.deleteCategory = vi.fn((id: string) => {
    s.calls.push(`deleteCategory ${id}`)
    return null
  })
  s.addTaskWithUndo = vi.fn(() => ({
    id: 't1',
    undo: () => s.calls.push('undo add t1'),
  }))
  s.permanentlyDeleteSeriesFuture = vi.fn((id: string) => s.calls.push(`delete series ${id}`))
  s.permanentlyDelete = vi.fn()
  s.revertTodo = vi.fn((td: Todo) => s.calls.push(`revert ${td.id}`))
  s.updateText = vi.fn()
  s.updatePriority = vi.fn()
  s.updateDueDate = vi.fn()
  s.updateTaskCategory = vi.fn()
  return s
}

function setup() {
  const store = fakeStore()
  const hook = renderHook(() =>
    useMochiExecutor(store as unknown as Parameters<typeof useMochiExecutor>[0], strings.en as Strings),
  )
  return { store, hook }
}

const markDone = (todoId: string): ProposedOperation => ({ kind: 'markDone', args: { todoId } })

describe('useMochiExecutor — latest turn keeps the Undo', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('a newer applied turn retires the older turn\'s Undo (no-op + hidden)', () => {
    const { store, hook } = setup()
    const first = hook.result.current.applyMochiOps([markDone('a')])
    expect(first.undo).not.toBeNull()
    expect(isUndoLive(first.undo)).toBe(true)
    const second = hook.result.current.applyMochiOps([markDone('b')])
    expect(isUndoLive(first.undo)).toBe(false)
    expect(isUndoLive(second.undo)).toBe(true)
    // The stale Undo does nothing — it can't overwrite the newer turn.
    expect((first.undo as () => unknown)()).toBe(false)
    expect(store.calls).not.toContain('undo toggle a')
    second.undo!()
    expect(store.calls).toContain('undo toggle b')
  })

  it('capture, pick-list, scoped delete and bulk actions all retire older Undos', () => {
    const { hook } = setup()
    const r1 = hook.result.current.applyMochiOps([markDone('a')])
    const cap = hook.result.current.applyCaptureWithUndo({ kind: 'createTodo', args: { text: 'Call mom' } })
    expect(isUndoLive(r1.undo)).toBe(false)
    expect(isUndoLive(cap.undo)).toBe(true)
    const del = hook.result.current.deleteTodoScoped('a', 'one')
    expect(isUndoLive(cap.undo)).toBe(false)
    expect(isUndoLive(del)).toBe(true)
    const skip = hook.result.current.applyPickAction('skip', ['a', 'b'])
    expect(isUndoLive(del)).toBe(false)
    expect(isUndoLive(skip)).toBe(true)
    const series = hook.result.current.deleteTodoScoped('b', 'series')
    expect(isUndoLive(skip)).toBe(false)
    const defer = hook.result.current.applyPickAction('defer', ['a'], '2026-11-01')
    expect(isUndoLive(series)).toBe(false)
    expect(isUndoLive(defer)).toBe(true)
  })

  it('an action that applies nothing does not retire the live Undo', () => {
    const { hook } = setup()
    const r1 = hook.result.current.applyMochiOps([markDone('a')])
    const op = { kind: 'pickTodos', args: { action: 'markDone', todoIds: ['a'] } } as Parameters<
      typeof hook.result.current.applyPickedTodos
    >[0]
    expect(hook.result.current.applyPickedTodos(op, [])).toBeNull()
    expect(hook.result.current.applyPickAction('defer', ['a'])).toBeNull()
    expect(hook.result.current.applyPickAction('skip', [])).toBeNull()
    expect(isUndoLive(r1.undo)).toBe(true)
  })

  it('a turn with a confirm Alert stamps its Undo at apply time', async () => {
    const { store, hook } = setup()
    store.todos = [todo('r', { seriesId: 's', recurrence: { freq: 'daily' }, dueDate: '2026-10-19' })]
    let press: ((label: string) => void) | null = null
    vi.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      press = (label) => (buttons as Array<{ text: string; onPress?: () => void }>).find((b) => b.text === label)?.onPress?.()
    })
    const res = hook.result.current.applyMochiOps([{ kind: 'deleteTodo', args: { todoId: 'r' } }])
    expect(res.pending).toBeDefined()
    press!('Just this one')
    const out = await res.pending!
    expect(out.applied).toBe(true)
    expect(isUndoLive(out.undo)).toBe(true)
    out.undo!()
    expect(store.calls).toContain('undo trash r')
  })
})

describe('useMochiExecutor — capture Undo', () => {
  it('a captured repeating to-do is undone silently: whole new series + its new category', async () => {
    const { store, hook } = setup()
    vi.restoreAllMocks()
    const alert = vi.spyOn(Alert, 'alert')
    const cap = hook.result.current.applyCaptureWithUndo({
      kind: 'createTodo',
      args: { text: 'Stretch', recurrence: { freq: 'daily' }, newCategoryLabel: 'Health' },
    })
    expect(cap.id).toBe('t1')
    expect(cap.category).toBe('newcat')
    let result: unknown
    await act(async () => {
      result = await cap.undo()
    })
    expect(result).toBe(true)
    expect(alert).not.toHaveBeenCalled()
    expect(store.calls).toEqual(['addCategory', 'delete series t1', 'undo add t1', 'deleteCategory newcat'])
  })

  it('a one-off capture is removed exactly (no series delete)', () => {
    const { store, hook } = setup()
    const cap = hook.result.current.applyCaptureWithUndo({ kind: 'createTodo', args: { text: 'Call mom' } })
    expect(cap.undo()).toBe(true)
    expect(store.calls).toEqual(['undo add t1'])
  })

  it('a grocery capture returns its Undo with no chip id; unsupported ops are inert', () => {
    const { hook } = setup()
    const other = hook.result.current.applyCaptureWithUndo(markDone('a'))
    expect(other.id).toBeNull()
    expect(other.undo()).toBeUndefined()
  })
})

describe('useMochiExecutor — setGroceryChecked Undo', () => {
  it('restores the absolute previous state, not a blind re-toggle', () => {
    const { store, hook } = setup()
    const res = hook.result.current.applyMochiOps([
      { kind: 'setGroceryChecked', args: { groceryId: 'g', checked: true } },
    ])
    expect(store.groceries[0].checked).toBe(true)
    // The user unchecks it by hand afterwards.
    ;(store.toggleGroceryChecked as (id: string) => number)('g')
    expect(store.groceries[0].checked).toBe(false)
    res.undo!()
    // Previous state was "unchecked" — it stays unchecked.
    expect(store.groceries[0].checked).toBe(false)
  })

  it('puts it back when it is still in the applied state', () => {
    const { store, hook } = setup()
    const res = hook.result.current.applyMochiOps([
      { kind: 'setGroceryChecked', args: { groceryId: 'g', checked: true } },
    ])
    res.undo!()
    expect(store.groceries[0].checked).toBe(false)
  })
})

describe('mochiUndo', () => {
  it('never-stamped functions stay live; non-functions are not', () => {
    expect(isUndoLive(() => {})).toBe(true)
    expect(isUndoLive(null)).toBe(false)
  })

  it('useUndoLive re-renders when a newer turn retires the Undo', () => {
    const stamp = beginMochiTurn()
    const undo = stamp(() => 'ran')
    const hook = renderHook(() => useUndoLive(undo))
    expect(hook.result.current).toBe(true)
    expect(undo()).toBe('ran')
    act(() => {
      beginMochiTurn()
    })
    expect(hook.result.current).toBe(false)
    expect(undo()).toBe(false)
    hook.unmount()
  })

  it('combineUndos runs newest first and is null when empty', () => {
    const calls: number[] = []
    expect(combineUndos([null, undefined])).toBeNull()
    combineUndos([() => calls.push(1), null, () => calls.push(2)])!()
    expect(calls).toEqual([2, 1])
  })
})
