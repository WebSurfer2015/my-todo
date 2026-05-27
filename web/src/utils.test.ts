/**
 * Tests for core/src/utils.ts — date helpers, recurrence engine, and
 * relative-time formatters. Hosted under web's Vitest runner so we
 * don't need a separate test setup for core.
 *
 * vi.useFakeTimers freezes the system clock for any test that needs
 * a stable "today" — keeps the suite deterministic across timezones.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  genUuid,
  todayLocal,
  endOfWeekLocal,
  isoDate,
  distributeSubtaskDueDates,
  nextOccurrence,
  expandRecurrence,
  formatRecurrence,
  formatSavedAt,
  formatDisplayDate,
  fullDateLabel,
  MAX_RECURRENCE_INSTANCES,
} from '../../core/src/utils'

describe('genUuid', () => {
  it('returns a non-empty string', () => {
    expect(typeof genUuid()).toBe('string')
    expect(genUuid().length).toBeGreaterThan(0)
  })
  it('is collision-resistant across many calls', () => {
    const set = new Set<string>()
    for (let i = 0; i < 1000; i++) set.add(genUuid())
    expect(set.size).toBe(1000)
  })
  it('falls back to time-prefix when crypto.randomUUID is absent', () => {
    const orig = globalThis.crypto
    // @ts-expect-error — intentional removal for fallback path
    delete globalThis.crypto
    try {
      const id = genUuid()
      expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: orig, configurable: true })
    }
  })
})

describe('isoDate', () => {
  it('formats a Date as yyyy-mm-dd', () => {
    expect(isoDate(new Date(2026, 4, 17))).toBe('2026-05-17')
  })
  it('zero-pads single-digit month + day', () => {
    expect(isoDate(new Date(2026, 0, 1))).toBe('2026-01-01')
    expect(isoDate(new Date(2026, 8, 9))).toBe('2026-09-09')
  })
  it('uses LOCAL date components (not UTC)', () => {
    // Late evening on Dec 31 in local time should remain Dec 31 even if
    // UTC has rolled over. Asserting this guards against the
    // off-by-one-bug we explicitly avoid in utils.
    const d = new Date(2026, 11, 31, 23, 30, 0)
    expect(isoDate(d)).toBe('2026-12-31')
  })
})

describe('todayLocal', () => {
  it('matches isoDate(new Date())', () => {
    expect(todayLocal()).toBe(isoDate(new Date()))
  })
  it('returns a yyyy-mm-dd string', () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('endOfWeekLocal', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('lands on Saturday when called mid-week', () => {
    // Wednesday 2026-05-20 — Saturday is 2026-05-23
    vi.setSystemTime(new Date(2026, 4, 20))
    expect(endOfWeekLocal()).toBe('2026-05-23')
  })
  it('returns the upcoming Saturday when called on Sunday (not the day itself)', () => {
    // Sunday 2026-05-17 — upcoming Saturday is 2026-05-23
    vi.setSystemTime(new Date(2026, 4, 17))
    expect(endOfWeekLocal()).toBe('2026-05-23')
  })
  it('returns today when called on Saturday', () => {
    // Saturday 2026-05-23
    vi.setSystemTime(new Date(2026, 4, 23))
    expect(endOfWeekLocal()).toBe('2026-05-23')
  })
})

describe('distributeSubtaskDueDates', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns [] for count <= 0', () => {
    expect(distributeSubtaskDueDates('2026-05-23', 0)).toEqual([])
    expect(distributeSubtaskDueDates('2026-05-23', -1)).toEqual([])
  })

  it('returns blanks when parent has no due date', () => {
    expect(distributeSubtaskDueDates(undefined, 3)).toEqual(['', '', ''])
  })

  it('returns blanks when parent due date is in the past (no auto-backdate)', () => {
    vi.setSystemTime(new Date(2026, 4, 20))
    expect(distributeSubtaskDueDates('2026-05-10', 3)).toEqual(['', '', ''])
  })

  it('returns all-parent when parent is today', () => {
    vi.setSystemTime(new Date(2026, 4, 20))
    expect(distributeSubtaskDueDates('2026-05-20', 3)).toEqual([
      '2026-05-20',
      '2026-05-20',
      '2026-05-20',
    ])
  })

  it('returns [parent] for count 1', () => {
    vi.setSystemTime(new Date(2026, 4, 20))
    expect(distributeSubtaskDueDates('2026-05-30', 1)).toEqual(['2026-05-30'])
  })

  it('spreads multi-count evenly with last entry = parent', () => {
    vi.setSystemTime(new Date(2026, 4, 20))
    // 10 days span (May 20 → May 30), 5 subtasks → step of 2 days each
    const out = distributeSubtaskDueDates('2026-05-30', 5)
    expect(out).toHaveLength(5)
    expect(out[out.length - 1]).toBe('2026-05-30')
    // First entry should be at least 1 day after today
    expect(out[0]).toBe('2026-05-22')
  })

  it('returns blanks when parent date is unparseable', () => {
    expect(distributeSubtaskDueDates('not-a-date', 3)).toEqual(['', '', ''])
  })
})

describe('nextOccurrence', () => {
  it('advances daily by 1 day', () => {
    expect(nextOccurrence('2026-05-20', 'daily')).toBe('2026-05-21')
  })
  it('advances daily by interval', () => {
    expect(nextOccurrence('2026-05-20', 'daily', 3)).toBe('2026-05-23')
  })
  it('advances weekly by 7 days', () => {
    expect(nextOccurrence('2026-05-20', 'weekly')).toBe('2026-05-27')
  })
  it('advances monthly across month boundary', () => {
    expect(nextOccurrence('2026-05-20', 'monthly')).toBe('2026-06-20')
  })
  it('advances yearly', () => {
    expect(nextOccurrence('2026-05-20', 'yearly')).toBe('2027-05-20')
  })
  it('weekly with byWeekday picks the next listed weekday', () => {
    // 2026-05-20 is a Wednesday (3). Next Friday (5) is 2026-05-22.
    expect(nextOccurrence('2026-05-20', 'weekly', 1, [5])).toBe('2026-05-22')
  })
  it('weekly with byWeekday wraps to next week when start is the only listed day', () => {
    // 2026-05-20 (Wed) is the only listed weekday. Next Wed = +7 days.
    expect(nextOccurrence('2026-05-20', 'weekly', 1, [3])).toBe('2026-05-27')
  })
  it('monthly + byWeekday + bySetPos picks 2nd Tuesday', () => {
    // 2026-05-12 = 2nd Tuesday of May. Next 2nd Tuesday = 2026-06-09.
    expect(nextOccurrence('2026-05-12', 'monthly', 1, [2], [2])).toBe('2026-06-09')
  })
  it('monthly + byWeekday with bySetPos=-1 picks last weekday of month', () => {
    // From 2026-05-31 (Sunday). Last Sunday of June = 2026-06-28.
    expect(nextOccurrence('2026-05-31', 'monthly', 1, [0], [-1])).toBe('2026-06-28')
  })
})

describe('expandRecurrence', () => {
  it('returns [] when end < start', () => {
    expect(expandRecurrence('2026-05-30', '2026-05-20', { freq: 'daily' })).toEqual([])
  })
  it('includes start when start matches the pattern', () => {
    const out = expandRecurrence('2026-05-20', '2026-05-23', { freq: 'daily' })
    expect(out).toEqual(['2026-05-20', '2026-05-21', '2026-05-22', '2026-05-23'])
  })
  it('weekly with byWeekday emits only matching weekdays', () => {
    // Wed=3. May 20 (Wed), 27, June 3 — all in range May 20–June 5.
    const out = expandRecurrence('2026-05-20', '2026-06-05', {
      freq: 'weekly',
      byWeekday: [3],
    })
    expect(out).toEqual(['2026-05-20', '2026-05-27', '2026-06-03'])
  })
  it('caps at MAX_RECURRENCE_INSTANCES', () => {
    const out = expandRecurrence('2026-05-20', '2099-12-31', { freq: 'daily' })
    expect(out.length).toBe(MAX_RECURRENCE_INSTANCES)
  })
  it('snaps to the next valid date when start does not match pattern', () => {
    // 2026-05-20 is Wed. Recurrence is weekly on Fri. First entry = 2026-05-22.
    const out = expandRecurrence('2026-05-20', '2026-05-28', {
      freq: 'weekly',
      byWeekday: [5],
    })
    expect(out[0]).toBe('2026-05-22')
  })
})

describe('formatRecurrence', () => {
  it('formats simple frequencies', () => {
    expect(formatRecurrence({ freq: 'daily' })).toBe('Daily')
    expect(formatRecurrence({ freq: 'weekly' })).toBe('Weekly')
    expect(formatRecurrence({ freq: 'monthly' })).toBe('Monthly')
    expect(formatRecurrence({ freq: 'yearly' })).toBe('Yearly')
  })
  it('formats intervals', () => {
    expect(formatRecurrence({ freq: 'daily', interval: 3 })).toBe('Every 3 days')
    expect(formatRecurrence({ freq: 'weekly', interval: 2 })).toBe('Every 2 weeks')
    expect(formatRecurrence({ freq: 'monthly', interval: 6 })).toBe('Every 6 months')
    expect(formatRecurrence({ freq: 'yearly', interval: 2 })).toBe('Every 2 years')
  })
  it('formats weekly with weekdays sorted', () => {
    expect(formatRecurrence({ freq: 'weekly', byWeekday: [5, 1, 3] })).toBe('Weekly · Mon, Wed, Fri')
  })
  it('formats monthly with positions + weekdays', () => {
    expect(
      formatRecurrence({ freq: 'monthly', byWeekday: [4], bySetPos: [2, 4] }),
    ).toBe('Monthly · 2nd & 4th Thu')
  })
  it('formats monthly with Last position', () => {
    expect(
      formatRecurrence({ freq: 'monthly', byWeekday: [5], bySetPos: [-1] }),
    ).toBe('Monthly · Last Fri')
  })
})

describe('formatSavedAt', () => {
  it('says "just now" within 30s', () => {
    const now = Date.now()
    expect(formatSavedAt(now - 5_000, 'en-US', now)).toBe('just now')
  })
  it('uses seconds between 30s and 60s', () => {
    const now = Date.now()
    expect(formatSavedAt(now - 45_000, 'en-US', now)).toBe('45s ago')
  })
  it('uses "1 min ago" for exactly 1 minute', () => {
    const now = Date.now()
    expect(formatSavedAt(now - 60_000, 'en-US', now)).toBe('1 min ago')
  })
  it('uses minutes between 1 and 60', () => {
    const now = Date.now()
    expect(formatSavedAt(now - 5 * 60_000, 'en-US', now)).toBe('5 min ago')
  })
  it('falls back to localized time for older timestamps', () => {
    const past = new Date(2026, 4, 20, 14, 30).getTime()
    const now = past + 2 * 60 * 60 * 1000 // 2h later
    const out = formatSavedAt(past, 'en-US', now)
    // Locale-string format varies, but it should contain a digit + AM/PM
    expect(out).toMatch(/\d/)
  })
})

describe('formatDisplayDate', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns "Today" for today', () => {
    vi.setSystemTime(new Date(2026, 4, 20))
    expect(formatDisplayDate('2026-05-20')).toBe('Today')
  })
  it('returns "Tomorrow" for +1 day', () => {
    vi.setSystemTime(new Date(2026, 4, 20))
    expect(formatDisplayDate('2026-05-21')).toBe('Tomorrow')
  })
  it('returns "Yesterday" for -1 day', () => {
    vi.setSystemTime(new Date(2026, 4, 20))
    expect(formatDisplayDate('2026-05-19')).toBe('Yesterday')
  })
  it('supports custom labels for today/tomorrow/yesterday', () => {
    vi.setSystemTime(new Date(2026, 4, 20))
    expect(
      formatDisplayDate('2026-05-20', 'en-US', { today: 'Heute' }),
    ).toBe('Heute')
  })
  it('returns "in N days" for 2–30 days out', () => {
    vi.setSystemTime(new Date(2026, 4, 20))
    expect(formatDisplayDate('2026-05-25')).toBe('in 5 days')
  })
  it('returns "in N months" for 31–364 days out', () => {
    vi.setSystemTime(new Date(2026, 0, 1))
    expect(formatDisplayDate('2026-06-01')).toBe('in 5 months')
  })
  it('returns "in N years" beyond a year', () => {
    vi.setSystemTime(new Date(2026, 4, 20))
    expect(formatDisplayDate('2028-05-20')).toBe('in 2 years')
  })
  it('appends a clock time when the iso includes T-suffix', () => {
    vi.setSystemTime(new Date(2026, 4, 20))
    const out = formatDisplayDate('2026-05-20T15:00')
    expect(out.startsWith('Today,')).toBe(true)
    expect(out).toMatch(/\d/)
  })
  it('falls back to date-only when T-suffix is malformed', () => {
    vi.setSystemTime(new Date(2026, 4, 20))
    expect(formatDisplayDate('2026-05-20Tnope')).toBe('Today')
  })
})

describe('fullDateLabel', () => {
  it('returns a date-only label by default', () => {
    const out = fullDateLabel('2026-05-17', 'en-US')
    expect(out).toBe('May 17, 2026')
  })
  it('appends the time when iso includes a T-suffix', () => {
    const out = fullDateLabel('2026-05-17T15:00', 'en-US')
    expect(out.startsWith('May 17, 2026,')).toBe(true)
    expect(out).toMatch(/\d/)
  })
  it('drops malformed time and returns date-only', () => {
    expect(fullDateLabel('2026-05-17Tnope', 'en-US')).toBe('May 17, 2026')
  })
})
