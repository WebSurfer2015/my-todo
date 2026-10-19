import { describe, it, expect } from 'vitest'
import {
  formatCalendarDate,
  DEFAULT_RECURRENCE_FREQ_STRINGS,
  formatDateTime,
  formatInterval,
  formatReminder,
  isoLocalDateTime,
  recurrenceFreqLabel,
  recurrenceLabel,
  recurrenceShortLabel,
  reminderSummary,
} from '../src/logic/labels'

/**
 * Shared sheet labels. These used to be copy-pasted per sheet and drifted —
 * the 90-minute and "every 2 weeks" cases are the regressions that motivated
 * the move into core.
 */

const EN = { locale: 'en-US', now: new Date(2026, 9, 19, 12, 0) }

describe('isoLocalDateTime', () => {
  it('formats a local Date as yyyy-mm-ddTHH:mm with zero padding', () => {
    expect(isoLocalDateTime(new Date(2026, 0, 5, 7, 3))).toBe('2026-01-05T07:03')
    expect(isoLocalDateTime(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31T23:59')
  })
})

describe('formatInterval', () => {
  it('shows minutes below an hour', () => {
    expect(formatInterval(30)).toBe('30m')
  })
  it('shows whole hours without a minutes part', () => {
    expect(formatInterval(60)).toBe('1h')
    expect(formatInterval(120)).toBe('2h')
  })
  it('keeps the remainder minutes (90 → "1h 30m", not "1h")', () => {
    expect(formatInterval(90)).toBe('1h 30m')
    expect(formatInterval(150)).toBe('2h 30m')
  })
})

describe('recurrenceFreqLabel', () => {
  it('maps each frequency to its injected word', () => {
    const s = { never: 'N', daily: 'D', weekly: 'W', monthly: 'M', yearly: 'Y' }
    expect(recurrenceFreqLabel('daily', s)).toBe('D')
    expect(recurrenceFreqLabel('weekly', s)).toBe('W')
    expect(recurrenceFreqLabel('monthly', s)).toBe('M')
    expect(recurrenceFreqLabel('yearly', s)).toBe('Y')
    expect(recurrenceFreqLabel('none', s)).toBe('N')
  })
  it('defaults to English', () => {
    expect(recurrenceFreqLabel('weekly')).toBe('Weekly')
    expect(DEFAULT_RECURRENCE_FREQ_STRINGS.never).toBe('Never')
  })
})

describe('recurrenceShortLabel', () => {
  it('returns "never" for no rule', () => {
    expect(recurrenceShortLabel(undefined)).toBe('Never')
  })
  it('uses the localized word for a plain every-1 rule', () => {
    const s = { ...DEFAULT_RECURRENCE_FREQ_STRINGS, weekly: 'Semanal' }
    expect(recurrenceShortLabel({ freq: 'weekly' }, s)).toBe('Semanal')
    expect(recurrenceShortLabel({ freq: 'daily', interval: 1 })).toBe('Daily')
  })
  it('honors interval without weekdays ("Every 2 weeks", not "Weekly")', () => {
    expect(recurrenceShortLabel({ freq: 'weekly', interval: 2 })).toBe('Every 2 weeks')
    expect(recurrenceShortLabel({ freq: 'daily', interval: 3 })).toBe('Every 3 days')
  })
  it('summarizes weekday rules', () => {
    expect(recurrenceShortLabel({ freq: 'weekly', byWeekday: [3, 1] })).toBe('Weekly · Mon, Wed')
  })
})

describe('recurrenceLabel', () => {
  it('appends the end date (no year when same year)', () => {
    expect(
      recurrenceLabel({ freq: 'weekly', interval: 2, endDate: '2026-12-01' }, undefined, EN),
    ).toBe('Every 2 weeks · ends Dec 1')
  })
  it('includes the year for an end date in another year', () => {
    expect(recurrenceLabel({ freq: 'daily', endDate: '2027-01-02' }, undefined, EN)).toBe(
      'Daily · ends Jan 2, 2027',
    )
  })
  it('falls back to the cadence when the end date is unparseable', () => {
    expect(recurrenceLabel({ freq: 'daily', endDate: 'garbage' }, undefined, EN)).toBe('Daily')
  })
  it('handles no rule / no end date', () => {
    expect(recurrenceLabel(undefined)).toBe('Never')
    expect(recurrenceLabel({ freq: 'monthly' })).toBe('Monthly')
  })
})

describe('formatDateTime', () => {
  it('shows short date + time, year only when not this year', () => {
    expect(formatDateTime('2026-06-07T09:00', EN)).toBe('Jun 7, 9:00 AM')
    expect(formatDateTime('2027-06-07T21:30', EN)).toBe('Jun 7, 2027, 9:30 PM')
  })
  it('returns unparseable input unchanged', () => {
    expect(formatDateTime('not a date', EN)).toBe('not a date')
  })
  it('works with default options (runtime locale, this year → no year)', () => {
    const year = new Date().getFullYear()
    const d = new Date(`${year}-06-07T09:00`)
    const want = `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    expect(formatDateTime(`${year}-06-07T09:00`)).toBe(want)
    expect(formatDateTime(`${year}-06-07T09:00`)).not.toContain(String(year))
  })
})

describe('formatReminder', () => {
  it('is empty with no reminder', () => {
    expect(formatReminder(undefined)).toBe('')
    expect(formatReminder({ at: '' })).toBe('')
  })
  it('shows the datetime for a one-shot', () => {
    expect(formatReminder({ at: '2026-06-07T09:00' }, EN)).toBe('Jun 7, 9:00 AM')
  })
  it('shows a 90-minute repeat as "every 1h 30m"', () => {
    expect(formatReminder({ at: '2026-06-07T09:00', intervalMinutes: 90 }, EN)).toBe('every 1h 30m')
  })
  it('adds the until datetime for a bounded repeat', () => {
    expect(
      formatReminder({ at: '2026-06-07T09:00', intervalMinutes: 30, until: '2026-06-07T17:00' }, EN),
    ).toBe('every 30m until Jun 7, 5:00 PM')
  })
})

describe('reminderSummary', () => {
  const strings = { none: 'None', withCount: (n: number) => `Your reminders (${n})` }
  it('0 → none', () => {
    expect(reminderSummary([], strings)).toBe('None')
  })
  it('1 → that reminder', () => {
    expect(reminderSummary([{ at: '2026-06-07T09:00', intervalMinutes: 90 }], strings, EN)).toBe(
      'every 1h 30m',
    )
  })
  it('N → count', () => {
    expect(reminderSummary([{ at: 'a' }, { at: 'b' }], strings)).toBe('Your reminders (2)')
  })
})

describe('formatCalendarDate', () => {
  const now = new Date(2026, 9, 19, 10, 0) // Mon Oct 19 2026, local
  it('Today / Tomorrow, then an absolute weekday date — never "in 4 days"', () => {
    expect(formatCalendarDate('2026-10-19', { now, locale: 'en-US' })).toBe('Today')
    expect(formatCalendarDate('2026-10-20', { now, locale: 'en-US' })).toBe('Tomorrow')
    expect(formatCalendarDate('2026-10-23', { now, locale: 'en-US' })).toBe('Fri, Oct 23')
    expect(formatCalendarDate('2027-01-05', { now, locale: 'en-US' })).toBe('Tue, Jan 5, 2027')
  })
  it('appends the time when present; unparseable input passes through', () => {
    expect(formatCalendarDate('2026-10-20T09:00', { now, locale: 'en-US' })).toBe('Tomorrow, 9:00 AM')
    expect(formatCalendarDate('soon', { now })).toBe('soon')
  })
})
