/**
 * Refund-on-upstream-failure accounting: a reservation records exactly what
 * it charged (UsageCharge) and the refund helpers undo only that — never
 * below 0, never across a day/month rollover. quota.ts refundUsage wraps
 * these in a Firestore transaction.
 */
import { describe, expect, it } from 'vitest'
import {
  decideChatTurnFlat,
  decideChatTurnTier,
  decideFlatCall,
  refundAgentUsage,
  refundMochiUsage,
  refundableCharge,
  type AgentUsageData,
  type ConvRecord,
  type UsageCharge,
} from './chatQuota'
import type { MochiUsageDoc } from './mochiReservation'

const TODAY = '2026-10-18'
const TOMORROW = '2026-10-19'
const MONTH = '2026-10'

const usage = (over: Partial<AgentUsageData> = {}): AgentUsageData => ({
  date: TODAY,
  calls: 0,
  chatTurns: 0,
  chatConversations: 0,
  ceilingHit: false,
  ...over,
})
const conv = (id: string, t: number, over: Partial<ConvRecord> = {}): ConvRecord => ({
  id,
  t,
  u: t,
  h: 'h',
  n: 0,
  r: 0,
  ...over,
})
const mochi = (over: Partial<MochiUsageDoc> = {}): MochiUsageDoc => ({
  month: MONTH,
  monthCalls: 0,
  date: TODAY,
  dayCalls: 0,
  ...over,
})

describe('reservation charges', () => {
  it('flat conversation start charges a call + turn + conversation', () => {
    const d = decideChatTurnFlat(usage({ calls: 2 }), TODAY, true, 150)
    expect(d.charge).toEqual({ date: TODAY, calls: 1, chatTurns: 1, chatConversations: 1, mochi: null })
  })
  it('flat follow-up charges only the turn', () => {
    const d = decideChatTurnFlat(usage(), TODAY, false, 150)
    expect(d.charge).toEqual({ date: TODAY, calls: 0, chatTurns: 1, chatConversations: 0, mochi: null })
  })
  it('a rejected reservation charges nothing', () => {
    expect(decideChatTurnFlat(usage({ calls: 150 }), TODAY, true, 150).charge).toBeNull()
    expect(decideFlatCall(usage({ calls: 150 }), TODAY, 150).charge).toBeNull()
  })
  it('tier conversation start records the mochi period', () => {
    const d = decideChatTurnTier('premium', null, null, TODAY, MONTH, true)
    expect(d.charge).toEqual({
      date: TODAY,
      calls: 0,
      chatTurns: 1,
      chatConversations: 1,
      mochi: { date: TODAY, month: MONTH },
    })
    expect(decideChatTurnTier('premium', null, null, TODAY, MONTH, false).charge?.mochi).toBeNull()
  })
  it('aiInfer flat call charges one call', () => {
    expect(decideFlatCall(null, TODAY, 150).charge).toEqual({
      date: TODAY,
      calls: 1,
      chatTurns: 0,
      chatConversations: 0,
      mochi: null,
    })
  })
})

describe('refundAgentUsage', () => {
  it('reserve then refund restores the original counters', () => {
    const before = usage({ calls: 4, chatTurns: 7, chatConversations: 3, ceilingHit: true })
    const d = decideChatTurnFlat(before, TODAY, true, 150)
    expect(refundAgentUsage(d.nextAgentUsage, d.charge!)).toEqual(before)
  })
  it('never goes below 0', () => {
    const charge: UsageCharge = { date: TODAY, calls: 1, chatTurns: 1, chatConversations: 1, mochi: null }
    expect(refundAgentUsage(usage(), charge)).toEqual(usage())
  })
  it('nothing to refund after a day rollover, with no doc, or for an empty charge', () => {
    const charge: UsageCharge = { date: TODAY, calls: 1, chatTurns: 1, chatConversations: 1, mochi: null }
    expect(refundAgentUsage(usage({ date: TOMORROW, calls: 5 }), charge)).toBeNull()
    expect(refundAgentUsage(null, charge)).toBeNull()
    expect(
      refundAgentUsage(usage({ calls: 3 }), { ...charge, calls: 0, chatTurns: 0, chatConversations: 0 }),
    ).toBeNull()
  })
  it('forgets the conversation a start minted — same day with the counters, and alone after a rollover', () => {
    const minted = conv('MMMMMMMMMMMMMMMM', 2)
    const other = conv('OOOOOOOOOOOOOOOO', 1)
    const charge: UsageCharge = { date: TODAY, calls: 1, chatTurns: 1, chatConversations: 1, mochi: null, convId: minted.id }
    expect(refundAgentUsage(usage({ calls: 1, chatTurns: 1, chatConversations: 1, convs: [other, minted] }), charge)).toEqual(
      usage({ convs: [other] }),
    )
    // Next day: counters already reset (untouched), the record still goes.
    expect(refundAgentUsage(usage({ date: TOMORROW, calls: 4, convs: [other, minted] }), charge)).toEqual(
      usage({ date: TOMORROW, calls: 4, convs: [other] }),
    )
    // Nothing to forget and nothing to refund after a rollover → no write.
    expect(refundAgentUsage(usage({ date: TOMORROW, convs: [other] }), charge)).toBeNull()
  })
  it('a failed start some RETRY is riding on (r > 0) keeps its record AND its slot — only the turn is refunded', () => {
    // Request A minted M; its client timed out and retry B reused M (r=1) and
    // may hold a signed reply; then A's upstream call failed → A refunds.
    // B's conversation continues on A's slot, so the slot is NOT given back.
    const reused = conv('MMMMMMMMMMMMMMMM', 2, { r: 1 })
    const charge: UsageCharge = { date: TODAY, calls: 1, chatTurns: 1, chatConversations: 1, mochi: { date: TODAY, month: MONTH }, convId: reused.id }
    const before = usage({ calls: 1, chatTurns: 2, chatConversations: 1, convs: [reused] })
    const out = refundAgentUsage(before, charge)
    expect(out).toEqual(usage({ calls: 1, chatTurns: 1, chatConversations: 1, convs: [reused] }))
    expect(refundableCharge(before, charge)).toEqual({ ...charge, calls: 0, chatConversations: 0, mochi: null })
    // No retry riding on it (r=0) or record gone → the charge as recorded.
    expect(refundableCharge(usage({ convs: [{ ...reused, r: 0 }] }), charge)).toBe(charge)
    expect(refundableCharge(usage(), charge)).toBe(charge)
    expect(refundableCharge(null, charge)).toBe(charge)
  })
  it('a START RETRY refund gives back its reuse (r − 1, never below 0), never a slot', () => {
    const rec = conv('MMMMMMMMMMMMMMMM', 2, { r: 2, n: 3 })
    const charge: UsageCharge = { date: TODAY, calls: 0, chatTurns: 1, chatConversations: 0, mochi: null, reusedConvId: rec.id }
    expect(refundAgentUsage(usage({ calls: 1, chatTurns: 3, chatConversations: 1, convs: [rec] }), charge)).toEqual(
      usage({ calls: 1, chatTurns: 2, chatConversations: 1, convs: [{ ...rec, r: 1 }] }),
    )
    const zero = conv('MMMMMMMMMMMMMMMM', 2)
    expect(refundAgentUsage(usage({ chatTurns: 1, convs: [zero] }), charge)?.convs).toEqual([zero])
    // Across a rollover the record still gets its reuse back.
    expect(refundAgentUsage(usage({ date: TOMORROW, convs: [rec] }), charge)).toEqual(
      usage({ date: TOMORROW, convs: [{ ...rec, r: 1 }] }),
    )
  })
  it('each conversation field refunds ITS OWN record (precedence: minted, then reused, then follow-up)', () => {
    const a = conv('AAAAAAAAAAAAAAAA', 1, { r: 0 })
    const b = conv('BBBBBBBBBBBBBBBB', 2, { n: 3 })
    const minted: UsageCharge = { date: TODAY, calls: 1, chatTurns: 1, chatConversations: 1, mochi: null, convId: a.id, followUpConvId: b.id }
    expect(refundAgentUsage(usage({ calls: 1, chatTurns: 2, chatConversations: 1, convs: [a, b] }), minted)?.convs).toEqual([b])
    const ar = { ...a, r: 1 }
    const reused: UsageCharge = { date: TODAY, calls: 0, chatTurns: 1, chatConversations: 0, mochi: null, reusedConvId: ar.id, followUpConvId: b.id }
    expect(refundAgentUsage(usage({ chatTurns: 2, convs: [ar, b] }), reused)?.convs).toEqual([{ ...ar, r: 0 }, b])
  })
  it('a FOLLOW-UP refund gives back its per-conversation turn (never below 0)', () => {
    const live = conv('LLLLLLLLLLLLLLLL', 2, { n: 5 })
    const charge: UsageCharge = { date: TODAY, calls: 0, chatTurns: 1, chatConversations: 0, mochi: null, followUpConvId: live.id }
    expect(refundAgentUsage(usage({ chatTurns: 3, convs: [live] }), charge)).toEqual(
      usage({ chatTurns: 2, convs: [{ ...live, n: 4 }] }),
    )
    // n already 0 / record gone: only the counters (and nothing at all after a rollover).
    const zero = conv('LLLLLLLLLLLLLLLL', 2)
    expect(refundAgentUsage(usage({ chatTurns: 3, convs: [zero] }), charge)?.convs).toEqual([zero])
    expect(refundAgentUsage(usage({ date: TOMORROW, convs: [zero] }), charge)).toBeNull()
    expect(refundAgentUsage(usage({ date: TOMORROW }), charge)).toBeNull()
  })
  it('keeps prev stats untouched', () => {
    const prev = { date: '2026-10-17', chatTurns: 2, chatConversations: 1, ceilingHit: false }
    const out = refundAgentUsage(usage({ calls: 1, prev }), {
      date: TODAY,
      calls: 1,
      chatTurns: 0,
      chatConversations: 0,
      mochi: null,
    })
    expect(out).toEqual(usage({ calls: 0, prev }))
  })
})

describe('refundMochiUsage', () => {
  const charge: UsageCharge = {
    date: TODAY,
    calls: 0,
    chatTurns: 1,
    chatConversations: 1,
    mochi: { date: TODAY, month: MONTH },
  }
  it('decrements both day and month counters in the same period', () => {
    expect(refundMochiUsage(mochi({ dayCalls: 2, monthCalls: 9 }), charge)).toEqual(
      mochi({ dayCalls: 1, monthCalls: 8 }),
    )
  })
  it('only the month counter after a day rollover', () => {
    expect(
      refundMochiUsage(mochi({ date: TOMORROW, dayCalls: 1, monthCalls: 9 }), charge),
    ).toEqual(mochi({ date: TOMORROW, dayCalls: 1, monthCalls: 8 }))
  })
  it('nothing after a month rollover / with no mochi charge / no doc; never below 0', () => {
    expect(
      refundMochiUsage(mochi({ date: '2026-11-01', month: '2026-11', dayCalls: 1, monthCalls: 1 }), charge),
    ).toBeNull()
    expect(refundMochiUsage(mochi({ dayCalls: 1 }), { ...charge, mochi: null })).toBeNull()
    expect(refundMochiUsage(null, charge)).toBeNull()
    expect(refundMochiUsage(mochi(), charge)).toEqual(mochi())
  })
})
