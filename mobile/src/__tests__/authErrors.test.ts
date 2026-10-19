/**
 * Tests for mobile/src/authErrors.ts — the auth error → user-readable
 * string mapper. The mapper is the only thing standing between a
 * cryptic Firebase / Apple / Google SDK code and a sign-in screen
 * full of "(auth/internal-error)" noise, so it's worth locking down.
 *
 * Pure function, no native deps — hosts cleanly under web vitest.
 */
import { describe, expect, it } from 'vitest'
import { authErrorDiagnostic, mapAuthError } from '../adapters/authErrors'
import { AUTH_FALLBACK_MESSAGE, authErrorCode } from '../../../core/src/data/authMessages'

/** Configuration jargon must never reach the sign-in screen. */
const JARGON = /OAuth|client ID|Service ID|handshake|misconfigured|configured|for this build|scope/i

describe('mapAuthError — Firebase auth/* codes', () => {
  it('maps invalid-api-key to calm "update the app" copy, with no raw code shown', () => {
    const out = mapAuthError({ code: 'auth/invalid-api-key', message: 'orig' })
    expect(out).toContain('update the app')
    expect(out).not.toMatch(JARGON)
    expect(out).not.toContain('auth/')
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
  it('unknown auth/* codes get the calm fallback — no raw message or code', () => {
    const out = mapAuthError({
      code: 'auth/some-future-code',
      message: 'boom',
    })
    expect(out).toBe("Couldn't sign you in just now. Please try again.")
  })
  it('cancelled-popup-request shows no code to the user', () => {
    const out = mapAuthError({ code: 'auth/cancelled-popup-request' })
    expect(out).not.toContain('auth/')
  })
})

describe('mapAuthError — auth/internal-error per flow: calm, no jargon', () => {
  it('Google flow: "Couldn\'t sign in with Google…"', () => {
    const out = mapAuthError({ code: 'auth/internal-error', message: '' }, 'google')
    expect(out).toBe("Couldn't sign in with Google just now. Please try again, or use another option.")
  })
  it('Apple flow: "Couldn\'t sign in with Apple…"', () => {
    const out = mapAuthError({ code: 'auth/internal-error', message: '' }, 'apple')
    expect(out).toBe("Couldn't sign in with Apple just now. Please try again, or use another option.")
  })
  it('no flow: the generic calm copy', () => {
    const out = mapAuthError({ code: 'auth/internal-error', message: '' })
    expect(out).toBe("Couldn't sign you in just now. Please try again, or use another option.")
  })
  it('the technical reading goes to the crash log only', () => {
    expect(authErrorDiagnostic({ code: 'auth/internal-error' }, 'google')).toBe(
      "auth/internal-error (google): OAuth web client ID in this build doesn't match what Firebase expects",
    )
    expect(authErrorDiagnostic({ code: 'DEVELOPER_ERROR' }, 'google')).toContain('client IDs')
    expect(authErrorDiagnostic({}, 'email')).toBe('(no code) (email)')
  })
})

describe('mapAuthError — Apple native SDK', () => {
  it('maps 1000 (no iCloud)', () => {
    expect(mapAuthError({ code: '1000' })).toContain('iCloud')
  })
  it('ERR_REQUEST_NOT_HANDLED / ERR_INVALID_SCOPE get calm Apple copy, no jargon', () => {
    for (const code of ['ERR_REQUEST_NOT_HANDLED', 'ERR_INVALID_SCOPE']) {
      const out = mapAuthError({ code })
      expect(out).toContain("Couldn't sign in with Apple")
      expect(out).not.toMatch(JARGON)
    }
  })
  it('cancelled (1001) shows nothing — never the raw SDK message', () => {
    expect(mapAuthError({ code: '1001', message: 'The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)' })).toBe('')
  })
})

describe('mapAuthError — Google native SDK', () => {
  it('maps PLAY_SERVICES_NOT_AVAILABLE', () => {
    expect(mapAuthError({ code: 'PLAY_SERVICES_NOT_AVAILABLE' })).toContain(
      'Google Play Services',
    )
  })
  it('maps DEVELOPER_ERROR to calm Google copy, no jargon', () => {
    const out = mapAuthError({ code: 'DEVELOPER_ERROR' })
    expect(out).toContain("Couldn't sign in with Google")
    expect(out).not.toMatch(JARGON)
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
    expect(mapAuthError(null)).toBe(AUTH_FALLBACK_MESSAGE)
    expect(mapAuthError(undefined)).toBe(AUTH_FALLBACK_MESSAGE)
  })
  it('handles missing code and missing message', () => {
    expect(mapAuthError({})).toBe(AUTH_FALLBACK_MESSAGE)
  })
  it('an unknown error shows calm copy — never its raw message or code', () => {
    const out = mapAuthError({ code: 'SOME_SDK_THING', message: 'NSInternalInconsistency 0xdead' })
    expect(out).toBe("Couldn't sign you in just now. Please try again.")
    expect(out).not.toContain('SOME_SDK_THING')
    expect(mapAuthError({ code: 'X', message: 'network down' })).not.toContain('(X)')
  })
  it('authErrorCode stringifies the code for the Crashlytics log', () => {
    expect(authErrorCode({ code: 1004 })).toBe('1004')
    expect(authErrorCode({ code: 'auth/x' })).toBe('auth/x')
    expect(authErrorCode(null)).toBe('')
    expect(authErrorCode({})).toBe('')
  })
  it('handles numeric codes by stringifying', () => {
    const out = mapAuthError({ code: 1001 })
    // Apple native 1001 = cancelled → empty mapped → falls back to raw msg
    // (empty here); the function returns the empty mapped string.
    expect(out).toBe('')
  })
})
