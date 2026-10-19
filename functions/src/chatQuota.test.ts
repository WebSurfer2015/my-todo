/**
 * Pure Mochi fair-use accounting: conversations (not turns) take a slot, the
 * per-day turn backstop bounds follow-ups, ceiling hits are persisted for the
 * roll-up, and day rollover keeps yesterday's stats in `prev`.
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_CHAT_TURNS_PER_DAY,
  MAX_CONV_RECORDS,
  MAX_TURNS_PER_CONVERSATION,
  chatDaysFromUsage,
  decideChatTurnFlat,
  decideChatTurnTier,
  decideFlatCall,
  isConversationStart,
  markCeilingHit,
  parseAgentUsage,
  rollAgentUsage,
  type AgentUsageData,
} from './chatQuota'
import { normalizeChatMessages } from './chatMessages'
import { TIER_LIMITS } from './entitlements'
import type { MochiUsageDoc } from './mochiReservation'

const TODAY = '2026-10-18'
const YDAY = '2026-10-17'
const MONTH = '2026-10'
const LIMIT = 150

const usage = (over: Partial<AgentUsageData> = {}): AgentUsageData => ({
  date: TODAY,
  calls: 0,
  chatTurns: 0,
  chatConversations: 0,
  ceilingHit: false,
  ...over,
})
const envelope = (data: unknown) => ({ value: JSON.stringify({ version: 1, data }) })

describe('isConversationStart', () => {
  it('is true only when the normalized window has exactly one user turn', () => {
    expect(isConversationStart(normalizeChatMessages([{ role: 'user', content: 'milk' }]))).toBe(true)
    expect(
      isConversationStart(
        normalizeChatMessages([
          { role: 'user', content: 'add milk' },
          { role: 'assistant', content: 'which store?' },
          { role: 'user', content: 'costco' },
        ]),
      ),
    ).toBe(false)
  })
  it('a long conversation windowed to 40 turns is still a follow-up', () => {
    const long = Array.from({ length: 81 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `t${i}`,
    }))
    expect(isConversationStart(normalizeChatMessages(long))).toBe(false)
  })
})

describe('decideChatTurnFlat — conversations take a flat slot, follow-ups are free', () => {
  it('a conversation start takes one slot and counts a conversation + turn', () => {
    const d = decideChatTurnFlat(null, TODAY, true, LIMIT)
    expect(d.allow).toBe(true)
    expect(d.nextAgentUsage).toEqual(usage({ calls: 1, chatTurns: 1, chatConversations: 1 }))
  })
  it('a follow-up does not take a slot, only counts a turn', () => {
    const d = decideChatTurnFlat(usage({ calls: 5, chatTurns: 3, chatConversations: 2 }), TODAY, false, LIMIT)
    expect(d.allow).toBe(true)
    expect(d.nextAgentUsage).toMatchObject({ calls: 5, chatTurns: 4, chatConversations: 2 })
  })
  it('a follow-up is still allowed when the flat cap is full', () => {
    const d = decideChatTurnFlat(usage({ calls: LIMIT }), TODAY, false, LIMIT)
    expect(d.allow).toBe(true)
  })
  it('a new conversation at the flat cap is rejected and marks the ceiling hit', () => {
    const d = decideChatTurnFlat(usage({ calls: LIMIT, chatTurns: 7 }), TODAY, true, LIMIT)
    expect(d.allow).toBe(false)
    expect(d.reason).toBe('daily')
    expect(d.nextAgentUsage).toMatchObject({ calls: LIMIT, chatTurns: 7, ceilingHit: true })
  })
  it('the turn backstop rejects any turn past MAX_CHAT_TURNS_PER_DAY', () => {
    const at = usage({ chatTurns: MAX_CHAT_TURNS_PER_DAY })
    for (const starts of [true, false]) {
      const d = decideChatTurnFlat(at, TODAY, starts, LIMIT)
      expect(d.allow).toBe(false)
      expect(d.reason).toBe('turns')
      expect(d.nextAgentUsage.ceilingHit).toBe(true)
    }
  })
  it('resets on a new UTC day, keeping yesterday in prev', () => {
    const d = decideChatTurnFlat(
      usage({ date: YDAY, calls: LIMIT, chatTurns: MAX_CHAT_TURNS_PER_DAY, chatConversations: 9, ceilingHit: true }),
      TODAY,
      true,
      LIMIT,
    )
    expect(d.allow).toBe(true)
    expect(d.nextAgentUsage).toEqual({
      ...usage({ calls: 1, chatTurns: 1, chatConversations: 1 }),
      prev: { date: YDAY, chatTurns: MAX_CHAT_TURNS_PER_DAY, chatConversations: 9, ceilingHit: true },
    })
  })
})

describe('decideChatTurnTier — tier ceiling counts conversations', () => {
  const mochi = (over: Partial<MochiUsageDoc> = {}): MochiUsageDoc => ({
    month: MONTH,
    monthCalls: 0,
    date: TODAY,
    dayCalls: 0,
    ...over,
  })
  const FREE_DAY = TIER_LIMITS.free.mochiDaily

  it('a conversation start bumps the tier usage; flat calls untouched', () => {
    const d = decideChatTurnTier('free', null, usage({ calls: 4 }), TODAY, MONTH, true)
    expect(d.allow).toBe(true)
    expect(d.nextMochiUsage).toEqual(mochi({ monthCalls: 1, dayCalls: 1 }))
    expect(d.nextAgentUsage).toMatchObject({ calls: 4, chatTurns: 1, chatConversations: 1 })
  })
  it('follow-ups are free even at the tier ceiling', () => {
    const d = decideChatTurnTier('free', mochi({ dayCalls: FREE_DAY, monthCalls: FREE_DAY }), null, TODAY, MONTH, false)
    expect(d.allow).toBe(true)
    expect(d.nextMochiUsage).toBeNull()
    expect(d.nextAgentUsage).toMatchObject({ chatTurns: 1, chatConversations: 0 })
  })
  it('a new conversation past the daily ceiling is rejected + marked', () => {
    const d = decideChatTurnTier('free', mochi({ dayCalls: FREE_DAY, monthCalls: FREE_DAY }), null, TODAY, MONTH, true)
    expect(d.allow).toBe(false)
    expect(d.reason).toBe('daily')
    expect(d.nextMochiUsage).toBeNull()
    expect(d.nextAgentUsage.ceilingHit).toBe(true)
  })
  it('monthly ceiling reports "monthly"', () => {
    const m = TIER_LIMITS.free.mochiMonthly
    const d = decideChatTurnTier('free', mochi({ dayCalls: 0, monthCalls: m }), null, TODAY, MONTH, true)
    expect(d.reason).toBe('monthly')
  })
  it('the turn backstop applies on the tier path too (premium included)', () => {
    const d = decideChatTurnTier('premium', null, usage({ chatTurns: MAX_CHAT_TURNS_PER_DAY }), TODAY, MONTH, false)
    expect(d.allow).toBe(false)
    expect(d.reason).toBe('turns')
  })
})

describe('decideFlatCall (aiInfer, per call) preserves Mochi stats', () => {
  it('bumps calls only', () => {
    const d = decideFlatCall(usage({ calls: 2, chatTurns: 5, chatConversations: 1 }), TODAY, LIMIT)
    expect(d.allow).toBe(true)
    expect(d.next).toEqual(usage({ calls: 3, chatTurns: 5, chatConversations: 1 }))
  })
  it('rejects at the limit', () => {
    expect(decideFlatCall(usage({ calls: LIMIT }), TODAY, LIMIT).allow).toBe(false)
  })
})

describe('rollAgentUsage / markCeilingHit', () => {
  it('keeps an older prev when the stale day had no Mochi activity', () => {
    const prev = { date: '2026-10-10', chatTurns: 2, chatConversations: 1, ceilingHit: false }
    const r = rollAgentUsage(usage({ date: YDAY, calls: 9, prev }), TODAY)
    expect(r).toEqual(usage({ prev }))
  })
  it('carries conversation records across a UTC rollover (rolling list)', () => {
    const convs = [{ id: 'AAAAAAAAAAAAAAAA', t: 1, u: 1, h: 'h', n: 0, r: 0 }]
    expect(rollAgentUsage(usage({ date: YDAY, convs }), TODAY).convs).toEqual(convs)
  })
  it('markCeilingHit sets today\'s flag', () => {
    expect(markCeilingHit(null, TODAY)).toEqual(usage({ ceilingHit: true }))
  })
})

describe('parseAgentUsage', () => {
  it('decodes legacy {date, calls} docs with zeroed chat counters', () => {
    expect(parseAgentUsage(envelope({ date: TODAY, calls: 3 }))).toEqual(usage({ calls: 3 }))
  })
  it('round-trips the full shape, sanitizing numbers', () => {
    const full = { ...usage({ calls: 2.7, chatTurns: -1, chatConversations: 4 }), prev: { date: YDAY, chatTurns: 6, chatConversations: 2, ceilingHit: true } }
    expect(parseAgentUsage(envelope(full))).toEqual({
      ...usage({ calls: 2, chatTurns: 0, chatConversations: 4 }),
      prev: { date: YDAY, chatTurns: 6, chatConversations: 2, ceilingHit: true },
    })
  })
  it('parses conversation records, dropping malformed ones and keeping the last MAX_CONV_RECORDS (use order)', () => {
    const good = { id: 'AAAAAAAAAAAAAAAA', t: 5, u: 9, h: 'hash', n: 2, r: 1 }
    const parsed = parseAgentUsage(
      envelope({
        ...usage(),
        convs: [
          good,
          { id: 'short', t: 1, u: 1, h: 'x', n: 0, r: 0 },
          { id: 'BBBBBBBBBBBBBBBB', t: 'x', u: 1, h: 'x', n: 0, r: 0 },
          { id: 'DDDDDDDDDDDDDDDD', t: 1, h: 'x', n: 0, r: 0 }, // no last-use
          { id: 'CCCCCCCCCCCCCCCC', t: 1, u: 1 },
          null,
          7,
        ],
      }),
    )
    expect(parsed?.convs).toEqual([good])
    const many = Array.from({ length: MAX_CONV_RECORDS + 10 }, (_, i) => ({ id: `C${String(i).padStart(15, '0')}`, t: i, u: i, h: 'h', n: 0, r: 0 }))
    const capped = parseAgentUsage(envelope({ ...usage(), convs: many }))?.convs
    expect(capped).toHaveLength(MAX_CONV_RECORDS)
    expect(capped?.[0].t).toBe(10)
    expect(parseAgentUsage(envelope({ ...usage(), convs: 'nope' }))?.convs).toBeUndefined()
  })
  it('junk counts fail closed: a bad follow-up count reads as the cap, a bad reuse count as 0; fractions floor', () => {
    const base = { id: 'AAAAAAAAAAAAAAAA', t: 1, u: 1, h: 'h' }
    const out = parseAgentUsage(
      envelope({ ...usage(), convs: [{ ...base, n: -1, r: 'x' }, { ...base, n: 'x', r: -2 }, { ...base, n: 2.9, r: 1.5 }] }),
    )?.convs
    expect(out?.map((c) => [c.n, c.r])).toEqual([
      [MAX_TURNS_PER_CONVERSATION, 0],
      [MAX_TURNS_PER_CONVERSATION, 0],
      [2, 1],
    ])
  })
  it('null on junk', () => {
    expect(parseAgentUsage(null)).toBeNull()
    expect(parseAgentUsage({ value: 'nope' })).toBeNull()
    expect(parseAgentUsage(envelope({ date: TODAY }))).toBeNull()
  })
})

describe('chatDaysFromUsage', () => {
  it('returns today (if active) and prev', () => {
    const u = usage({ chatTurns: 3, chatConversations: 1, prev: { date: YDAY, chatTurns: 1, chatConversations: 1, ceilingHit: false } })
    expect(chatDaysFromUsage(u).map((d) => d.date)).toEqual([TODAY, YDAY])
  })
  it('omits an inactive today; a ceiling hit alone counts as activity', () => {
    expect(chatDaysFromUsage(usage({ calls: 9 }))).toEqual([])
    expect(chatDaysFromUsage(usage({ ceilingHit: true }))).toHaveLength(1)
    expect(chatDaysFromUsage(null)).toEqual([])
  })
})
