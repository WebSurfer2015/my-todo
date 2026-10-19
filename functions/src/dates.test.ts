import { describe, expect, it } from 'vitest'
import { isValidDueDate, isValidIsoDate, isValidIsoDateTime } from './dates'

describe('isValidIsoDate', () => {
  it('accepts real calendar dates', () => {
    expect(isValidIsoDate('2026-06-07')).toBe(true)
    expect(isValidIsoDate('2028-02-29')).toBe(true) // leap year
    expect(isValidIsoDate('2026-12-31')).toBe(true)
  })
  it('rejects impossible dates the shape regex used to let through', () => {
    expect(isValidIsoDate('2026-02-31')).toBe(false)
    expect(isValidIsoDate('2026-02-29')).toBe(false) // not a leap year
    expect(isValidIsoDate('2026-13-01')).toBe(false)
    expect(isValidIsoDate('2026-00-10')).toBe(false)
    expect(isValidIsoDate('2026-04-31')).toBe(false)
    expect(isValidIsoDate('2026-04-00')).toBe(false)
  })
  it('rejects wrong shapes and non-strings', () => {
    expect(isValidIsoDate('2026-6-7')).toBe(false)
    expect(isValidIsoDate('2026-06-07T09:00')).toBe(false)
    expect(isValidIsoDate('2026-06-07 ')).toBe(false)
    expect(isValidIsoDate('')).toBe(false)
    expect(isValidIsoDate(20260607)).toBe(false)
    expect(isValidIsoDate(null)).toBe(false)
  })
})

describe('isValidIsoDateTime', () => {
  it('accepts real local datetimes', () => {
    expect(isValidIsoDateTime('2026-06-07T09:00')).toBe(true)
    expect(isValidIsoDateTime('2026-06-07T23:59')).toBe(true)
    expect(isValidIsoDateTime('2026-06-07T00:00')).toBe(true)
  })
  it('rejects out-of-range clock values and impossible days', () => {
    expect(isValidIsoDateTime('2026-06-07T25:99')).toBe(false)
    expect(isValidIsoDateTime('2026-06-07T24:00')).toBe(false)
    expect(isValidIsoDateTime('2026-06-07T12:60')).toBe(false)
    expect(isValidIsoDateTime('2026-02-31T09:00')).toBe(false)
  })
  it('rejects zoned / second-precision / date-only forms', () => {
    expect(isValidIsoDateTime('2026-06-07T09:00Z')).toBe(false)
    expect(isValidIsoDateTime('2026-06-07T09:00:00')).toBe(false)
    expect(isValidIsoDateTime('2026-06-07')).toBe(false)
  })
})

describe('isValidDueDate', () => {
  it('accepts either form, calendar-checked', () => {
    expect(isValidDueDate('2026-06-07')).toBe(true)
    expect(isValidDueDate('2026-06-07T15:00')).toBe(true)
    expect(isValidDueDate('2026-02-31')).toBe(false)
    expect(isValidDueDate('2026-06-07T25:99')).toBe(false)
    expect(isValidDueDate('')).toBe(false)
  })
})
