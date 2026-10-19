import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_CHECK_ENFORCED, appCheckStatus, logAppCheck } from './appCheck'

const raw = (token?: string) => ({
  header: (name: string) => (name === 'X-Firebase-AppCheck' ? token : undefined),
})

describe('App Check (measure mode)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('ships OFF until the client sends tokens (rollout gate)', () => {
    expect(APP_CHECK_ENFORCED).toBe(false)
  })
  it('classifies valid / invalid / missing tokens', () => {
    expect(appCheckStatus({ app: { appId: 'a' }, rawRequest: raw('tok') })).toBe('valid')
    expect(appCheckStatus({ rawRequest: raw('garbage') })).toBe('invalid')
    expect(appCheckStatus({ rawRequest: raw(undefined) })).toBe('missing')
    expect(appCheckStatus({})).toBe('missing')
  })
  it('logs a structured line with no uid or token', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logAppCheck('aiInfer', { rawRequest: raw('secret-token') })
    expect(spy).toHaveBeenCalledTimes(1)
    const line = spy.mock.calls[0][0] as string
    expect(JSON.parse(line)).toEqual({ event: 'appCheck', fn: 'aiInfer', status: 'invalid' })
    expect(line).not.toContain('secret-token')
  })
})
