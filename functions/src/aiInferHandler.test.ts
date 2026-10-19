/**
 * aiInfer handler + profile gate with every boundary mocked (onCall returns
 * the raw handler, firebase-admin's profile read is a spy, quota is a spy,
 * the Anthropic SDK replays a fixture). Covers: the gate FAILS CLOSED, the
 * reservation is refunded when the model call fails, suggest-fields is sent
 * WITHOUT cache_control, and App Check is wired to the rollout flag.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  create: vi.fn(),
  profileGet: vi.fn(),
  reserveDailyCall: vi.fn(),
  refundUsage: vi.fn(),
}))

vi.mock('firebase-functions/v2/https', async (importOriginal) => {
  const real = await importOriginal<typeof import('firebase-functions/v2/https')>()
  return {
    ...real,
    onCall: (opts: unknown, handler: (req: unknown) => unknown) =>
      Object.assign(handler, { __opts: opts }),
  }
})
vi.mock('firebase-functions/params', () => ({
  defineSecret: () => ({ value: () => 'sk-ant-test' }),
}))
vi.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: vi.fn(),
  firestore: () => ({ doc: () => ({ get: h.profileGet }) }),
}))
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {}
  class Anthropic {
    static APIError = APIError
    messages = { create: h.create }
  }
  return { default: Anthropic }
})
vi.mock('./quota', () => ({
  reserveDailyCall: h.reserveDailyCall,
  refundUsage: h.refundUsage,
}))

import { agentEnabledFromProfile, aiInfer, isAgentEnabled } from './aiInfer'
import { APP_CHECK_ENFORCED } from './appCheck'

type Handler = ((req: unknown) => Promise<{ result: unknown }>) & { __opts: Record<string, unknown> }
const handler = aiInfer as unknown as Handler
const CHARGE = { date: '2026-10-19', calls: 1, chatTurns: 0, chatConversations: 0, mochi: null }

const profile = (data: unknown) => ({
  exists: true,
  data: () => ({ value: JSON.stringify({ version: 1, data }) }),
})
const suggestInput = {
  text: 'call mom tomorrow',
  today: '2026-10-19',
  categories: [{ id: 'home', label: 'Home' }],
}
const call = (data: unknown) =>
  handler({ auth: { uid: 'u1' }, data, rawRequest: { header: () => undefined } })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  h.profileGet.mockResolvedValue({ exists: false, data: () => undefined })
  h.reserveDailyCall.mockResolvedValue(CHARGE)
})

describe('agentEnabledFromProfile (pure gate)', () => {
  it('on by default; off only on an explicit false', () => {
    expect(agentEnabledFromProfile(false, undefined)).toBe(true)
    expect(agentEnabledFromProfile(true, {})).toBe(true)
    expect(agentEnabledFromProfile(true, profile({}).data())).toBe(true)
    expect(agentEnabledFromProfile(true, profile({ agentEnabled: true }).data())).toBe(true)
    expect(agentEnabledFromProfile(true, profile({ agentEnabled: false }).data())).toBe(false)
  })
  it('an unparseable envelope fails closed', () => {
    expect(agentEnabledFromProfile(true, { value: '{not json' })).toBe(false)
  })
})

describe('isAgentEnabled', () => {
  it('fails CLOSED when the Firestore read throws', async () => {
    h.profileGet.mockRejectedValue(new Error('UNAVAILABLE'))
    await expect(isAgentEnabled('u1')).resolves.toBe(false)
  })
  it('reads the profile opt-out', async () => {
    h.profileGet.mockResolvedValue(profile({ agentEnabled: false }))
    await expect(isAgentEnabled('u1')).resolves.toBe(false)
    h.profileGet.mockResolvedValue(profile({ agentEnabled: true }))
    await expect(isAgentEnabled('u1')).resolves.toBe(true)
  })
})

describe('aiInfer handler', () => {
  it('wires App Check from the rollout flag (off by default)', () => {
    expect(handler.__opts.enforceAppCheck).toBe(APP_CHECK_ENFORCED)
  })

  it('a Firestore blip on the profile read blocks the call (no reserve, no model)', async () => {
    h.profileGet.mockRejectedValue(new Error('UNAVAILABLE'))
    await expect(call({ mode: 'suggest-todo-fields', input: suggestInput })).rejects.toMatchObject({
      code: 'failed-precondition',
    })
    expect(h.reserveDailyCall).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
  })

  it('rejects an unknown mode and invalid input before reserving', async () => {
    await expect(call({ mode: 'nope', input: {} })).rejects.toMatchObject({ code: 'invalid-argument' })
    await expect(
      call({ mode: 'suggest-todo-fields', input: { ...suggestInput, today: '2026-02-31' } }),
    ).rejects.toMatchObject({ code: 'invalid-argument' })
    expect(h.reserveDailyCall).not.toHaveBeenCalled()
  })

  it('suggest-fields: plain-string system (no cache_control), parsed result', async () => {
    h.create.mockResolvedValue({
      content: [{ type: 'text', text: '{"dueDate":"2026-10-20","cleanedText":"call mom"}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 2000, output_tokens: 20 },
    })
    const res = await call({ mode: 'suggest-todo-fields', input: suggestInput })
    const sent = h.create.mock.calls[0][0] as { system: unknown; messages: Array<{ content: string }> }
    expect(typeof sent.system).toBe('string')
    expect(JSON.stringify(sent)).not.toContain('cache_control')
    expect(sent.messages[0].content.startsWith('<todo>')).toBe(true)
    expect(res.result).toMatchObject({ dueDate: '2026-10-20', cleanedText: 'call mom' })
    expect(h.refundUsage).not.toHaveBeenCalled()
  })

  it('refunds the daily-cap slot when the model call fails', async () => {
    h.create.mockRejectedValue(new Error('timeout'))
    await expect(call({ mode: 'suggest-todo-fields', input: suggestInput })).rejects.toMatchObject({
      code: 'internal',
    })
    expect(h.refundUsage).toHaveBeenCalledWith('u1', CHARGE)
  })
})
