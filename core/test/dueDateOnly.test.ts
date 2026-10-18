import { describe, it, expect } from 'vitest'
import { dueDateOnly } from '../src/logic/utils'

/**
 * dueDateOnly strips the optional time suffix so timed todos bucket with
 * their date-only siblings. It's called from ~everywhere date math
 * happens (grouping, overdue, recurrence), so its edge cases are
 * load-bearing.
 */

describe('dueDateOnly', () => {
  it('returns empty string for undefined or empty input', () => {
    expect(dueDateOnly(undefined)).toBe('')
    expect(dueDateOnly('')).toBe('')
  })

  it('passes a bare date through unchanged', () => {
    expect(dueDateOnly('2026-06-09')).toBe('2026-06-09')
  })

  it('strips a time suffix down to the date part', () => {
    expect(dueDateOnly('2026-06-09T14:30')).toBe('2026-06-09')
  })

  it('strips a full timestamp (seconds + millis + zone) down to the date', () => {
    expect(dueDateOnly('2026-06-09T14:30:45.123Z')).toBe('2026-06-09')
  })
})
