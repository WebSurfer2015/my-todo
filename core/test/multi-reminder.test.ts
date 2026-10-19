/**
 * PR-A of the multi-reminder feature — schema + scheduler + R7
 * transfer. Covers:
 *  - getReminders returns the (deduped) reminders array.
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
} from '../src/logic/derive'
import type { Todo } from '../src/domain/types'

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

  it('returns an empty array when no reminders are set', () => {
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
    // The RAW array (what the scheduler reads), not getReminders (which
    // dedupes and so hid a doubled reminder → two OS notifications).
    const raw = next.reminders ?? []
    expect(raw).toHaveLength(2)
    expect(raw.map((r) => r.at).sort()).toEqual(['2026-06-10T09:00', '2026-06-11T08:00'])
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
