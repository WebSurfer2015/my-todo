import { describe, it, expect } from 'vitest'
import {
  endOfMonthLocal,
  endOfYearLocal,
} from '../src/logic/utils'

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
