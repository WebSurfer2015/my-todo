import { describe, it, expect } from 'vitest'
import { expandSeries } from '../../core/src/logic/derive'
import type { Todo } from '../../core/src/domain/types'

/**
 * Each occurrence of a recurring todo must carry the reminder rebased to
 * its own due (the "9:30 on each occurrence" fix). Previously only the
 * seed kept its reminders; generated instances had none.
 */
const seed = (over: Partial<Todo>): Todo => ({
  id: 'seed',
  text: 'walk Conner',
  done: false,
  priority: 'medium',
  dueDate: '2026-06-05',
  trashed: false,
  recurrence: { freq: 'daily' },
  ...over,
})

describe('expandSeries reminder rebasing', () => {
  it('rebases the reminder onto every generated instance at the same time', () => {
    const out = expandSeries(
      seed({ reminders: [{ id: 'r', at: '2026-06-05T09:30' }] }),
      '2026-06-05',
    )
    expect(out.length).toBeGreaterThan(1)
    // Head keeps the seed reminder.
    expect(out[0].reminders?.[0].at).toBe('2026-06-05T09:30')
    // Every generated instance reminds at 09:30 on ITS due date.
    for (const inst of out.slice(1)) {
      expect(inst.reminders?.length).toBe(1)
      expect(inst.reminders?.[0].at).toBe(`${inst.dueDate}T09:30`)
      expect(inst.reminders?.[0].id).not.toBe('r') // fresh id per instance
    }
  })

  it('preserves before-due offsetMinutes on each instance', () => {
    const out = expandSeries(
      seed({ reminders: [{ id: 'r', at: '2026-06-05T08:00', offsetMinutes: 60 }] }),
      '2026-06-05',
    )
    for (const inst of out.slice(1)) {
      expect(inst.reminders?.[0].offsetMinutes).toBe(60)
    }
  })

  it('no reminders on the seed → none on instances', () => {
    const out = expandSeries(seed({}), '2026-06-05')
    for (const inst of out) expect(inst.reminders).toBeUndefined()
  })
})
