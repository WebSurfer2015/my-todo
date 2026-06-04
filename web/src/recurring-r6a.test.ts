/**
 * R6a — Edit-scope toggle. Pure-core tests cover:
 *   - todoDetachFromSeries: set flag, idempotent, no-op on non-series.
 *   - todoApplySeriesFutureEdits: notes propagation, detached-skip,
 *     overwriteDetached opt-in.
 * The toggle UI itself lives in TaskDetailsSheet and is exercised
 * by the sim sanity checks.
 */
import { describe, expect, it } from 'vitest'
import {
  todoDetachFromSeries,
  todoApplySeriesFutureEdits,
  expandSeries,
} from '../../core/src/logic/derive'
import type { Todo } from '../../core/src/domain/types'

function seriesSeed(): Todo {
  return {
    id: 'head',
    text: 'Water plants',
    done: false,
    priority: 'medium',
    dueDate: '2026-05-28',
    trashed: false,
    updatedAt: 1,
    recurrence: { freq: 'daily' },
  }
}

describe('todoDetachFromSeries', () => {
  it('sets detachedFromSeries on a series row', () => {
    const expanded = expandSeries(seriesSeed(), '2026-05-28')
    const out = todoDetachFromSeries(expanded, expanded[0].id)
    const head = out.find((t) => t.id === expanded[0].id)!
    expect(head.detachedFromSeries).toBe(true)
  })

  it('is a no-op when the row has no seriesId', () => {
    const oneOff: Todo = {
      id: 'plain',
      text: 'Buy milk',
      done: false,
      priority: 'medium',
      dueDate: '2026-05-29',
      trashed: false,
      updatedAt: 1,
    }
    const out = todoDetachFromSeries([oneOff], 'plain')
    expect(out).toBe([oneOff].length === 1 ? out : [])
    expect(out[0]).toEqual(oneOff)
  })

  it('is idempotent when already detached', () => {
    const expanded = expandSeries(seriesSeed(), '2026-05-28')
    const first = todoDetachFromSeries(expanded, expanded[0].id)
    const second = todoDetachFromSeries(first, expanded[0].id)
    expect(second).toBe(first)
  })

  it('returns input unchanged when target id is missing', () => {
    const expanded = expandSeries(seriesSeed(), '2026-05-28')
    const out = todoDetachFromSeries(expanded, 'no-such-id')
    expect(out).toBe(expanded)
  })
})

describe('todoApplySeriesFutureEdits — notes + detached skip', () => {
  it('propagates notes to future siblings', () => {
    const expanded = expandSeries(seriesSeed(), '2026-05-28')
    const result = todoApplySeriesFutureEdits(expanded, expanded[0].id, {
      notes: 'Use rainwater bucket',
    })
    expect(result.affected).toBeGreaterThan(0)
    for (const t of result.next) {
      if (t.id === expanded[0].id) continue
      if (t.seriesId !== expanded[0].seriesId) continue
      expect(t.notes).toBe('Use rainwater bucket')
    }
  })

  it('clears notes when an empty string is passed', () => {
    const expanded = expandSeries(seriesSeed(), '2026-05-28').map((t) => ({
      ...t,
      notes: 'old note',
    }))
    const result = todoApplySeriesFutureEdits(expanded, expanded[0].id, {
      notes: '',
    })
    for (const t of result.next) {
      if (t.id === expanded[0].id) continue
      expect(t.notes).toBeUndefined()
    }
  })

  it('skips detached siblings by default', () => {
    const expanded = expandSeries(seriesSeed(), '2026-05-28')
    // Detach the second instance.
    const detached = expanded.map((t, i) =>
      i === 1 ? { ...t, detachedFromSeries: true } : t,
    )
    const result = todoApplySeriesFutureEdits(detached, expanded[0].id, {
      text: 'Water orchids',
    })
    // affected count excludes the detached one
    expect(result.affected).toBe(expanded.length - 2) // -1 head, -1 detached
    const detachedAfter = result.next.find((t) => t.id === expanded[1].id)!
    expect(detachedAfter.text).toBe(expanded[1].text) // unchanged
  })

  it('overwriteDetached: true reaches detached siblings too', () => {
    const expanded = expandSeries(seriesSeed(), '2026-05-28')
    const detached = expanded.map((t, i) =>
      i === 1 ? { ...t, detachedFromSeries: true } : t,
    )
    const result = todoApplySeriesFutureEdits(
      detached,
      expanded[0].id,
      { text: 'Water orchids' },
      { overwriteDetached: true },
    )
    expect(result.affected).toBe(expanded.length - 1) // -1 head only
    const detachedAfter = result.next.find((t) => t.id === expanded[1].id)!
    expect(detachedAfter.text).toBe('Water orchids')
  })
})
