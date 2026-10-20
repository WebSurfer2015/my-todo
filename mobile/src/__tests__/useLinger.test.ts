// @vitest-environment happy-dom
/**
 * Todos list linger: done rows aren't in the open groups (core deriveState),
 * so a row just checked off stays on screen for its Undo window, then
 * leaves. A skipped / deleted row leaves at once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { buildGroups } from '../../../core/src/logic/groups'
import type { Filter, Todo } from '../core-bindings/types'
import { useLinger, LINGER_MS } from '../features/task/useLinger'

const mk = (id: string, extra: Partial<Todo> = {}): Todo => ({
  id,
  text: id,
  done: false,
  priority: 'medium',
  dueDate: '',
  trashed: false,
  ...extra,
})

/** What the store hands the hook: open rows only in filtered / groups. */
function storeOf(todos: Todo[], filters: Filter[] = []) {
  const filtered = todos.filter((t) => !t.done && !t.trashed)
  return { filters, filtered, groups: buildGroups(filtered), todos }
}

const ids = (groups: { todos: Todo[] }[]) => groups.flatMap((g) => g.todos.map((t) => t.id))

describe('useLinger', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('a just-completed row lingers for its Undo window in the All view, then leaves', () => {
    const open = [mk('a'), mk('b')]
    const hook = renderHook(({ store }) => useLinger(store, ''), {
      initialProps: { store: storeOf(open) },
    })
    expect(ids(hook.result.current.displayGroups)).toEqual(['a', 'b'])
    const done = [mk('a', { done: true, trashed: true }), mk('b')]
    hook.rerender({ store: storeOf(done) })
    // Still shown (at the bottom of its group) while Undo is on screen.
    expect(ids(hook.result.current.displayGroups)).toEqual(['b', 'a'])
    act(() => {
      vi.advanceTimersByTime(LINGER_MS)
    })
    expect(ids(hook.result.current.displayGroups)).toEqual(['b'])
  })

  it('a skipped / deleted (not done) row leaves at once', () => {
    const hook = renderHook(({ store }) => useLinger(store, ''), {
      initialProps: { store: storeOf([mk('a'), mk('b')]) },
    })
    hook.rerender({ store: storeOf([mk('a', { trashed: true }), mk('b')]) })
    expect(ids(hook.result.current.displayGroups)).toEqual(['b'])
  })

  it('Undo within the window brings it back as a normal row (no expiry later)', () => {
    const hook = renderHook(({ store }) => useLinger(store, ''), {
      initialProps: { store: storeOf([mk('a'), mk('b')]) },
    })
    hook.rerender({ store: storeOf([mk('a', { done: true, trashed: true }), mk('b')]) })
    hook.rerender({ store: storeOf([mk('a'), mk('b')]) })
    act(() => {
      vi.advanceTimersByTime(LINGER_MS * 2)
    })
    expect(ids(hook.result.current.displayGroups)).toEqual(['a', 'b'])
  })

  it('changing the filter drops lingering rows right away', () => {
    const hook = renderHook(({ store }) => useLinger(store, ''), {
      initialProps: { store: storeOf([mk('a'), mk('b')]) },
    })
    hook.rerender({ store: storeOf([mk('a', { done: true, trashed: true }), mk('b')]) })
    hook.rerender({ store: storeOf([mk('a', { done: true, trashed: true }), mk('b')], ['open']) })
    expect(ids(hook.result.current.displayGroups)).toEqual(['b'])
  })
})
