/**
 * reportNonFatal: records a fixed message as a non-fatal — and never throws,
 * even when Crashlytics itself does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const log = vi.fn()
const recordError = vi.fn()
const crashlytics = vi.fn(() => ({ log, recordError }))
vi.mock('@react-native-firebase/crashlytics', () => ({ default: () => crashlytics() }))

import { reportNonFatal } from '../adapters/crashReporting'

describe('reportNonFatal', () => {
  beforeEach(() => {
    log.mockReset()
    recordError.mockReset()
    crashlytics.mockReset()
    crashlytics.mockImplementation(() => ({ log, recordError }))
  })

  it('logs the fixed message and records it as an Error', () => {
    reportNonFatal('details open dropped after retries')
    expect(log).toHaveBeenCalledWith('details open dropped after retries')
    expect(recordError).toHaveBeenCalledTimes(1)
    const err = recordError.mock.calls[0][0] as Error
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('details open dropped after retries')
  })

  it('a throwing recordError is swallowed (the log still went out)', () => {
    recordError.mockImplementation(() => {
      throw new Error('native module missing')
    })
    expect(() => reportNonFatal('x')).not.toThrow()
    expect(log).toHaveBeenCalledWith('x')
  })

  it('a throwing crashlytics() is swallowed', () => {
    crashlytics.mockImplementation(() => {
      throw new Error('not initialised')
    })
    expect(() => reportNonFatal('x')).not.toThrow()
  })
})
