/**
 * quota.ts I/O wrappers against an in-memory Firestore fake (no emulator):
 * reservations return their charge, refundUsage gives exactly that back in
 * one transaction, and refund failures never mask the caller's error.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

beforeEach(() => {
  h.store.clear()
  h.state.failTx = false
  h.state.failProfileRead = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

describe('reserve → refund round trip', () => {
  it('a conversation start is charged, then fully refunded', async () => {
    const charge = await reserveChatTurn('u1', true)
    expect(charge).toMatchObject({ calls: 1, chatTurns: 1, chatConversations: 1, mochi: null })
    expect(agentUsage()).toMatchObject({ calls: 1, chatTurns: 1, chatConversations: 1 })
    await refundUsage('u1', charge)
    expect(agentUsage()).toMatchObject({ calls: 0, chatTurns: 0, chatConversations: 0 })
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
    await expect(reserveChatTurn('u1', true)).rejects.toMatchObject({ code: 'resource-exhausted' })
  })
  it('a transaction failure on reserve fails closed', async () => {
    h.state.failTx = true
    await expect(reserveChatTurn('u1', true)).rejects.toMatchObject({ code: 'internal' })
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
    const turns = await reserveChatTurn('u1', false).catch((e) => e)
    expect(turns).toMatchObject({ code: 'resource-exhausted', details: { reason: 'turns' } })
    expect(CHAT_TURNS_EXHAUSTED_DETAILS).toEqual({ reason: 'turns' })
    // …and the shared flat cap still has room: aiInfer is unaffected.
    await expect(reserveDailyCall('u1')).resolves.toMatchObject({ calls: 1 })

    h.store.set(AGENT, envelope({ date: today(), calls: DAILY_CALL_LIMIT }))
    const shared = await reserveChatTurn('u1', true).catch((e) => e)
    expect(shared).toMatchObject({ code: 'resource-exhausted' })
    expect(shared.details).toBeUndefined()
  })
  it('the tier path also flags the turn backstop', async () => {
    h.store.set(AGENT, envelope({ date: today(), calls: 0, chatTurns: MAX_CHAT_TURNS_PER_DAY }))
    await expect(reserveMochiRequest('u1', false)).rejects.toMatchObject({ details: { reason: 'turns' } })
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

  it('free user at the daily ceiling → resource-exhausted (no details), mochiUsage unchanged', async () => {
    h.store.set(MOCHI, atFreeDailyCeiling())
    const err = await reserveMochiRequest('u1', true).catch((e) => e)
    expect(err).toMatchObject({ code: 'resource-exhausted' })
    expect(err.details).toBeUndefined()
    expect(mochiUsage()).toMatchObject({ dayCalls: TIER_LIMITS.free.mochiDaily })
  })
  it('premium user over the FREE ceiling is allowed and mochiUsage is written', async () => {
    h.store.set(MOCHI, atFreeDailyCeiling())
    h.store.set(ENT, premium())
    const charge = await reserveMochiRequest('u1', true)
    expect(charge.mochi).toEqual({ date: d(), month: d().slice(0, 7) })
    expect(mochiUsage()).toMatchObject({ dayCalls: TIER_LIMITS.free.mochiDaily + 1 })
    expect(agentUsage()).toMatchObject({ chatTurns: 1, chatConversations: 1, calls: 0 })
  })
  it('a lapsed premium entitlement is treated as free', async () => {
    h.store.set(MOCHI, atFreeDailyCeiling())
    h.store.set(ENT, envelope({ tier: 'premium', validUntil: '2000-01-01T00:00:00.000Z' }))
    await expect(reserveMochiRequest('u1', true)).rejects.toMatchObject({ code: 'resource-exhausted' })
  })
  it('a follow-up does not touch mochiUsage', async () => {
    h.store.set(MOCHI, atFreeDailyCeiling())
    await expect(reserveMochiRequest('u1', false)).resolves.toMatchObject({ mochi: null, chatTurns: 1 })
  })
  it('a profile READ ERROR is NOT treated as comp (free ceiling still applies)', async () => {
    h.store.set(MOCHI, atFreeDailyCeiling())
    h.store.set(PROFILE, profileNamed('Ying', 'Qin'))
    h.state.failProfileRead = true
    await expect(reserveMochiRequest('u1', true)).rejects.toMatchObject({ code: 'resource-exhausted' })
  })
  it('comp user skips the tier ceiling (flat path) and mochiUsage is NOT written', async () => {
    h.store.set(MOCHI, atFreeDailyCeiling())
    h.store.set(PROFILE, profileNamed(' Ying ', 'QIN'))
    const before = h.store.get(MOCHI)
    const charge = await reserveMochiRequest('u1', true)
    expect(charge).toMatchObject({ calls: 1, mochi: null })
    expect(h.store.get(MOCHI)).toBe(before)
  })
  it('comp user still hits the flat cap, and mochiUsage is NOT written', async () => {
    h.store.set(PROFILE, profileNamed('ying', 'qin'))
    h.store.set(AGENT, envelope({ date: d(), calls: DAILY_CALL_LIMIT }))
    await expect(reserveMochiRequest('u1', true)).rejects.toMatchObject({ code: 'resource-exhausted' })
    expect(h.store.has(MOCHI)).toBe(false)
  })
})
