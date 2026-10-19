/**
 * agentChat handler (index.ts) — the thin I/O shell around agentChatCore,
 * with every boundary mocked: onCall returns the raw handler, the secret is
 * a constant, quota / profile gate are spies, and the Anthropic SDK replays a
 * fixture (no network, no Firestore).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  create: vi.fn(),
  reserveChatTurn: vi.fn(),
  reserveMochiRequest: vi.fn(),
  refundUsage: vi.fn(),
  isAgentEnabled: vi.fn(),
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
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    status = 529
    request_id = 'req_1'
  }
  class Anthropic {
    static APIError = APIError
    messages = { create: h.create }
  }
  return { default: Anthropic }
})
vi.mock('./quota', () => ({
  reserveChatTurn: h.reserveChatTurn,
  reserveMochiRequest: h.reserveMochiRequest,
  refundUsage: h.refundUsage,
}))
vi.mock('./aiInfer', () => ({ isAgentEnabled: h.isAgentEnabled, aiInfer: {} }))
vi.mock('./revenuecat', () => ({ revenuecatWebhook: {} }))
vi.mock('./deleteUserData', () => ({ onUserDeleted: {} }))
vi.mock('./metricsRollupJob', () => ({ metricsRollup: {} }))

import { agentChat } from './index'
import { deriveChatSigKey, signReply, verifyReplySig } from './chatSignature'
import { APP_CHECK_ENFORCED } from './appCheck'
import { EMPTY_REPLY_FALLBACK } from './agentChatCore'

type Handler = ((req: unknown) => Promise<{
  reply: string
  sig: string
  operations: unknown[]
  awaitingConfirmation: boolean
  usage: { input: number; output: number }
}>) & { __opts: Record<string, unknown> }
const handler = agentChat as unknown as Handler
const key = deriveChatSigKey('sk-ant-test')
const CHARGE = { date: '2026-10-19', calls: 1, chatTurns: 1, chatConversations: 1, mochi: null }

const call = (data: unknown, auth: unknown = { uid: 'u1' }) =>
  handler({ auth, data, rawRequest: { header: () => undefined } })

const fixture = (...content: unknown[]) => ({
  content,
  stop_reason: 'end_turn',
  usage: { input_tokens: 1200, output_tokens: 40, cache_read_input_tokens: 1000 },
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  h.isAgentEnabled.mockResolvedValue(true)
  h.reserveChatTurn.mockResolvedValue(CHARGE)
  h.refundUsage.mockResolvedValue(undefined)
})

describe('agentChat handler', () => {
  it('wires App Check from the rollout flag (off by default)', () => {
    expect(handler.__opts.enforceAppCheck).toBe(APP_CHECK_ENFORCED)
    expect(handler.__opts.maxInstances).toBe(5)
  })

  it('rejects unauthenticated, empty, and assistant-first requests before any spend', async () => {
    await expect(call({ messages: [{ role: 'user', content: 'hi' }] }, null)).rejects.toMatchObject({
      code: 'unauthenticated',
    })
    await expect(call({ messages: [{ role: 'user', content: '  ' }] })).rejects.toMatchObject({
      code: 'invalid-argument',
    })
    await expect(call({ messages: 'nope' })).rejects.toMatchObject({ code: 'invalid-argument' })
    expect(h.reserveChatTurn).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
  })

  it('profile opt-out stops the request before the reservation', async () => {
    h.isAgentEnabled.mockResolvedValue(false)
    await expect(call({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toMatchObject({
      code: 'failed-precondition',
    })
    expect(h.reserveChatTurn).not.toHaveBeenCalled()
  })

  it('returns a signed reply + validated ops; a signed follow-up is free', async () => {
    h.create.mockResolvedValue(
      fixture(
        { type: 'text', text: "I'll add milk!" },
        { type: 'tool_use', id: 't', name: 'addGroceryItem', input: { text: 'milk' } },
      ),
    )
    const res = await call({
      messages: [
        { role: 'user', content: 'add milk' },
        { role: 'assistant', content: 'Which store?', sig: signReply(key, 'u1', 'add milk', 'Which store?') },
        { role: 'user', content: 'any' },
      ],
      context: { today: '2026-10-19' },
    })
    expect(h.reserveChatTurn).toHaveBeenCalledWith('u1', false)
    expect(res.reply).toBe("I'll add milk.")
    expect(verifyReplySig(key, 'u1', 'any', res.reply, res.sig)).toBe(true)
    // Bound to the caller + the user turn it answered.
    expect(verifyReplySig(key, 'u2', 'any', res.reply, res.sig)).toBe(false)
    expect(verifyReplySig(key, 'u1', 'add milk', res.reply, res.sig)).toBe(false)
    expect(res.operations).toEqual([{ kind: 'addGroceryItem', args: { text: 'milk' } }])
    expect(res.awaitingConfirmation).toBe(true)
    expect(res.usage).toEqual({ input: 1200, output: 40 })
    // The request sent upstream never carries the sig.
    const sent = h.create.mock.calls[0][0] as { messages: unknown[] }
    expect(JSON.stringify(sent.messages)).not.toContain('sig')
  })

  it('unsigned history takes a fair-use slot', async () => {
    h.create.mockResolvedValue(fixture({ type: 'text', text: 'Which store?' }))
    await call({
      messages: [
        { role: 'user', content: 'earlier' },
        { role: 'assistant', content: 'Sure.' },
        { role: 'user', content: 'add milk' },
      ],
    })
    expect(h.reserveChatTurn).toHaveBeenCalledWith('u1', true)
  })

  it('refunds the reservation when the upstream call fails, and hides the error', async () => {
    h.create.mockRejectedValue(new Error('socket hang up: secret detail'))
    const err = await call({ messages: [{ role: 'user', content: 'add milk' }] }).catch((e) => e)
    expect(err).toMatchObject({ code: 'internal', message: "Mochi couldn't think just now." })
    expect(h.refundUsage).toHaveBeenCalledWith('u1', CHARGE)
  })

  it('a quota rejection propagates and never calls the model', async () => {
    const { HttpsError } = await import('firebase-functions/v2/https')
    h.reserveChatTurn.mockRejectedValue(new HttpsError('resource-exhausted', 'resting'))
    await expect(call({ messages: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({
      code: 'resource-exhausted',
    })
    expect(h.create).not.toHaveBeenCalled()
    expect(h.refundUsage).not.toHaveBeenCalled()
  })

  it('a question-like no-op reply is normalized BEFORE signing; echoed verbatim it is a free follow-up', async () => {
    h.create.mockResolvedValue(fixture({ type: 'text', text: 'Which store should I use.  ' }))
    const first = await call({ messages: [{ role: 'user', content: 'add milk' }] })
    expect(first.reply).toBe('Which store should I use?')
    expect(first.awaitingConfirmation).toBe(false)
    expect(verifyReplySig(key, 'u1', 'add milk', first.reply, first.sig)).toBe(true)
    h.reserveChatTurn.mockClear()
    await call({
      messages: [
        { role: 'user', content: 'add milk' },
        { role: 'assistant', content: first.reply, sig: first.sig },
        { role: 'user', content: 'costco' },
      ],
    })
    expect(h.reserveChatTurn).toHaveBeenCalledWith('u1', false)
  })

  it('another account replaying a signed history takes a slot', async () => {
    h.create.mockResolvedValue(fixture({ type: 'text', text: 'Okay.' }))
    await call(
      {
        messages: [
          { role: 'user', content: 'add milk' },
          { role: 'assistant', content: 'Which store?', sig: signReply(key, 'u1', 'add milk', 'Which store?') },
          { role: 'user', content: 'any' },
        ],
      },
      { uid: 'u2' },
    )
    expect(h.reserveChatTurn).toHaveBeenCalledWith('u2', true)
  })

  it('an empty model response gets a calm, signed fallback (never an empty assistant turn)', async () => {
    h.create.mockResolvedValue(fixture())
    const res = await call({ messages: [{ role: 'user', content: 'hmm' }] })
    expect(res.reply).toBe(EMPTY_REPLY_FALLBACK)
    expect(res.operations).toEqual([])
    expect(verifyReplySig(key, 'u1', 'hmm', res.reply, res.sig)).toBe(true)
  })
})
