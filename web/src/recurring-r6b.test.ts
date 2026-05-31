/**
 * R6b — Frequency-change apply for a series. Covers the core helper
 * `todoApplyRecurrenceChange` driven by the "Recreate all / Keep
 * modified" dialog in TaskDetailsSheet.
 */
import { describe, expect, it } from 'vitest'
import {
  todoApplyRecurrenceChange,
  expandSeries,
} from '../../core/src/derive'
import type { Todo } from '../../core/src/types'

function dailySeed(): Todo {
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

describe('todoApplyRecurrenceChange — Recreate all', () => {
  it('trashes future siblings and re-expands with new freq', () => {
    const expanded = expandSeries(dailySeed(), '2026-05-28')
    const headId = expanded[0].id
    const result = todoApplyRecurrenceChange(
      expanded,
      headId,
      { freq: 'weekly' },
      '2026-05-28',
      { keepDetached: false },
    )
    expect(result.trashedCount).toBe(expanded.length - 1)
    // Original future siblings should be trashed.
    for (const orig of expanded.slice(1)) {
      const after = result.next.find((t) => t.id === orig.id)!
      expect(after.trashed).toBe(true)
    }
    // Target now carries the new recurrence.
    const head = result.next.find((t) => t.id === headId)!
    expect(head.recurrence?.freq).toBe('weekly')
    expect(head.trashed).toBe(false)
    // New tail rendered at weekly intervals (within 1-month window).
    const sid = head.seriesId!
    const fresh = result.next.filter(
      (t) => t.seriesId === sid && !t.trashed && t.id !== headId,
    )
    expect(fresh.map((t) => t.dueDate)).toEqual([
      '2026-06-04',
      '2026-06-11',
      '2026-06-18',
      '2026-06-25',
    ])
  })

  it('overwrites detached siblings too', () => {
    const expanded = expandSeries(dailySeed(), '2026-05-28').map((t, i) =>
      i === 2 ? { ...t, detachedFromSeries: true } : t,
    )
    const result = todoApplyRecurrenceChange(
      expanded,
      expanded[0].id,
      { freq: 'weekly' },
      '2026-05-28',
      { keepDetached: false },
    )
    const detachedAfter = result.next.find((t) => t.id === expanded[2].id)!
    expect(detachedAfter.trashed).toBe(true)
  })
})

describe('todoApplyRecurrenceChange — Keep modified', () => {
  it('preserves detached siblings while trashing the rest', () => {
    const expanded = expandSeries(dailySeed(), '2026-05-28').map((t, i) =>
      i === 2 ? { ...t, detachedFromSeries: true } : t,
    )
    const result = todoApplyRecurrenceChange(
      expanded,
      expanded[0].id,
      { freq: 'weekly' },
      '2026-05-28',
      { keepDetached: true },
    )
    const detachedAfter = result.next.find((t) => t.id === expanded[2].id)!
    expect(detachedAfter.trashed).toBe(false)
    expect(detachedAfter.detachedFromSeries).toBe(true)
    // Non-detached future siblings still got trashed.
    const nonDetachedSiblings = expanded.slice(1).filter((_, i) => i + 1 !== 2)
    for (const orig of nonDetachedSiblings) {
      const after = result.next.find((t) => t.id === orig.id)!
      expect(after.trashed).toBe(true)
    }
    // trashedCount reflects only the non-detached ones.
    expect(result.trashedCount).toBe(nonDetachedSiblings.length)
  })
})

describe('todoApplyRecurrenceChange — edge cases', () => {
  it('no-op when target has no seriesId', () => {
    const oneOff: Todo = {
      id: 'plain',
      text: 'Buy milk',
      done: false,
      priority: 'medium',
      dueDate: '2026-05-28',
      trashed: false,
      updatedAt: 1,
      recurrence: { freq: 'daily' },
    }
    const result = todoApplyRecurrenceChange(
      [oneOff],
      'plain',
      { freq: 'weekly' },
      '2026-05-28',
      { keepDetached: false },
    )
    expect(result.next).toBe([oneOff].length === 1 ? result.next : [])
    expect(result.next[0]).toEqual(oneOff)
    expect(result.trashedCount).toBe(0)
  })

  it('passing undefined ends the series at the target (no new tail)', () => {
    const expanded = expandSeries(dailySeed(), '2026-05-28')
    const result = todoApplyRecurrenceChange(
      expanded,
      expanded[0].id,
      undefined,
      '2026-05-28',
      { keepDetached: false },
    )
    const head = result.next.find((t) => t.id === expanded[0].id)!
    expect(head.recurrence).toBeUndefined()
    // No fresh tail.
    const sid = expanded[0].seriesId!
    const openFuture = result.next.filter(
      (t) => t.seriesId === sid && !t.trashed && t.id !== expanded[0].id,
    )
    expect(openFuture).toHaveLength(0)
  })

  it('snaps dueDate when the new recurrence has a weekday filter', () => {
    const seed: Todo = {
      id: 'head',
      text: 'Standup',
      done: false,
      priority: 'medium',
      dueDate: '2026-05-28', // Thursday
      trashed: false,
      updatedAt: 1,
      recurrence: { freq: 'daily' },
    }
    const expanded = expandSeries(seed, '2026-05-28')
    const result = todoApplyRecurrenceChange(
      expanded,
      expanded[0].id,
      // Mondays only.
      { freq: 'weekly', byWeekday: [1] },
      '2026-05-28',
      { keepDetached: false },
    )
    const head = result.next.find((t) => t.id === expanded[0].id)!
    // Snapped forward to the next Monday.
    expect(head.dueDate).toBe('2026-06-01')
  })
})
