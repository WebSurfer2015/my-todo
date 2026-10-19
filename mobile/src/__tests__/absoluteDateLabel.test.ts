import { describe, expect, it } from 'vitest'
import { absoluteDateLabel } from '../features/task/absoluteDateLabel'

const thisYear = new Date().getFullYear()

describe('absoluteDateLabel', () => {
  it('omits the year for a date this year', () => {
    expect(absoluteDateLabel(`${thisYear}-05-17`, 'en-US')).toBe('May 17')
  })

  it('adds the year for another year', () => {
    expect(absoluteDateLabel(`${thisYear + 1}-05-17`, 'en-US')).toBe(`May 17, ${thisYear + 1}`)
  })

  it('reads a date-only value as a local day (no UTC shift)', () => {
    expect(absoluteDateLabel(`${thisYear}-01-01`, 'en-US')).toBe('Jan 1')
  })

  it('appends the time for a timed value', () => {
    expect(absoluteDateLabel(`${thisYear}-05-17T09:00`, 'en-US')).toBe('May 17, 9:00 AM')
  })

  it('returns malformed input unchanged', () => {
    expect(absoluteDateLabel('someday', 'en-US')).toBe('someday')
  })
})
