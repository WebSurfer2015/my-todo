// Locks in the mid-conversation fallback capture (P1.7): over the fair-use
// ceiling, Compose should get the still-open request, not just the last reply.
import { describe, expect, it } from 'vitest'
import { buildFallbackCapture, type FallbackChatTurn } from '../../core/src/logic/mochiFallback'

const user = (content: string): FallbackChatTurn => ({ role: 'user', content })
const mochi = (content: string, operations?: unknown[]): FallbackChatTurn => ({
  role: 'assistant',
  content,
  ...(operations ? { operations } : {}),
})

describe('buildFallbackCapture', () => {
  it('first message of a conversation → just that text', () => {
    expect(buildFallbackCapture([], '  buy milk ')).toEqual({ text: 'buy milk' })
  })

  it('answer to a follow-up → original request leads, answer follows', () => {
    const history = [user('call mom'), mochi('When should I set it for?')]
    expect(buildFallbackCapture(history, 'Friday')).toEqual({ text: 'call mom — Friday' })
  })

  it('collects several follow-up answers in order', () => {
    const history = [
      user('dentist'),
      mochi('What day?'),
      user('next Tuesday'),
      mochi('Any time?'),
    ]
    expect(buildFallbackCapture(history, '3pm')).toEqual({ text: 'dentist — next Tuesday, 3pm' })
  })

  it('a completed request (Mochi proposed operations) starts a new one', () => {
    const history = [
      user('buy milk'),
      mochi('Added milk to your list. Anything else?', [{ kind: 'addGroceryItem' }]),
    ]
    expect(buildFallbackCapture(history, 'call the plumber')).toEqual({ text: 'call the plumber' })
  })

  it('a Mochi statement (not a question) also closes the previous request', () => {
    const history = [user('hi'), mochi('Hi there!')]
    expect(buildFallbackCapture(history, 'water the plants')).toEqual({ text: 'water the plants' })
  })

  it('skips blank turns', () => {
    const history = [user('pay rent'), mochi('Due when?'), user('   ')]
    expect(buildFallbackCapture(history, '1st')).toEqual({ text: 'pay rent — 1st' })
  })
})
