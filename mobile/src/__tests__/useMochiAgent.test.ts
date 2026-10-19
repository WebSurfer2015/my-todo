// @vitest-environment happy-dom
/**
 * Tests for mobile/src/features/mochi/useMochiAgent.ts — the Mochi chat
 * request state machine. fetch is stubbed (never hits the Cloud Function);
 * the Firebase auth module is mocked; the cold-start back-off is zeroed.
 *
 * Locks in the QA 2026-10-18 fixes: quota detection on the first AND the
 * retried 429, no duplicate user turn on "Try again", close (reset) aborts the
 * in-flight turn, non-retryable 4xx are 'blocked', follow-ups are tagged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

// Mocked by its mobile path: the hook resolves the package from mobile/node_modules
// (web doesn't install it), so the bare specifier would be a different module id.
vi.mock('@react-native-firebase/auth', () => ({
  default: () => ({ currentUser: { getIdToken: async () => 'id-token' } }),
}))
vi.mock('../../../core/src/ports/aiContracts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../core/src/ports/aiContracts')>()),
  COLD_START_RETRY_MS: 0,
}))

import { useMochiAgent } from '../features/mochi/useMochiAgent'

const CTX = { today: '2026-10-18', categories: [], todos: [], trashedTodos: [], groceries: [], stores: [] }
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const quota429 = () => json({ error: { status: 'RESOURCE_EXHAUSTED', message: 'resting' } }, 429)
const transient429 = () => new Response('Rate exceeded.', { status: 429 })
const reply = (r: Record<string, unknown>) => json({ result: { reply: 'ok', operations: [], ...r } })

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

/** The `messages` array the hook put on the wire for call #n. */
const wireMessages = (n: number) =>
  JSON.parse((fetchMock.mock.calls[n][1] as RequestInit).body as string).data.messages

describe('useMochiAgent', () => {
  it('429 RESOURCE_EXHAUSTED → quota, no retry', async () => {
    fetchMock.mockResolvedValueOnce(quota429())
    const { result } = renderHook(() => useMochiAgent())
    let res: { ok: boolean; error?: string } | undefined
    await act(async () => {
      res = await result.current.send('call mom', CTX as never)
    })
    expect(res).toEqual({ ok: false, error: 'quota' })
    expect(result.current.errorKind).toBe('quota')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('transient 429 then quota 429 on the retry → still quota (graceful fallback)', async () => {
    fetchMock.mockResolvedValueOnce(transient429()).mockResolvedValueOnce(quota429())
    const { result } = renderHook(() => useMochiAgent())
    let res: { ok: boolean; error?: string } | undefined
    await act(async () => {
      res = await result.current.send('call mom', CTX as never)
    })
    expect(res?.error).toBe('quota')
    expect(result.current.errorKind).toBe('quota')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('transient 429 then success → ok, assistant turn appended', async () => {
    fetchMock.mockResolvedValueOnce(transient429()).mockResolvedValueOnce(reply({}))
    const { result } = renderHook(() => useMochiAgent())
    await act(async () => {
      await result.current.send('hi', CTX as never)
    })
    expect(result.current.error).toBeNull()
    expect(result.current.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
  })

  it('"Try again" after a failure does not duplicate the user turn', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed')).mockResolvedValueOnce(reply({}))
    const { result } = renderHook(() => useMochiAgent())
    await act(async () => {
      await result.current.send('call mom', CTX as never)
    })
    expect(result.current.errorKind).toBe('fail')
    await act(async () => {
      await result.current.send('call mom', CTX as never)
    })
    expect(wireMessages(1)).toEqual([{ role: 'user', content: 'call mom' }])
    expect(result.current.messages.filter((m) => m.role === 'user')).toHaveLength(1)
  })

  it('reset() (closing the sheet) aborts the in-flight turn — the late reply never lands', async () => {
    let resolveFetch: (r: Response) => void = () => {}
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          resolveFetch = resolve
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const { result } = renderHook(() => useMochiAgent())
    let pending: Promise<{ ok: boolean; error?: string }> = Promise.resolve({ ok: true })
    // Wait until the request is actually in flight (send awaits the ID token
    // before calling fetch), THEN close the sheet.
    await act(async () => {
      pending = result.current.send('add call mom tomorrow', CTX as never)
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    })
    act(() => result.current.reset())
    resolveFetch(reply({ operations: [{ kind: 'createTodo', args: { text: 'call mom' } }] }))
    let res: { ok: boolean; error?: string } | undefined
    await act(async () => {
      res = await pending
    })
    expect(res?.error).toBe('aborted')
    expect(result.current.messages).toEqual([])
    expect(result.current.isThinking).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('400 FAILED_PRECONDITION (AI off in profile) → blocked, not "couldn\'t reach us"', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ error: { status: 'FAILED_PRECONDITION', message: 'AI assistance is off in your profile.' } }, 400),
    )
    const { result } = renderHook(() => useMochiAgent())
    await act(async () => {
      await result.current.send('hi', CTX as never)
    })
    expect(result.current.errorKind).toBe('blocked')
    expect(result.current.error).toMatch(/turned off/)
  })

  it('sends conversationStart until the server has replied', async () => {
    fetchMock.mockResolvedValueOnce(reply({ reply: 'When should I set it for' })).mockResolvedValueOnce(reply({}))
    const { result } = renderHook(() => useMochiAgent())
    await act(async () => {
      await result.current.send('call mom', CTX as never)
    })
    const body = (n: number) => JSON.parse((fetchMock.mock.calls[n][1] as RequestInit).body as string).data
    expect(body(0).conversationStart).toBe(true)
    await act(async () => {
      await result.current.send('Friday', CTX as never)
    })
    expect(body(1).conversationStart).toBe(false)
  })

  it('a no-op STATEMENT keeps its period and is not a follow-up', async () => {
    fetchMock.mockResolvedValueOnce(reply({ reply: "I couldn't find that to-do." }))
    const { result } = renderHook(() => useMochiAgent())
    await act(async () => {
      await result.current.send('delete the dentist one', CTX as never)
    })
    expect(result.current.messages[1]).toMatchObject({
      content: "I couldn't find that to-do.",
      isFollowUp: false,
    })
  })

  it('stores the server sig on the assistant turn and echoes it back (assistant turns only)', async () => {
    fetchMock
      .mockResolvedValueOnce(reply({ reply: 'When should I set it for?', sig: 'sig-1' }))
      .mockResolvedValueOnce(reply({ reply: 'ok' }))
    const { result } = renderHook(() => useMochiAgent())
    await act(async () => {
      await result.current.send('call mom', CTX as never)
    })
    expect(result.current.messages[1].sig).toBe('sig-1')
    await act(async () => {
      await result.current.send('Friday', CTX as never)
    })
    expect(wireMessages(1)).toEqual([
      { role: 'user', content: 'call mom' },
      { role: 'assistant', content: 'When should I set it for?', sig: 'sig-1' },
      { role: 'user', content: 'Friday' },
    ])
  })

  it.each([
    ['Will do — I added it.', false],
    ["Can do! It's on your list.", false],
    ['Want to see it later.', false],
    ['Do you want a reminder', true],
    ['Should I set it for Friday', true],
    ['Is that the dentist one', true],
    ['What time works', true],
    ['Anything else to add', true],
    ['Want me to add it to Work', true],
  ])('no-op reply %j → question: %s', async (text, isQuestion) => {
    fetchMock.mockResolvedValueOnce(reply({ reply: text }))
    const { result } = renderHook(() => useMochiAgent())
    await act(async () => {
      await result.current.send('x', CTX as never)
    })
    const turn = result.current.messages[1]
    expect(turn.isFollowUp).toBe(isQuestion)
    expect(turn.content.endsWith('?')).toBe(isQuestion)
  })

  it('a follow-up question reply is tagged isFollowUp; a proposal is not', async () => {
    fetchMock
      .mockResolvedValueOnce(reply({ reply: 'When should I set it for' }))
      .mockResolvedValueOnce(
        reply({ reply: 'Here you go', operations: [{ kind: 'createTodo', args: { text: 'x' } }] }),
      )
    const { result } = renderHook(() => useMochiAgent())
    await act(async () => {
      await result.current.send('call mom', CTX as never)
    })
    const followUp = result.current.messages[1]
    expect(followUp).toMatchObject({ role: 'assistant', isFollowUp: true })
    expect(followUp.content.endsWith('?')).toBe(true)
    await act(async () => {
      await result.current.send('Friday', CTX as never)
    })
    expect(result.current.messages[3].isFollowUp).toBe(false)
  })

  it('a normalized question (display gains "?") still echoes the RAW server reply on the wire', async () => {
    fetchMock
      .mockResolvedValueOnce(reply({ reply: 'When should I set it for.  ', sig: 'sig-raw' }))
      .mockResolvedValueOnce(reply({ reply: 'ok' }))
    const { result } = renderHook(() => useMochiAgent())
    await act(async () => {
      await result.current.send('call mom', CTX as never)
    })
    expect(result.current.messages[1].content).toBe('When should I set it for?')
    await act(async () => {
      await result.current.send('Friday', CTX as never)
    })
    expect(wireMessages(1)[1]).toEqual({
      role: 'assistant',
      content: 'When should I set it for.  ',
      sig: 'sig-raw',
    })
  })
})
