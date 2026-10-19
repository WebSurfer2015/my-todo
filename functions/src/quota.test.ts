/**
 * quota.ts I/O wrappers against an in-memory Firestore fake (no emulator):
 * reservations return their charge, refundUsage gives exactly that back in
 * one transaction, and refund failures never mask the caller's error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>()
  const state = { failTx: false, failProfileRead: false }
  const tx = {
    get: async (ref: { path: string }) => ({
      exists: store.has(ref.path),
      data: () => store.get(ref.path),
    }),
    set: (ref: { path: string }, data: Record<string, unknown>) => void store.set(ref.path, data),
  }
  return { store, state, tx }
})

vi.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: vi.fn(),
  firestore: () => ({
    doc: (path: string) => ({
      path,
      // Plain (non-transactional) read — used by the comp check (profile).
      get: async () => {
        if (h.state.failProfileRead) throw new Error('UNAVAILABLE')
        return { exists: h.store.has(path), data: () => h.store.get(path) }
      },
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      if (h.state.failTx) throw new Error('ABORTED')
      return fn(h.tx)
    },
  }),
}))

import {
  CHAT_TIER_EXHAUSTED_DETAILS,
  CHAT_TURNS_EXHAUSTED_DETAILS,
  DAILY_CALL_LIMIT,
  refundUsage,
  reserveChatTurn,
  reserveDailyCall,
  reserveMochiRequest,
} from './quota'
import { MAX_CHAT_TURNS_PER_DAY, parseAgentUsage } from './chatQuota'
import { TIER_LIMITS } from './entitlements'

const AGENT = 'users/u1/state/agentUsage'
const MOCHI = 'users/u1/state/mochiUsage'
const ENT = 'users/u1/state/entitlement'
const PROFILE = 'users/u1/state/profile'
const mochiUsage = () =>
  h.store.has(MOCHI) ? JSON.parse((h.store.get(MOCHI) as { value: string }).value).data : undefined
const today = () => new Date().toISOString().slice(0, 10)
const envelope = (data: unknown) => ({ value: JSON.stringify({ version: 1, data }), updatedAt: 1 })
const agentUsage = () => parseAgentUsage(h.store.get(AGENT))

/** A conversation-start claim; each call a distinct history (no retry de-dup). */
let seq = 0
const start = () => ({ claimedConvId: null, startHash: `start-${++seq}` })
/** A recorded conversation and a follow-up claim on it. */
const CONV = 'AAAAAAAAAAAAAAAA'
const CONV_REC = () => ({ id: CONV, t: Date.now() - 60_000, h: 'orig' })
const followUp = () => ({ claimedConvId: CONV, startHash: `fu-${++seq}` })

// Pinned clock (mid-day UTC): code and test both derive "today" from Date, so
// a run straddling UTC midnight can't flake.
const FIXED_NOW = new Date('2026-10-19T12:00:00.000Z')

afterEach(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FIXED_NOW)
  h.store.clear()
  h.state.failTx = false
  h.state.failProfileRead = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

describe('reserve → refund round trip', () => {
  it('a conversation start is charged, then fully refunded', async () => {
    const { charge, convId, startsConversation } = await reserveChatTurn('u1', start())
    expect(startsConversation).toBe(true)
    expect(charge).toMatchObject({ calls: 1, chatTurns: 1, chatConversations: 1, mochi: null, convId })
    expect(agentUsage()).toMatchObject({ calls: 1, chatTurns: 1, chatConversations: 1 })
    expect(agentUsage()?.convs?.map((c) => c.id)).toEqual([convId])
    await refundUsage('u1', charge)
    expect(agentUsage()).toMatchObject({ calls: 0, chatTurns: 0, chatConversations: 0 })
    // The minted conversation is forgotten too (no sig was ever issued for it).
    expect(agentUsage()?.convs).toBeUndefined()
  })
  it('aiInfer: a flat call is charged, then refunded', async () => {
    const charge = await reserveDailyCall('u1')
    expect(agentUsage()?.calls).toBe(1)
    await refundUsage('u1', charge)
    expect(agentUsage()?.calls).toBe(0)
  })
  it('over the cap → resource-exhausted, nothing charged', async () => {
    h.store.set(AGENT, envelope({ date: today(), calls: DAILY_CALL_LIMIT }))
    await expect(reserveDailyCall('u1')).rejects.toMatchObject({ code: 'resource-exhausted' })
    await expect(reserveChatTurn('u1', start())).rejects.toMatchObject({ code: 'resource-exhausted' })
    // A rejected start records no conversation.
    expect(agentUsage()?.convs).toBeUndefined()
  })
  it('a transaction failure on reserve fails closed', async () => {
    h.state.failTx = true
    await expect(reserveChatTurn('u1', start())).rejects.toMatchObject({ code: 'internal' })
    await expect(reserveDailyCall('u1')).rejects.toMatchObject({ code: 'internal' })
  })
})

describe('refundUsage', () => {
  it('also gives back the tier (mochiUsage) counters', async () => {
    const d = today()
    h.store.set(AGENT, envelope({ date: d, calls: 0, chatTurns: 1, chatConversations: 1 }))
    h.store.set(MOCHI, envelope({ date: d, month: d.slice(0, 7), dayCalls: 1, monthCalls: 4 }))
    await refundUsage('u1', {
      date: d,
      calls: 0,
      chatTurns: 1,
      chatConversations: 1,
      mochi: { date: d, month: d.slice(0, 7) },
    })
    const mochi = JSON.parse((h.store.get(MOCHI) as { value: string }).value).data
    expect(mochi).toMatchObject({ dayCalls: 0, monthCalls: 3 })
    expect(agentUsage()).toMatchObject({ chatTurns: 0, chatConversations: 0 })
  })
  it('after a day rollover there is nothing to refund (no write)', async () => {
    h.store.set(AGENT, envelope({ date: '2999-01-01', calls: 5 }))
    await refundUsage('u1', { date: '2026-01-01', calls: 1, chatTurns: 0, chatConversations: 0, mochi: null })
    expect(agentUsage()?.calls).toBe(5)
  })
  it('swallows its own failure (caller surfaces the original error)', async () => {
    h.state.failTx = true
    await expect(
      refundUsage('u1', { date: today(), calls: 1, chatTurns: 0, chatConversations: 0, mochi: null }),
    ).resolves.toBeUndefined()
  })
})

describe('chat turn backstop → distinguishable resource-exhausted', () => {
  it("the chat-only turn cap carries details {reason:'turns'}; the shared cap carries none", async () => {
    h.store.set(AGENT, envelope({ date: today(), calls: 0, chatTurns: MAX_CHAT_TURNS_PER_DAY }))
    const turns = await reserveChatTurn('u1', followUp()).catch((e) => e)
    expect(turns).toMatchObject({ code: 'resource-exhausted', details: { reason: 'turns' } })
    expect(CHAT_TURNS_EXHAUSTED_DETAILS).toEqual({ reason: 'turns' })
    // …and the shared flat cap still has room: aiInfer is unaffected.
    await expect(reserveDailyCall('u1')).resolves.toMatchObject({ calls: 1 })

    h.store.set(AGENT, envelope({ date: today(), calls: DAILY_CALL_LIMIT }))
    const shared = await reserveChatTurn('u1', start()).catch((e) => e)
    expect(shared).toMatchObject({ code: 'resource-exhausted' })
    expect(shared.details).toBeUndefined()
  })
  it('the tier path also flags the turn backstop', async () => {
    h.store.set(AGENT, envelope({ date: today(), calls: 0, chatTurns: MAX_CHAT_TURNS_PER_DAY }))
    await expect(reserveMochiRequest('u1', followUp())).rejects.toMatchObject({ details: { reason: 'turns' } })
  })
})

describe('reserveMochiRequest — tier + comp paths', () => {
  const d = () => today()
  const atFreeDailyCeiling = () =>
    envelope({
      date: d(),
      month: d().slice(0, 7),
      dayCalls: TIER_LIMITS.free.mochiDaily,
      monthCalls: TIER_LIMITS.free.mochiDaily,
    })
  const premium = () =>
    envelope({ tier: 'premium', validUntil: new Date(Date.now() + 86_400_000).toISOString() })
  const profileNamed = (firstName: string, lastName: string) => envelope({ firstName, lastName })

  it("free user at the daily ceiling → resource-exhausted with details {reason:'tier'} (chat-only), mochiUsage unchanged", async () => {
    h.store.set(MOCHI, atFreeDailyCeiling())
    const err = await reserveMochiRequest('u1', start()).catch((e) => e)
    expect(err).toMatchObject({ code: 'resource-exhausted', details: { reason: 'tier' } })
    expect(CHAT_TIER_EXHAUSTED_DETAILS).toEqual({ reason: 'tier' })
    // The tier ceiling is Mochi-only: aiInfer's flat counter still has room.
    await expect(reserveDailyCall('u1')).resolves.toMatchObject({ calls: 1 })
    expect(mochiUsage()).toMatchObject({ dayCalls: TIER_LIMITS.free.mochiDaily })
  })
  it('premium user over the FREE ceiling is allowed and mochiUsage is written', async () => {
    h.store.set(MOCHI, atFreeDailyCeiling())
    h.store.set(ENT, premium())
    const { charge } = await reserveMochiRequest('u1', start())
    expect(charge.mochi).toEqual({ date: d(), month: d().slice(0, 7) })
    expect(mochiUsage()).toMatchObject({ dayCalls: TIER_LIMITS.free.mochiDaily + 1 })
    expect(agentUsage()).toMatchObject({ chatTurns: 1, chatConversations: 1, calls: 0 })
  })
  it('a lapsed premium entitlement is treated as free', async () => {
    h.store.set(MOCHI, atFreeDailyCeiling())
    h.store.set(ENT, envelope({ tier: 'premium', validUntil: '2000-01-01T00:00:00.000Z' }))
    await expect(reserveMochiRequest('u1', start())).rejects.toMatchObject({ code: 'resource-exhausted' })
  })
  it('an unknown tier string ("pro") gets the FREE decision (not a crash / internal)', async () => {
    h.store.set(MOCHI, atFreeDailyCeiling())
    h.store.set(ENT, envelope({ tier: 'pro', validUntil: new Date(Date.now() + 86_400_000).toISOString() }))
    await expect(reserveMochiRequest('u1', start())).rejects.toMatchObject({
      code: 'resource-exhausted',
      details: { reason: 'tier' },
    })
    h.store.delete(MOCHI)
    const { charge } = await reserveMochiRequest('u1', start())
    expect(mochiUsage()).toMatchObject({ dayCalls: 1, monthCalls: 1 })
    expect(charge.mochi).not.toBeNull()
  })
  it('a follow-up of a RECORDED conversation does not touch mochiUsage', async () => {
    h.store.set(MOCHI, atFreeDailyCeiling())
    h.store.set(AGENT, envelope({ date: d(), calls: 0, convs: [CONV_REC()] }))
    await expect(reserveMochiRequest('u1', followUp())).resolves.toMatchObject({
      convId: CONV,
      startsConversation: false,
      charge: { mochi: null, chatTurns: 1, chatConversations: 0 },
    })
  })
  it('a follow-up claim on an UNRECORDED convId is a start → hits the free ceiling', async () => {
    h.store.set(MOCHI, atFreeDailyCeiling())
    await expect(reserveMochiRequest('u1', followUp())).rejects.toMatchObject({ details: { reason: 'tier' } })
  })
  it('a profile READ ERROR is NOT treated as comp (free ceiling still applies)', async () => {
    h.store.set(MOCHI, atFreeDailyCeiling())
    h.store.set(PROFILE, profileNamed('Ying', 'Qin'))
    h.state.failProfileRead = true
    await expect(reserveMochiRequest('u1', start())).rejects.toMatchObject({ code: 'resource-exhausted' })
  })
  it('comp user skips the tier ceiling (flat path) and mochiUsage is NOT written', async () => {
    h.store.set(MOCHI, atFreeDailyCeiling())
    h.store.set(PROFILE, profileNamed(' Ying ', 'QIN'))
    const before = h.store.get(MOCHI)
    const { charge } = await reserveMochiRequest('u1', start())
    expect(charge).toMatchObject({ calls: 1, mochi: null })
    expect(h.store.get(MOCHI)).toBe(before)
  })
  it('comp user still hits the flat cap, and mochiUsage is NOT written', async () => {
    h.store.set(PROFILE, profileNamed('ying', 'qin'))
    h.store.set(AGENT, envelope({ date: d(), calls: DAILY_CALL_LIMIT }))
    const err = await reserveMochiRequest('u1', start()).catch((e) => e)
    expect(err).toMatchObject({ code: 'resource-exhausted' })
    // The comp path is the SHARED flat cap → no details (pause all AI).
    expect(err.details).toBeUndefined()
    expect(h.store.has(MOCHI)).toBe(false)
  })
})

describe('conversation ids (reservation transaction)', () => {
  it('a start mints + records a convId; a follow-up on it is free; the record survives a UTC rollover', async () => {
    const first = await reserveChatTurn('u1', start())
    expect(first.convId).toMatch(/^[A-Za-z0-9_-]{16}$/)
    const fu = await reserveChatTurn('u1', { claimedConvId: first.convId, startHash: 'x' })
    expect(fu).toMatchObject({ convId: first.convId, startsConversation: false, charge: { calls: 0, chatConversations: 0 } })
    expect(fu.charge.convId).toBeUndefined()
    expect(agentUsage()).toMatchObject({ calls: 1, chatTurns: 2, chatConversations: 1 })
    // Next UTC day, 30 min later: counters reset, the conversation continues free.
    vi.setSystemTime(new Date('2026-10-20T00:10:00.000Z'))
    h.store.set(
      AGENT,
      envelope({ date: '2026-10-19', calls: 1, chatTurns: 2, chatConversations: 1, convs: [{ id: first.convId, t: Date.now() - 30 * 60_000, h: 'x' }] }),
    )
    const next = await reserveChatTurn('u1', { claimedConvId: first.convId, startHash: 'y' })
    expect(next.startsConversation).toBe(false)
    expect(agentUsage()).toMatchObject({ date: '2026-10-20', calls: 0, chatTurns: 1, chatConversations: 0 })
  })
  it('a start RETRY (same history within 2 min) reuses the convId without a second slot', async () => {
    const claim = { claimedConvId: null, startHash: 'same-history' }
    const a = await reserveChatTurn('u1', claim)
    vi.setSystemTime(new Date(FIXED_NOW.getTime() + 90_000))
    const b = await reserveChatTurn('u1', claim)
    expect(b).toMatchObject({ convId: a.convId, startsConversation: false })
    expect(agentUsage()).toMatchObject({ calls: 1, chatConversations: 1, chatTurns: 2 })
    // Past the window it's a genuinely new conversation.
    vi.setSystemTime(new Date(FIXED_NOW.getTime() + 121_000))
    const c = await reserveChatTurn('u1', claim)
    expect(c.startsConversation).toBe(true)
    expect(c.convId).not.toBe(a.convId)
  })
  it('a REFUNDED start is forgotten, so its retry takes a (new) slot', async () => {
    const claim = { claimedConvId: null, startHash: 'failed-start' }
    const a = await reserveChatTurn('u1', claim)
    await refundUsage('u1', a.charge)
    const b = await reserveChatTurn('u1', claim)
    expect(b.startsConversation).toBe(true)
    expect(b.convId).not.toBe(a.convId)
    expect(agentUsage()).toMatchObject({ calls: 1, chatConversations: 1 })
  })
})
