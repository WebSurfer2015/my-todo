/**
 * initAppCheck must never take the app down: a dev client built without the
 * native App Check module (require throws / init rejects) keeps running.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@react-native-firebase/app', () => ({ getApp: () => ({}) }))

import { initAppCheck } from '../adapters/appCheck'

describe('initAppCheck', () => {
  it('is best-effort and idempotent when the native module is unavailable', () => {
    vi.stubGlobal('__DEV__', true)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => initAppCheck()).not.toThrow()
    expect(() => initAppCheck()).not.toThrow()
    warn.mockRestore()
    vi.unstubAllGlobals()
  })
})
