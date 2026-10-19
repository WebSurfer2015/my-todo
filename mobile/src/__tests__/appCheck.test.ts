/**
 * initAppCheck: configures the PRODUCTION attestation providers outside
 * __DEV__, never takes the app down (a rejected init or a missing native
 * module is swallowed), and runs once however often it's called.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@react-native-firebase/app', () => ({ getApp: () => ({ name: '[DEFAULT]' }) }))

const fake = vi.hoisted(() => {
  const configure = vi.fn()
  const initializeAppCheck = vi.fn(() => Promise.reject(new Error('attestation unavailable')))
  class ReactNativeFirebaseAppCheckProvider {
    configure = configure
  }
  return { configure, initializeAppCheck, ReactNativeFirebaseAppCheckProvider }
})

vi.mock('@react-native-firebase/app-check', () => ({
  ReactNativeFirebaseAppCheckProvider: fake.ReactNativeFirebaseAppCheckProvider,
  initializeAppCheck: fake.initializeAppCheck,
}))

import * as appCheckModule from '@react-native-firebase/app-check'
import { initAppCheck, __resetAppCheckForTests } from '../adapters/appCheck'

const load = () => appCheckModule as unknown as typeof import('@react-native-firebase/app-check')

describe('initAppCheck', () => {
  let warn: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    __resetAppCheckForTests()
    fake.configure.mockClear()
    fake.initializeAppCheck.mockClear()
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warn.mockRestore()
    vi.unstubAllGlobals()
  })

  it('uses App Attest (DeviceCheck fallback) / Play Integrity in production, once, swallowing a rejected init', async () => {
    vi.stubGlobal('__DEV__', false)
    expect(() => initAppCheck(load)).not.toThrow()
    expect(() => initAppCheck(load)).not.toThrow()
    expect(fake.configure).toHaveBeenCalledTimes(1)
    expect(fake.configure).toHaveBeenCalledWith({
      apple: { provider: 'appAttestWithDeviceCheckFallback' },
      android: { provider: 'playIntegrity' },
    })
    expect(fake.initializeAppCheck).toHaveBeenCalledTimes(1)
    const [, opts] = fake.initializeAppCheck.mock.calls[0] as unknown as [unknown, { isTokenAutoRefreshEnabled: boolean }]
    expect(opts.isTokenAutoRefreshEnabled).toBe(true)
    // The rejection is caught (no unhandled rejection) and logged.
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith('App Check init failed (continuing without it):', expect.any(Error)),
    )
  })

  it('uses the debug provider in __DEV__', () => {
    vi.stubGlobal('__DEV__', true)
    initAppCheck(load)
    expect(fake.configure).toHaveBeenCalledWith({
      apple: { provider: 'debug' },
      android: { provider: 'debug' },
    })
  })

  it('keeps running when the native module is missing', () => {
    vi.stubGlobal('__DEV__', false)
    expect(() =>
      initAppCheck(() => {
        throw new Error('Native module not found')
      }),
    ).not.toThrow()
    expect(warn).toHaveBeenCalledWith('App Check unavailable (continuing without it):', expect.any(Error))
    expect(fake.initializeAppCheck).not.toHaveBeenCalled()
  })
})
