/**
 * Date chips for carried-over to-dos / steps and Done-bin rows name the day
 * ("Mon, Oct 5") — never a count of days behind ("12 days ago"). (Moved from
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

  it('today and future keep the relative label', () => {
    expect(rowDateLabel(TODAY, 'en-US', TODAY)).toBe('Today')
    expect(rowDateLabel('2026-10-20', 'en-US', TODAY)).toBe('Tomorrow')
    expect(rowDateLabel('2026-10-22', 'en-US', TODAY)).toBe('in 3 days')
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
