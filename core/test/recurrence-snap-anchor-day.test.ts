import { describe, it, expect } from 'vitest'
import {
  newTodo,
  expandSeries,
  snapDueDateToRecurrence,
  appendNextSeriesInstance,
  topUpSeries,
} from '../src/logic/derive'
import { nextOccurrence, expandRecurrence } from '../src/logic/utils'
import type { Todo, Recurrence } from '../src/domain/types'

/**
 * Track A (1) — a monthly "Nth weekday" rule must snap its first date with
 * the WHOLE rule, and expandSeries must not drop the first real occurrence
 * when the seed isn't on the rule.
 * Track A (2) — month-end anchor: Jan 31 → Feb 28 → Mar 31 (not the 28th
 * forever), Feb 29 yearly comes back in leap years.
 */

// Oct 2026: Thursdays fall on 1, 8, 15, 22, 29. Nov 2026: 5, 12, 19, 26.
const SECOND_THU: Recurrence = { freq: 'monthly', byWeekday: [4], bySetPos: [2] }

describe('snapDueDateToRecurrence — monthly bySetPos', () => {
  it('snaps a mid-month date to the NEXT 2nd Thursday, not the next Thursday', () => {
    expect(snapDueDateToRecurrence('2026-10-19', SECOND_THU)).toBe('2026-11-12')
  })

  it('keeps a date already on the rule, and preserves the time suffix', () => {
    expect(snapDueDateToRecurrence('2026-10-08', SECOND_THU)).toBe('2026-10-08')
    expect(snapDueDateToRecurrence('2026-10-19T18:30', SECOND_THU)).toBe('2026-11-12T18:30')
  })

  it('snaps to the last weekday of the month for bySetPos -1', () => {
    // Last Friday of Oct 2026 is the 30th.
    expect(
      snapDueDateToRecurrence('2026-10-02', { freq: 'monthly', byWeekday: [5], bySetPos: [-1] }),
    ).toBe('2026-10-30')
  })

  it('weekly rules keep the plain next-weekday snap', () => {
    expect(snapDueDateToRecurrence('2026-10-19', { freq: 'weekly', byWeekday: [4] })).toBe('2026-10-22')
  })

  it('newTodo anchors a 2nd-Thursday series on its real first occurrence', () => {
    const td = newTodo({ text: 'Book club', priority: 'medium', dueDate: '2026-10-19', recurrence: SECOND_THU })
    expect(td.dueDate).toBe('2026-11-12')
  })
})

describe('expandSeries — seed off the rule', () => {
  const seed = (dueDate: string): Todo => ({
    id: 'seed',
    text: 'Book club',
    done: false,
    priority: 'medium',
    dueDate,
    trashed: false,
    recurrence: SECOND_THU,
  })

  it('keeps the first real occurrence when the seed date is not on the rule', () => {
    // Seed on the 4th Thursday (the old buggy snap); Nov 12 must still appear.
    const out = expandSeries(seed('2026-10-22'), '2026-10-19')
    expect(out[0].id).toBe('seed')
    expect(out.slice(1).map((t) => t.dueDate)).toEqual(['2026-11-12', '2026-12-10', '2027-01-14'])
  })

  it('still skips dates[0] when it IS the seed', () => {
    const out = expandSeries(seed('2026-11-12'), '2026-10-19')
    expect(out.map((t) => t.dueDate)).toEqual(['2026-11-12', '2026-12-10', '2027-01-14'])
  })
})

describe('month-end anchor day', () => {
  it('nextOccurrence recovers the anchor after a clamped short month', () => {
    expect(nextOccurrence('2026-01-31', 'monthly', 1)).toBe('2026-02-28')
    expect(nextOccurrence('2026-02-28', 'monthly', 1, undefined, undefined, 31)).toBe('2026-03-31')
    expect(nextOccurrence('2026-04-30', 'monthly', 1, undefined, undefined, 31)).toBe('2026-05-31')
    // Without an anchor the old (drifting) behaviour is unchanged.
    expect(nextOccurrence('2026-02-28', 'monthly', 1)).toBe('2026-03-28')
  })

  it('ignores the anchor when the current day is not a clamped month-end', () => {
    // The user moved the series to the 20th — keep it there.
    expect(nextOccurrence('2026-03-20', 'monthly', 1, undefined, undefined, 31)).toBe('2026-04-20')
  })

  it('leaves weekly / daily untouched', () => {
    expect(nextOccurrence('2026-02-28', 'weekly', 1, undefined, undefined, 31)).toBe('2026-03-07')
    expect(nextOccurrence('2026-02-28', 'daily', 1, undefined, undefined, 31)).toBe('2026-03-01')
  })

  it('expandRecurrence keeps a monthly-on-the-31st on month-end', () => {
    expect(expandRecurrence('2026-01-31', '2026-07-31', { freq: 'monthly' })).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31',
    ])
  })

  it('expandRecurrence brings a yearly Feb 29 back in leap years', () => {
    expect(expandRecurrence('2024-02-29', '2028-12-31', { freq: 'yearly' })).toEqual([
      '2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29',
    ])
  })

  const member = (id: string, dueDate: string, extra: Partial<Todo> = {}): Todo => ({
    id,
    text: 'Rent',
    done: false,
    priority: 'medium',
    dueDate,
    trashed: false,
    seriesId: 's1',
    recurrence: { freq: 'monthly' },
    ...extra,
  })

  it('appendNextSeriesInstance uses the earliest member as the anchor', () => {
    const todos = [
      member('a', '2026-01-31', { done: true, trashed: true }),
      member('b', '2026-02-28'),
    ]
    const out = appendNextSeriesInstance(todos, 's1')
    expect(out[out.length - 1].dueDate).toBe('2026-03-31')
  })

  it('topUpSeries rolls month-end without drifting', () => {
    const todos = [member('a', '2026-01-31'), member('b', '2026-02-28')]
    const out = topUpSeries(todos, 's1', '2026-02-01')
    // Window for monthly = today + 3 months → 2026-05-01.
    expect(out.slice(2).map((t) => t.dueDate)).toEqual(['2026-03-31', '2026-04-30'])
  })

  it('yearly Feb 29 series appends Feb 29 in the next leap year', () => {
    const todos = [
      member('a', '2024-02-29', { recurrence: { freq: 'yearly' }, done: true, trashed: true }),
      member('b', '2025-02-28', { recurrence: { freq: 'yearly' }, done: true, trashed: true }),
      member('c', '2026-02-28', { recurrence: { freq: 'yearly' }, done: true, trashed: true }),
      member('d', '2027-02-28', { recurrence: { freq: 'yearly' } }),
    ]
    const out = appendNextSeriesInstance(todos, 's1')
    expect(out[out.length - 1].dueDate).toBe('2028-02-29')
  })
})
