// Locks in the mid-conversation fallback capture (P1.7): over the fair-use
// ceiling, Compose should get the still-open request, not just the last reply.
import { describe, expect, it } from 'vitest'
import { buildFallbackCapture, mochiRestEndsAt, type FallbackChatTurn } from '../src/logic/mochiFallback'

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

  it('a retried failed send is not duplicated', () => {
    const history = [user('call mom')] // failed attempt left unanswered
    expect(buildFallbackCapture(history, 'call mom')).toEqual({ text: 'call mom' })
    const midConvo = [user('call mom'), mochi('When?'), user('Friday')]
    expect(buildFallbackCapture(midConvo, 'Friday')).toEqual({ text: 'call mom — Friday' })
  })

  it('an explicit isFollowUp tag beats the "?" heuristic', () => {
    // toQuestion() turned a STATEMENT into "...?" — tagged false, so it closes the request.
    const statement = { role: 'assistant' as const, content: "You've got 2 things due today?", isFollowUp: false }
    expect(buildFallbackCapture([user("what's due today?"), statement], 'add call mom')).toEqual({
      text: 'add call mom',
    })
    const question = { role: 'assistant' as const, content: 'Got it', isFollowUp: true }
    expect(buildFallbackCapture([user('dentist'), question], 'Tuesday')).toEqual({ text: 'dentist — Tuesday' })
  })

  it('skips blank turns', () => {
    const history = [user('pay rent'), mochi('Due when?'), user('   ')]
    expect(buildFallbackCapture(history, '1st')).toEqual({ text: 'pay rent — 1st' })
  })
})

describe('mochiRestEndsAt (fair-use day reset)', () => {
  it('is the next 00:00 UTC', () => {
    expect(mochiRestEndsAt(new Date('2026-10-18T19:30:00Z')).toISOString()).toBe('2026-10-19T00:00:00.000Z')
    expect(mochiRestEndsAt(new Date('2026-10-18T00:00:00Z')).toISOString()).toBe('2026-10-19T00:00:00.000Z')
    expect(mochiRestEndsAt(new Date('2026-12-31T23:59:59Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
})
