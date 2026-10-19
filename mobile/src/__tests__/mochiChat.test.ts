/**
 * Pure Mochi chat helpers: superseded proposals (a newer Mochi turn replaces
 * an unresolved one), the pick-list truncation note, and the per-account
 * resting window + its reset-time label.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { pickMatchHeader, supersededProposalTurns } from '../features/mochi/chatTurns'
import {
  __resetForTests,
  clearMochiRest,
  markMochiResting,
  mochiRestLabel,
  mochiRestUntil,
  suggestStepsRestingText,
} from '../features/mochi/mochiRest'
import { mochiRestEndsAt } from '../../../core/src/logic/mochiFallback'

const op = { kind: 'markDone', args: { todoId: 'a' } } as const
const user = { role: 'user' as const }
const proposal = { role: 'assistant' as const, operations: [op], awaitingConfirmation: true }
const question = { role: 'assistant' as const }

describe('supersededProposalTurns', () => {
  it('the latest proposal stays actionable', () => {
    expect([...supersededProposalTurns([user, proposal], {})]).toEqual([])
  })

  it('an unresolved proposal is superseded once a newer assistant turn arrives', () => {
    expect([...supersededProposalTurns([user, proposal, user, question], {})]).toEqual([1])
    expect([...supersededProposalTurns([user, proposal, user, proposal], {})]).toEqual([1])
  })

  it('resolved (applied / declined) proposals are never marked', () => {
    expect([...supersededProposalTurns([user, proposal, user, proposal], { 1: 'applied' })]).toEqual([])
  })

  it('turns that are not awaiting confirmation are not proposals', () => {
    const info = { role: 'assistant' as const, operations: [op], awaitingConfirmation: false }
    expect([...supersededProposalTurns([user, info, user, question], {})]).toEqual([])
  })

  it('a newer USER turn alone does not supersede (Mochi hasn\'t answered yet)', () => {
    expect([...supersededProposalTurns([user, proposal, user], {})]).toEqual([])
  })
})

describe('pickMatchHeader', () => {
  it('one consistent line when the list was cut short (total first, then what shows)', () => {
    expect(pickMatchHeader(20, 37, 'milk')).toBe('37 match "milk" · showing 20 — say more to narrow it')
    expect(pickMatchHeader(10, 23)).toBe('23 matches · showing 10 — say more to narrow it')
  })
  it('just the count when every match is listed (or the server did not say)', () => {
    expect(pickMatchHeader(20, 20, 'milk')).toBe('20 match "milk"')
    expect(pickMatchHeader(3, undefined)).toBe('3 matches')
    expect(pickMatchHeader(1, undefined)).toBe('1 match')
  })
})

describe('mochiRest', () => {
  afterEach(() => clearMochiRest())

  it('is keyed by uid — an account switch never inherits the rest; __resetForTests clears it', () => {
    const now = new Date('2026-10-19T15:00:00Z')
    markMochiResting('uid-a', now)
    expect(mochiRestUntil('uid-b', now.valueOf())).toBe(0)
    expect(mochiRestUntil(null, now.valueOf())).toBe(0)
    expect(mochiRestUntil('uid-a', now.valueOf())).toBeGreaterThan(0)
    __resetForTests()
    expect(mochiRestUntil('uid-a', now.valueOf())).toBe(0)
  })

  it('rests until the next 00:00 UTC, for that account only', () => {
    const now = new Date('2026-10-19T15:00:00Z')
    const until = markMochiResting('uid-a', now)
    expect(until).toBe(mochiRestEndsAt(now).valueOf())
    expect(mochiRestUntil('uid-a', now.valueOf())).toBe(until)
    expect(mochiRestUntil('uid-b', now.valueOf())).toBe(0)
    expect(mochiRestUntil(null, now.valueOf())).toBe(0)
  })

  it('wakes at the reset', () => {
    const now = new Date('2026-10-19T15:00:00Z')
    const until = markMochiResting('uid-a', now)
    expect(mochiRestUntil('uid-a', until)).toBe(0)
  })

  it('sign-out (clear) forgets it', () => {
    markMochiResting('uid-a')
    clearMochiRest()
    expect(mochiRestUntil('uid-a')).toBe(0)
  })

  it('no uid → nothing recorded, but the reset time is still returned', () => {
    const now = new Date('2026-10-19T15:00:00Z')
    expect(markMochiResting(null, now)).toBe(mochiRestEndsAt(now).valueOf())
    expect(mochiRestUntil('uid-a', now.valueOf())).toBe(0)
  })

  it('label: time today, else "tomorrow at …"', () => {
    const now = new Date(2026, 9, 19, 9, 0)
    const later = new Date(2026, 9, 19, 20, 0).valueOf()
    const nextDay = new Date(2026, 9, 20, 1, 0).valueOf()
    expect(mochiRestLabel(later, now)).not.toMatch(/tomorrow/)
    expect(mochiRestLabel(later, now)).toMatch(/8/)
    expect(mochiRestLabel(nextDay, now)).toMatch(/^tomorrow at /)
    expect(suggestStepsRestingText(later, now)).toBe(
      `Mochi's resting until ${mochiRestLabel(later, now)} — you can add steps yourself.`,
    )
  })
})
