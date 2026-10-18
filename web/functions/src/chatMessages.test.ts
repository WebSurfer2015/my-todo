/**
 * Regression tests for agentChat's history windowing. The bug: an odd-length
 * alternating history sliced to the last 40 always started on an assistant
 * turn, so every send from the 21st user turn on returned 400.
 */
import { describe, expect, it } from 'vitest'
import { MAX_TURNS, MAX_TURN_CHARS, normalizeChatMessages, type ChatMessage } from './chatMessages'

/** Alternating user/assistant history with `n` messages, ending on user when n is odd. */
function history(n: number): ChatMessage[] {
  return Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `m${i}`,
  }))
}

describe('normalizeChatMessages', () => {
  it('long odd-length history (21st user turn) still starts on a user turn', () => {
    const out = normalizeChatMessages(history(41), undefined)
    expect(out[0].role).toBe('user')
    expect(out.length).toBeLessThanOrEqual(MAX_TURNS)
    expect(out[out.length - 1]).toEqual({ role: 'user', content: 'm40' }) // latest turn kept
  })

  it('works for every length up to well past the window', () => {
    for (let n = 1; n <= 101; n += 2) {
      const out = normalizeChatMessages(history(n), undefined)
      expect(out[0].role).toBe('user')
      expect(out.length).toBeLessThanOrEqual(MAX_TURNS)
      expect(out[out.length - 1].content).toBe(`m${n - 1}`)
    }
  })

  it('short histories pass through unchanged', () => {
    expect(normalizeChatMessages(history(3), undefined)).toEqual(history(3))
  })

  it('drops junk entries and truncates long turns', () => {
    const out = normalizeChatMessages(
      [null, { role: 'system', content: 'x' }, { role: 'user', content: 'a'.repeat(5000) }, 7],
      undefined,
    )
    expect(out).toEqual([{ role: 'user', content: 'a'.repeat(MAX_TURN_CHARS) }])
  })

  it('a window with no user turn is empty (caller rejects it)', () => {
    expect(normalizeChatMessages([{ role: 'assistant', content: 'hi' }], undefined)).toEqual([])
  })

  it('legacy single `turn` shape still works', () => {
    expect(normalizeChatMessages(undefined, 'buy milk')).toEqual([{ role: 'user', content: 'buy milk' }])
    expect(normalizeChatMessages(undefined, undefined)).toEqual([])
  })
})
