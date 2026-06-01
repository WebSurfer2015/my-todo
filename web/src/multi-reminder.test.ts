/**
 * PR-A of the multi-reminder feature — schema + scheduler + R7
 * transfer. Covers:
 *  - getReminders normalizes legacy `reminder` to a singleton array
 *    with a stable `legacy:<at>` id.
 *  - todoToggle / todoSkip transfer EVERY reminder on a completing
 *    series instance to the next-upcoming sibling.
 *  - The transfer preserves intervalMinutes + until + time-of-day,
 *    rolled by the same day-delta as the dueDate.
 *
 * UI / sheet redesign lives in PR-B.
 */
import { describe, expect, it } from 'vitest'
import {
  expandSeries,
  todoToggle,
  todoSkip,
  getReminders,
} from '../../core/src/derive'
import type { Todo } from '../../core/src/types'

function seedMulti(): Todo {
  return {
    id: 'head',
    text: 'Standup',
    done: false,
    priority: 'medium',
    dueDate: '2026-06-10',
    trashed: false,
    updatedAt: 1,
    recurrence: { freq: 'daily' },
    reminders: [
      { id: 'r-1d', at: '2026-06-09T09:00' },
      { id: 'r-1h', at: '2026-06-10T08:00' },
    ],
  }
}

describe('getReminders — normalization', () => {
  it('returns the reminders array when present', () => {
    const t = seedMulti()
    const r = getReminders(t)
    expect(r.map((x) => x.id)).toEqual(['r-1d', 'r-1h'])
  })

  it('wraps a legacy single reminder into a singleton array', () => {
    const legacy: Todo = {
      id: 'leg',
      text: 'x',
      done: false,
      priority: 'medium',
      dueDate: '2026-06-10',
      trashed: false,
      updatedAt: 1,
      reminder: { at: '2026-06-09T09:00' },
    }
    const r = getReminders(legacy)
    expect(r).toHaveLength(1)
    expect(r[0].at).toBe('2026-06-09T09:00')
    expect(r[0].id).toBe('legacy:2026-06-09T09:00')
  })

  it('returns an empty array when neither field is set', () => {
    const bare: Todo = {
      id: 'b',
      text: 'x',
      done: false,
      priority: 'medium',
      dueDate: '',
      trashed: false,
      updatedAt: 1,
    }
    expect(getReminders(bare)).toEqual([])
  })

  it('prefers the array even when both are set', () => {
    const both: Todo = {
      id: 'both',
      text: 'x',
      done: false,
      priority: 'medium',
      dueDate: '2026-06-10',
      trashed: false,
      updatedAt: 1,
      reminder: { at: '2026-06-09T09:00' },
      reminders: [{ id: 'a', at: '2026-06-08T09:00' }],
    }
    expect(getReminders(both).map((r) => r.id)).toEqual(['a'])
  })
})

describe('todoToggle — multi-reminder transfer on series completion', () => {
  it('transfers every entry to the next-upcoming sibling, rolled by the dueDate delta', () => {
    const expanded = expandSeries(seedMulti(), '2026-06-10')
    const head = expanded[0]
    const out = todoToggle(expanded, head.id, '2026-06-10')
    // Head cleared.
    const after = out.find((t) => t.id === head.id)!
    expect(getReminders(after)).toEqual([])
    // Next-upcoming (6/11) gets both reminders rolled forward by 1 day.
    const next = out.find(
      (t) =>
        t.seriesId === head.seriesId &&
        !t.trashed &&
        !t.done &&
        t.dueDate.startsWith('2026-06-11'),
    )!
    const rolled = getReminders(next)
    expect(rolled).toHaveLength(2)
    const byId = new Map(rolled.map((r) => [r.id, r.at]))
    expect(byId.get('r-1d')).toBe('2026-06-10T09:00')
    expect(byId.get('r-1h')).toBe('2026-06-11T08:00')
  })

  it('preserves intervalMinutes + until on a recurring-interval entry', () => {
    const seed: Todo = {
      ...seedMulti(),
      reminders: [
        {
          id: 'every-2h',
          at: '2026-06-10T09:00',
          intervalMinutes: 120,
          until: '2026-06-10T17:00',
        },
      ],
    }
    const expanded = expandSeries(seed, '2026-06-10')
    const out = todoToggle(expanded, expanded[0].id, '2026-06-10')
    const next = out.find(
      (t) =>
        t.seriesId === expanded[0].seriesId &&
        !t.trashed &&
        !t.done &&
        t.dueDate.startsWith('2026-06-11'),
    )!
    const rolled = getReminders(next)
    expect(rolled).toHaveLength(1)
    expect(rolled[0].at).toBe('2026-06-11T09:00')
    expect(rolled[0].intervalMinutes).toBe(120)
    expect(rolled[0].until).toBe('2026-06-11T17:00')
  })
})

describe('todoSkip — multi-reminder transfer on series skip', () => {
  it('transfers every entry forward (same as completion)', () => {
    const expanded = expandSeries(seedMulti(), '2026-06-10')
    const out = todoSkip(expanded, expanded[0].id, '2026-06-10')
    const next = out.find(
      (t) =>
        t.seriesId === expanded[0].seriesId &&
        !t.trashed &&
        t.dueDate.startsWith('2026-06-11'),
    )!
    expect(getReminders(next)).toHaveLength(2)
  })
})

describe('legacy single-reminder series flow', () => {
  it('still transfers correctly when the seed used the old field', () => {
    const legacy: Todo = {
      id: 'head',
      text: 'x',
      done: false,
      priority: 'medium',
      dueDate: '2026-06-10',
      trashed: false,
      updatedAt: 1,
      recurrence: { freq: 'daily' },
      reminder: { at: '2026-06-10T09:00' },
    }
    const expanded = expandSeries(legacy, '2026-06-10')
    const out = todoToggle(expanded, expanded[0].id, '2026-06-10')
    const next = out.find(
      (t) =>
        t.seriesId === expanded[0].seriesId &&
        !t.trashed &&
        !t.done &&
        t.dueDate.startsWith('2026-06-11'),
    )!
    const rolled = getReminders(next)
    expect(rolled).toHaveLength(1)
    expect(rolled[0].at).toBe('2026-06-11T09:00')
  })
})
