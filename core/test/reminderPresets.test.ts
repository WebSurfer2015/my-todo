import { describe, expect, it } from 'vitest'
import { nudgeAtFor, reminderPresetsFor } from '../src/logic/reminderPresets'

// Mon 2026-10-19, 10:30 local.
const NOW = new Date(2026, 9, 19, 10, 30)

describe('reminderPresetsFor', () => {
  it('due with a time: day before, morning of, 1 hour before, at the time', () => {
    expect(reminderPresetsFor('2026-10-23T15:00', NOW)).toEqual([
      { key: 'dayBefore', at: '2026-10-22T18:00' },
      { key: 'morningOf', at: '2026-10-23T09:00' },
      { key: 'hourBefore', at: '2026-10-23T14:00' },
      { key: 'atTime', at: '2026-10-23T15:00' },
    ])
  })
  it('due early (before 9): no "morning of" (it would come after the due time)', () => {
    expect(reminderPresetsFor('2026-10-23T08:00', NOW).map((p) => p.key)).toEqual([
      'dayBefore',
      'hourBefore',
      'atTime',
    ])
  })
  it('date-only due: morning of + day before', () => {
    expect(reminderPresetsFor('2026-10-23', NOW)).toEqual([
      { key: 'dayBefore', at: '2026-10-22T18:00' },
      { key: 'morningOf', at: '2026-10-23T09:00' },
    ])
  })
  it('drops presets already in the past (due today)', () => {
    expect(reminderPresetsFor('2026-10-19T15:00', NOW).map((p) => p.key)).toEqual(['hourBefore', 'atTime'])
  })
  it('no due date: later today (only before 6 PM) + tomorrow morning', () => {
    expect(reminderPresetsFor('', NOW)).toEqual([
      { key: 'laterToday', at: '2026-10-19T18:00' },
      { key: 'tomorrowMorning', at: '2026-10-20T09:00' },
    ])
    expect(reminderPresetsFor(undefined, new Date(2026, 9, 19, 19, 0)).map((p) => p.key)).toEqual([
      'tomorrowMorning',
    ])
  })
})

describe('nudgeAtFor', () => {
  it('9:00 the morning after the LAST one-shot reminder', () => {
    expect(
      nudgeAtFor([{ at: '2026-10-22T18:00' }, { at: '2026-10-23T14:00' }], NOW),
    ).toBe('2026-10-24T09:00')
  })
  it('no nudge without a one-shot reminder, or alongside a repeating one', () => {
    expect(nudgeAtFor([], NOW)).toBeNull()
    expect(nudgeAtFor(undefined, NOW)).toBeNull()
    expect(nudgeAtFor([{ at: '2026-10-23T14:00' }, { at: '2026-10-23T14:00', intervalMinutes: 30 }], NOW)).toBeNull()
  })
  it('no nudge once its time has passed', () => {
    expect(nudgeAtFor([{ at: '2026-10-17T09:00' }], NOW)).toBeNull()
  })
})
