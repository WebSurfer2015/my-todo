/**
 * Date chips for carried-over to-dos / steps and Done-bin rows name the day
 * ("Mon, Oct 5") — never a count of days behind ("12 days ago"); upcoming
 * ones read Today / Tomorrow / "Thu" / "Oct 24" — never "in N days". (Moved from
 * mobile/ with the helpers, now core/src/logic/labels.) Plus
 * isCustomRecurrence, shared by the compose and details sheets.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { doneOnLabel, isCustomRecurrence, rowDateLabel, weekdayDate } from '../src/logic/labels'

const TODAY = '2026-10-19'

describe('rowDateLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 19, 12, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a past date names its day, never "N days ago"', () => {
    const label = rowDateLabel('2026-10-07', 'en-US', TODAY)
    expect(label).toBe(weekdayDate('2026-10-07', { locale: 'en-US' }))
    expect(label).not.toMatch(/ago/)
    // Yesterday too — same rule as the carried-over parent row.
    expect(rowDateLabel('2026-10-18', 'en-US', TODAY)).toBe(weekdayDate('2026-10-18', { locale: 'en-US' }))
    // A past date-time drops the time (the day is what matters).
    expect(rowDateLabel('2026-10-07T15:00', 'en-US', TODAY)).toBe(weekdayDate('2026-10-07', { locale: 'en-US' }))
  })

  it('today / tomorrow, then the weekday for the next 6 days, then "Oct 24" — never "in N days"', () => {
    expect(rowDateLabel(TODAY, 'en-US', TODAY)).toBe('Today')
    expect(rowDateLabel('2026-10-20', 'en-US', TODAY)).toBe('Tomorrow')
    // 2026-10-19 is a Monday.
    expect(rowDateLabel('2026-10-21', 'en-US', TODAY)).toBe('Wed')
    expect(rowDateLabel('2026-10-22', 'en-US', TODAY)).toBe('Thu')
    expect(rowDateLabel('2026-10-25', 'en-US', TODAY)).toBe('Sun') // +6
    expect(rowDateLabel('2026-10-26', 'en-US', TODAY)).toBe('Oct 26') // +7
    expect(rowDateLabel('2026-12-24', 'en-US', TODAY)).toBe('Dec 24')
    expect(rowDateLabel('2027-01-05', 'en-US', TODAY)).toBe('Jan 5, 2027')
    for (const d of ['2026-10-21', '2026-11-30', '2027-06-01']) {
      expect(rowDateLabel(d, 'en-US', TODAY)).not.toMatch(/\bin \d|days|months|years/)
    }
  })

  it('a today / future date-time adds the time; a malformed time is ignored', () => {
    expect(rowDateLabel('2026-10-19T15:00', 'en-US', TODAY)).toMatch(/^Today, 3:00\sPM$/)
    expect(rowDateLabel('2026-10-22T09:30', 'en-US', TODAY)).toMatch(/^Thu, 9:30\sAM$/)
    expect(rowDateLabel('2026-10-19Tnope', 'en-US', TODAY)).toBe('Today')
  })

  it('crosses a DST change without an off-by-one (US fall back is Nov 1 2026)', () => {
    expect(rowDateLabel('2026-11-02', 'en-US', '2026-10-31')).toBe('Mon')
    expect(rowDateLabel('2026-11-01', 'en-US', '2026-10-31')).toBe('Tomorrow')
  })

  it('an unparseable date comes back as-is', () => {
    expect(rowDateLabel('someday', 'en-US', TODAY)).toBe('someday')
  })

  it('defaults "today" to the device day', () => {
    expect(rowDateLabel('2026-10-19')).toBe('Today')
    expect(rowDateLabel('2026-10-07', 'en-US')).not.toMatch(/ago/)
  })
})

describe('doneOnLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 19, 12, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a past completion names its day', () => {
    expect(doneOnLabel('2026-10-07', 'en-US', TODAY)).toBe(`Done ${weekdayDate('2026-10-07', { locale: 'en-US' })}`)
    expect(doneOnLabel('2026-10-07', 'en-US', TODAY)).not.toMatch(/ago/)
  })

  it('today reads "Done today"', () => {
    expect(doneOnLabel(TODAY, 'en-US', TODAY)).toBe('Done today')
    expect(doneOnLabel(TODAY)).toBe('Done today')
  })

  it('a completion dated after today is clamped to "Done today", never "Done tomorrow"', () => {
    expect(doneOnLabel('2026-10-20', 'en-US', TODAY)).toBe('Done today')
    expect(doneOnLabel('2026-11-03T08:00', 'en-US', TODAY)).toBe('Done today')
  })
})

describe('isCustomRecurrence', () => {
  it('only a weekday-picking rule is custom', () => {
    expect(isCustomRecurrence(undefined)).toBe(false)
    expect(isCustomRecurrence({ freq: 'weekly' })).toBe(false)
    expect(isCustomRecurrence({ freq: 'weekly', byWeekday: [] })).toBe(false)
    expect(isCustomRecurrence({ freq: 'daily', interval: 2 })).toBe(false)
    expect(isCustomRecurrence({ freq: 'weekly', byWeekday: [1, 3] })).toBe(true)
  })
})
