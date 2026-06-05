import { describe, it, expect } from 'vitest'
import {
  dueDateTimeMs,
  endOfMonthLocal,
  endOfYearLocal,
} from '../../core/src/logic/utils'

/**
 * The full-datetime due-date foundation. dueDateTimeMs resolves a stored
 * dueDate to a concrete local deadline moment; the preset resolvers
 * compute the end-of-period dates the picker offers.
 */
describe('dueDateTimeMs', () => {
  it('date-only resolves to END of that local day', () => {
    expect(dueDateTimeMs('2026-06-05')).toBe(
      new Date(2026, 5, 5, 23, 59, 59, 999).getTime(),
    )
  })

  it('timed value resolves to that exact local minute', () => {
    expect(dueDateTimeMs('2026-06-05T09:30')).toBe(
      new Date(2026, 5, 5, 9, 30, 0, 0).getTime(),
    )
  })

  it('returns null for empty / undefined / garbage', () => {
    expect(dueDateTimeMs('')).toBeNull()
    expect(dueDateTimeMs(undefined)).toBeNull()
    expect(dueDateTimeMs('not-a-date')).toBeNull()
  })
})

describe('end-of-period preset resolvers', () => {
  it('endOfMonthLocal returns the last day of the month', () => {
    expect(endOfMonthLocal(new Date(2026, 5, 5))).toBe('2026-06-30')
    expect(endOfMonthLocal(new Date(2026, 1, 10))).toBe('2026-02-28') // 2026 not leap
    expect(endOfMonthLocal(new Date(2024, 1, 10))).toBe('2024-02-29') // leap
  })

  it('endOfYearLocal returns Dec 31', () => {
    expect(endOfYearLocal(new Date(2026, 5, 5))).toBe('2026-12-31')
  })
})
