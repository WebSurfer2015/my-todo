/**
 * Pure Mochi chat helpers: superseded proposals (a newer Mochi turn replaces
 * an unresolved one), the pick-list truncation note, and the per-account
 * resting window + its reset-time label.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { pickTruncationNote, supersededProposalTurns } from '../features/mochi/chatTurns'
import {
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

describe('pickTruncationNote', () => {
  it('only when more matched than are shown', () => {
    expect(pickTruncationNote(10, 23)).toBe('Showing 10 of 23 — say more to narrow it')
    expect(pickTruncationNote(10, 10)).toBeNull()
    expect(pickTruncationNote(10, undefined)).toBeNull()
  })
})

describe('mochiRest', () => {
  afterEach(() => clearMochiRest())

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
