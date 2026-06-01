/**
 * R7 — Reminder rescheduling on series. Verifies that the
 * just-cleared reminder on a completing or skipping series instance
 * rolls forward (preserving time-of-day) to the next-upcoming open
 * sibling, and the `nextUpcomingSeriesInstance` helper that drives
 * it.
 *
 * No changes to the OS-side scheduler are needed — once the data
 * carries the reminder on the right row, syncTodoReminders does
 * the right thing.
 */
import { describe, expect, it } from 'vitest'
import {
  expandSeries,
  todoToggle,
  todoSkip,
  nextUpcomingSeriesInstance,
  getReminders,
} from '../../core/src/derive'
import type { Todo } from '../../core/src/types'

function seedWithReminder(over: Partial<Todo> = {}): Todo {
  return {
    id: 'head',
    text: 'Water plants',
    done: false,
    priority: 'medium',
    dueDate: '2026-05-28',
    trashed: false,
    updatedAt: 1,
    recurrence: { freq: 'daily' },
    reminder: { at: '2026-05-28T09:00' },
    ...over,
  }
}

describe('nextUpcomingSeriesInstance', () => {
  it('returns the earliest open dueDate >= today', () => {
    const expanded = expandSeries(seedWithReminder(), '2026-05-28')
    const sid = expanded[0].seriesId!
    const next = nextUpcomingSeriesInstance(expanded, sid, '2026-05-29')
    expect(next?.dueDate).toBe('2026-05-29')
  })

  it('skips the excludeId row', () => {
    const expanded = expandSeries(seedWithReminder(), '2026-05-28')
    const sid = expanded[0].seriesId!
    const next = nextUpcomingSeriesInstance(
      expanded, sid, '2026-05-28', expanded[0].id,
    )
    expect(next?.dueDate).toBe('2026-05-29')
  })

  it('skips trashed / done / notDo siblings', () => {
    const expanded = expandSeries(seedWithReminder(), '2026-05-28')
    const sid = expanded[0].seriesId!
    const annotated = expanded.map((t, i) => {
      if (i === 1) return { ...t, done: true, trashed: true, trashedAt: 1 }
      if (i === 2) return { ...t, status: 'notDo' as const, trashed: true, trashedAt: 1 }
      return t
    })
    const next = nextUpcomingSeriesInstance(annotated, sid, '2026-05-28', expanded[0].id)
    expect(next?.dueDate).toBe('2026-05-31') // skipped 5/29 + 5/30
  })

  it('falls back to earliest overall when every open sibling is overdue', () => {
    const seed: Todo = {
      id: 'head',
      text: 'x',
      done: false,
      priority: 'medium',
      dueDate: '2026-05-20',
      trashed: false,
      updatedAt: 1,
      recurrence: { freq: 'daily' },
    }
    const expanded = expandSeries(seed, '2026-05-20')
    const sid = expanded[0].seriesId!
    // Today is far in the future; every open sibling is "overdue."
    const next = nextUpcomingSeriesInstance(expanded, sid, '2030-01-01', expanded[0].id)
    expect(next?.dueDate).toBe('2026-05-21') // earliest of remaining
  })

  it('returns undefined when no open siblings exist', () => {
    const expanded = expandSeries(seedWithReminder(), '2026-05-28')
    const sid = expanded[0].seriesId!
    const allDone = expanded.map((t) => ({ ...t, done: true, trashed: true }))
    expect(nextUpcomingSeriesInstance(allDone, sid, '2026-05-28')).toBeUndefined()
  })
})

describe('todoToggle — series reminder transfer (R7)', () => {
  it('rolls the reminder forward to the next-upcoming sibling on completion', () => {
    const expanded = expandSeries(seedWithReminder(), '2026-05-28')
    const headId = expanded[0].id
    const out = todoToggle(expanded, headId, '2026-05-28')
    // Head no longer has reminders (both legacy + array cleared).
    const head = out.find((t) => t.id === headId)!
    expect(getReminders(head)).toEqual([])
    // Next-upcoming (5/29) now carries the rolled reminder at 09:00.
    const next = out.find(
      (t) =>
        t.seriesId === expanded[0].seriesId &&
        !t.trashed &&
        !t.done &&
        t.dueDate.startsWith('2026-05-29'),
    )!
    expect(getReminders(next)[0]?.at).toBe('2026-05-29T09:00')
  })

  it('preserves time-of-day across the roll', () => {
    const seed = seedWithReminder({
      dueDate: '2026-05-28',
      reminder: { at: '2026-05-28T15:42' },
    })
    const expanded = expandSeries(seed, '2026-05-28')
    const out = todoToggle(expanded, expanded[0].id, '2026-05-28')
    const next = out.find(
      (t) =>
        t.seriesId === expanded[0].seriesId &&
        !t.trashed &&
        !t.done &&
        t.dueDate.startsWith('2026-05-29'),
    )!
    expect(getReminders(next)[0]?.at).toBe('2026-05-29T15:42')
  })

  it('preserves intervalMinutes and rolls until', () => {
    const seed = seedWithReminder({
      reminder: {
        at: '2026-05-28T09:00',
        intervalMinutes: 60,
        until: '2026-05-28T17:00',
      },
    })
    const expanded = expandSeries(seed, '2026-05-28')
    const out = todoToggle(expanded, expanded[0].id, '2026-05-28')
    const next = out.find(
      (t) =>
        t.seriesId === expanded[0].seriesId &&
        !t.trashed &&
        !t.done &&
        t.dueDate.startsWith('2026-05-29'),
    )!
    const rolled = getReminders(next)[0]
    expect(rolled?.intervalMinutes).toBe(60)
    expect(rolled?.until).toBe('2026-05-29T17:00')
  })

  it('no transfer when the completing instance had no reminder', () => {
    const seed: Todo = {
      id: 'head',
      text: 'x',
      done: false,
      priority: 'medium',
      dueDate: '2026-05-28',
      trashed: false,
      updatedAt: 1,
      recurrence: { freq: 'daily' },
    }
    const expanded = expandSeries(seed, '2026-05-28')
    const out = todoToggle(expanded, expanded[0].id, '2026-05-28')
    for (const t of out) expect(getReminders(t)).toEqual([])
  })

  it('un-doing a completion does not move reminders', () => {
    const expanded = expandSeries(seedWithReminder(), '2026-05-28')
    const done = todoToggle(expanded, expanded[0].id, '2026-05-28')
    const reopened = todoToggle(done, expanded[0].id, '2026-05-28')
    // The head's reminders don't come back (they're discarded on
    // completion) — but the next-upcoming sibling STILL has the
    // transferred reminder, so the user keeps their nudge.
    const next = reopened.find(
      (t) =>
        t.seriesId === expanded[0].seriesId &&
        t.dueDate.startsWith('2026-05-29'),
    )!
    expect(getReminders(next)[0]?.at).toBe('2026-05-29T09:00')
  })
})

describe('todoSkip — series reminder transfer (R7)', () => {
  it('rolls the reminder forward when a series instance is skipped', () => {
    const expanded = expandSeries(seedWithReminder(), '2026-05-28')
    const out = todoSkip(expanded, expanded[0].id, '2026-05-28')
    const head = out.find((t) => t.id === expanded[0].id)!
    expect(getReminders(head)).toEqual([])
    expect(head.status).toBe('notDo')
    const next = out.find(
      (t) =>
        t.seriesId === expanded[0].seriesId &&
        !t.trashed &&
        t.dueDate.startsWith('2026-05-29'),
    )!
    expect(getReminders(next)[0]?.at).toBe('2026-05-29T09:00')
  })

  it('no transfer when the skipped row had no reminder (non-recurring)', () => {
    const oneOff: Todo = {
      id: 'plain',
      text: 'x',
      done: false,
      priority: 'medium',
      dueDate: '2026-05-28',
      trashed: false,
      updatedAt: 1,
    }
    const out = todoSkip([oneOff], 'plain', '2026-05-28')
    expect(out[0].reminder).toBeUndefined()
  })
})
