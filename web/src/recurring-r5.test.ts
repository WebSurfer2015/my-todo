/**
 * R5 — Skip ("Not Do") action. Verifies the new todoSkip semantics
 * (status='notDo', tucks to Done bin without marking done) and that
 * series instances also get a fresh tail appended.
 */
import { describe, expect, it } from 'vitest'
import { todoSkip, expandSeries } from '../../core/src/logic/derive'
import type { Todo } from '../../core/src/domain/types'

function todo(over: Partial<Todo> = {}): Todo {
  return {
    id: 'one-off',
    text: 'Call dentist',
    done: false,
    priority: 'medium',
    dueDate: '2026-05-28',
    trashed: false,
    updatedAt: 1,
    ...over,
  }
}

describe('todoSkip — non-recurring', () => {
  it('marks status=notDo, trashes (Done bin), but does NOT set done', () => {
    const out = todoSkip([todo()], 'one-off', '2026-05-29')
    const after = out[0]
    expect(after.status).toBe('notDo')
    expect(after.trashed).toBe(true)
    expect(after.done).toBe(false)
    expect(after.completionDate).toBe('2026-05-29')
    expect(after.trashedAt).toBeGreaterThan(0)
  })

  it('clears any pending reminder', () => {
    const out = todoSkip(
      [todo({ reminder: { at: '2026-05-28T09:00' } })],
      'one-off',
      '2026-05-29',
    )
    expect(out[0].reminder).toBeUndefined()
  })

  it('does NOT generate a new instance for a non-series row', () => {
    const out = todoSkip([todo()], 'one-off', '2026-05-29')
    expect(out).toHaveLength(1)
  })

  it('is a no-op when subs exist (parent state is derived)', () => {
    const before = [
      todo({
        subtasks: [
          { id: 'a', text: 'step', done: false, priority: 'medium' },
        ],
      }),
    ]
    const out = todoSkip(before, 'one-off', '2026-05-29')
    expect(out).toBe(before)
    expect(out[0].status).toBeUndefined()
  })
})

describe('todoSkip — series instance', () => {
  it('appends one new tail (same horizon as completion)', () => {
    const seed: Todo = {
      id: 'head',
      text: 'Water plants',
      done: false,
      priority: 'medium',
      dueDate: '2026-05-28',
      trashed: false,
      updatedAt: 1,
      recurrence: { freq: 'daily' },
    }
    const expanded = expandSeries(seed, '2026-05-28')
    const out = todoSkip(expanded, expanded[0].id, '2026-05-29')
    expect(out.length).toBe(expanded.length + 1)
    const sid = expanded[0].seriesId!
    const newTail = out.find(
      (t) => t.seriesId === sid && !expanded.some((e) => e.id === t.id),
    )!
    expect(newTail).toBeDefined()
    expect(newTail.done).toBe(false)
    expect(newTail.trashed).toBe(false)
    expect(newTail.status).toBeUndefined()
  })

  it('the just-skipped head still carries status=notDo + done=false', () => {
    const seed: Todo = {
      id: 'head',
      text: 'Water plants',
      done: false,
      priority: 'medium',
      dueDate: '2026-05-28',
      trashed: false,
      updatedAt: 1,
      recurrence: { freq: 'daily' },
    }
    const expanded = expandSeries(seed, '2026-05-28')
    const out = todoSkip(expanded, expanded[0].id, '2026-05-29')
    const head = out.find((t) => t.id === expanded[0].id)!
    expect(head.status).toBe('notDo')
    expect(head.done).toBe(false)
    expect(head.trashed).toBe(true)
  })

  it('does not append past recurrence.endDate', () => {
    const seed: Todo = {
      id: 'head',
      text: 'Daily til Sat',
      done: false,
      priority: 'medium',
      dueDate: '2026-05-28',
      trashed: false,
      updatedAt: 1,
      recurrence: { freq: 'daily', endDate: '2026-05-30' },
    }
    const expanded = expandSeries(seed, '2026-05-28')
    // Skip the LAST materialized instance — top-up would cross endDate.
    const last = expanded[expanded.length - 1]
    const out = todoSkip(expanded, last.id, '2026-05-30')
    expect(out.length).toBe(expanded.length) // no new tail
    const after = out.find((t) => t.id === last.id)!
    expect(after.status).toBe('notDo')
  })
})

describe('todoSkip — missing target', () => {
  it('no-op when id is unknown', () => {
    const before = [todo()]
    const out = todoSkip(before, 'missing-id', '2026-05-29')
    expect(out).toBe(before)
  })
})
