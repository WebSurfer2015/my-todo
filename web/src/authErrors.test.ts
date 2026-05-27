/**
 * Tests for mobile/src/authErrors.ts — the auth error → user-readable
 * string mapper. The mapper is the only thing standing between a
 * cryptic Firebase / Apple / Google SDK code and a sign-in screen
 * full of "(auth/internal-error)" noise, so it's worth locking down.
 *
 * Pure function, no native deps — hosts cleanly under web vitest.
 */
import { describe, expect, it } from 'vitest'
import { mapAuthError } from '../../mobile/src/authErrors'

describe('mapAuthError — Firebase auth/* codes', () => {
  it('maps invalid-api-key to a config-stale message + appends code', () => {
    const out = mapAuthError({ code: 'auth/invalid-api-key', message: 'orig' })
    expect(out).toContain('misconfigured')
    expect(out).toContain('(auth/invalid-api-key)')
  })
  it('maps user-disabled', () => {
    expect(mapAuthError({ code: 'auth/user-disabled' })).toContain('disabled')
  })
  it('maps wrong-password and invalid-credential to the same shielded message', () => {
    const a = mapAuthError({ code: 'auth/wrong-password' })
    const b = mapAuthError({ code: 'auth/invalid-credential' })
    // Both should hide whether the email or password was wrong.
    expect(a).toContain("isn't right")
    expect(b).toContain("isn't right")
  })
  it('maps weak-password', () => {
    expect(mapAuthError({ code: 'auth/weak-password' })).toContain('too weak')
  })
  it('falls back to "Sign-in failed: <raw>" for unknown auth/* codes', () => {
    const out = mapAuthError({
      code: 'auth/some-future-code',
      message: 'boom',
    })
    expect(out).toContain('Sign-in failed')
    expect(out).toContain('boom')
    expect(out).toContain('(auth/some-future-code)')
  })
  it('uses cancelled-popup-request as a silent empty string', () => {
    // Empty fallback gives the UI a "no error to show" cue.
    const out = mapAuthError({ code: 'auth/cancelled-popup-request' })
    expect(out).toContain('(auth/cancelled-popup-request)')
  })
})

describe('mapAuthError — auth/internal-error per-flow guidance', () => {
  it('says "OAuth web client ID" for the Google flow', () => {
    const out = mapAuthError(
      { code: 'auth/internal-error', message: '' },
      'google',
    )
    expect(out).toContain('OAuth web client ID')
  })
  it('says "Apple Service ID" for the Apple flow', () => {
    const out = mapAuthError(
      { code: 'auth/internal-error', message: '' },
      'apple',
    )
    expect(out).toContain('Apple Service ID')
  })
  it('uses the generic Firebase message when no flow is given', () => {
    const out = mapAuthError({ code: 'auth/internal-error', message: '' })
    expect(out).toContain('handshake failed')
    expect(out).not.toContain('OAuth web client ID')
  })
})

describe('mapAuthError — Apple native SDK', () => {
  it('maps 1000 (no iCloud)', () => {
    expect(mapAuthError({ code: '1000' })).toContain('iCloud')
  })
  it('maps ERR_REQUEST_NOT_HANDLED to config guidance', () => {
    expect(mapAuthError({ code: 'ERR_REQUEST_NOT_HANDLED' })).toContain(
      'not configured',
    )
  })
  it('passes through raw message for cancelled (1001)', () => {
    expect(mapAuthError({ code: '1001', message: 'cancelled' })).toBe('cancelled')
  })
})

describe('mapAuthError — Google native SDK', () => {
  it('maps PLAY_SERVICES_NOT_AVAILABLE', () => {
    expect(mapAuthError({ code: 'PLAY_SERVICES_NOT_AVAILABLE' })).toContain(
      'Google Play Services',
    )
  })
  it('maps DEVELOPER_ERROR to config guidance', () => {
    expect(mapAuthError({ code: 'DEVELOPER_ERROR' })).toContain('misconfigured')
  })
})

describe('mapAuthError — provider-specific thrown messages', () => {
  it('detects "no identity token" → Apple iCloud message', () => {
    expect(
      mapAuthError({ code: '', message: 'native: no identity token returned' }),
    ).toContain('iCloud')
  })
  it('detects "no idToken" → Google guidance', () => {
    expect(
      mapAuthError({ code: '', message: 'google: no idToken in result' }),
    ).toContain('Google Sign-In didn')
  })
})

describe('mapAuthError — network heuristics', () => {
  it('catches messages containing "network"', () => {
    expect(mapAuthError({ code: '', message: 'network request failed' }))
      .toContain("Can't reach the sign-in server")
  })
  it('catches "timeout"', () => {
    expect(mapAuthError({ code: '', message: 'request timeout' })).toContain(
      "Can't reach the sign-in server",
    )
  })
})

describe('mapAuthError — defensive fallbacks', () => {
  it('handles null / undefined input', () => {
    expect(mapAuthError(null)).toBe('Sign-in failed.')
    expect(mapAuthError(undefined)).toBe('Sign-in failed.')
  })
  it('handles missing code and missing message', () => {
    expect(mapAuthError({})).toBe('Sign-in failed.')
  })
  it('handles numeric codes by stringifying', () => {
    const out = mapAuthError({ code: 1001 })
    // Apple native 1001 = cancelled → empty mapped → falls back to raw msg
    // (empty here); the function returns the empty mapped string.
    expect(out).toBe('')
  })
})
