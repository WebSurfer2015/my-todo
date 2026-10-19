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
  type AgentUsageData,
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
