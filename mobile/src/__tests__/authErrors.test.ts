import { describe, it, expect } from 'vitest'
import { mapAuthError } from '../adapters/authErrors'

/**
 * mapAuthError turns raw Firebase / native-SDK auth errors into the
 * user-facing sign-in copy. Untested on mobile until now — a wrong mapping
 * ships confusing auth UX. Pins the branch table + the diagnostic
 * code-append behavior.
 */
describe('mapAuthError', () => {
  it('maps known Firebase codes to friendly copy and appends the code', () => {
    expect(mapAuthError({ code: 'auth/wrong-password' })).toBe(
      "That email or password isn't right. (auth/wrong-password)",
    )
    expect(mapAuthError({ code: 'auth/network-request-failed' })).toContain(
      "Check your connection",
    )
  })

  it('gives auth/internal-error flow-specific guidance', () => {
    expect(mapAuthError({ code: 'auth/internal-error' }, 'google')).toMatch(/web client ID/)
    expect(mapAuthError({ code: 'auth/internal-error' }, 'apple')).toMatch(/Apple Service ID/)
    // no flow → generic handshake message
    expect(mapAuthError({ code: 'auth/internal-error' })).toMatch(/handshake failed/)
  })

  it('falls back to raw message + code for an unknown auth/* code', () => {
    expect(mapAuthError({ code: 'auth/brand-new', message: 'weird' })).toBe(
      'Sign-in failed: weird (auth/brand-new)',
    )
  })

  it('maps Google native SDK codes', () => {
    expect(mapAuthError({ code: 'DEVELOPER_ERROR' })).toMatch(/misconfigured/)
    expect(mapAuthError({ code: 'NETWORK_ERROR' })).toMatch(/Can't reach Google/)
  })

  it('maps Apple native codes; cancelled (1001) is silent ("")', () => {
    expect(mapAuthError({ code: '1000' })).toMatch(/iCloud/)
    expect(mapAuthError({ code: '1001' })).toBe('') // user-cancelled → no error UI
  })

  it('recognizes provider-thrown credential messages', () => {
    expect(mapAuthError({ message: 'no identity token' })).toMatch(/iCloud/)
    expect(mapAuthError({ message: 'no idToken returned' })).toMatch(/Google Sign-In didn't/)
  })

  it('detects network-ish raw messages', () => {
    expect(mapAuthError({ message: 'Request timeout' })).toMatch(/Check your connection/)
  })

  it('has a safe fallback for a totally empty error', () => {
    expect(mapAuthError({})).toBe('Sign-in failed.')
    expect(mapAuthError(null)).toBe('Sign-in failed.')
  })
})
