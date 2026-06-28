import { describe, it, expect } from 'vitest'
import { newTodo, todoSetRecurrence } from '../../core/src/logic/derive'
import { todayLocal } from '../../core/src/logic/utils'
import type { Todo } from '../../core/src/domain/types'

/**
 * Regression guard for the "recurring todo with No date" bug.
 *
 * A recurrence with no anchored dueDate is dead: expandSeries bails to a
 * single dateless instance (no seriesId, no tail) and todoToggle can't
 * roll it forward — both guard on dueDate. The manual compose/edit UI
 * snapped the date in its own layer, so any creator that bypassed the UI
 * (the Mochi agent proposes a recurrence with no start date) produced a
 * "No date" repeat that never advanced. The invariant now lives in the
 * shared core mutations (newTodo + todoSetRecurrence), so every path —
 * manual tap or agent — yields the same anchored series.
 */

const weekdayOf = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).getDay()

describe('newTodo anchors a recurring dueDate', () => {
  it('snaps an empty dueDate to the next listed weekday', () => {
    // "every Mon/Wed/Fri/Sun" — the exact shape Mochi proposed.
    const td = newTodo({
      text: 'Run with Conner',
      priority: 'medium',
      dueDate: '',
      recurrence: { freq: 'weekly', byWeekday: [0, 1, 3, 5] },
    })
    expect(td.dueDate).not.toBe('')
    expect([0, 1, 3, 5]).toContain(weekdayOf(td.dueDate))
    expect(td.dueDate.slice(0, 10) >= todayLocal()).toBe(true)
  })

  it('anchors a weekday-less recurrence (daily) to today', () => {
    const td = newTodo({
      text: 'Stretch',
      priority: 'low',
      dueDate: '',
      recurrence: { freq: 'daily' },
    })
    expect(td.dueDate.slice(0, 10)).toBe(todayLocal())
  })

  it('leaves a NON-recurring empty dueDate untouched (no-date is valid)', () => {
    const td = newTodo({ text: 'Someday', priority: 'medium', dueDate: '' })
    expect(td.dueDate).toBe('')
  })

  it('leaves an already-matching recurring dueDate unchanged', () => {
    // Find a date that is a Wednesday so the snap is a no-op.
    let wed = todayLocal()
    for (let i = 0; i < 7; i++) {
      const d = new Date(`${todayLocal()}T00:00:00`)
      d.setDate(d.getDate() + i)
      if (d.getDay() === 3) {
        wed = d.toISOString().slice(0, 10)
        break
      }
    }
    const td = newTodo({
      text: 'Weekly review',
      priority: 'medium',
      dueDate: wed,
      recurrence: { freq: 'weekly', byWeekday: [3] },
    })
    expect(td.dueDate).toBe(wed)
  })
})

describe('todoSetRecurrence anchors on edit (agent + manual parity)', () => {
  const base: Todo = {
    id: 't1',
    text: 'Run with Conner',
    done: false,
    priority: 'medium',
    dueDate: '', // existing dateless todo
    trashed: false,
    updatedAt: 1,
  }

  it('applies a seriesId AND an anchored dueDate when a recurrence is added', () => {
    const [next] = todoSetRecurrence([base], 't1', {
      freq: 'weekly',
      byWeekday: [0, 1, 3, 5],
    })
    expect(next.recurrence).toBeTruthy()
    expect(next.seriesId).toBeTruthy()
    expect(next.dueDate).not.toBe('')
    expect([0, 1, 3, 5]).toContain(weekdayOf(next.dueDate))
  })

  it('does not invent a dueDate when the recurrence is cleared', () => {
    const withRec: Todo = { ...base, dueDate: todayLocal(), recurrence: { freq: 'daily' }, seriesId: 's1' }
    const [next] = todoSetRecurrence([withRec], 't1', undefined)
    expect(next.recurrence).toBeUndefined()
    expect(next.dueDate).toBe(todayLocal())
  })
})
