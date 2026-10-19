/**
 * quota.ts I/O wrappers against an in-memory Firestore fake (no emulator):
 * reservations return their charge, refundUsage gives exactly that back in
 * one transaction, and refund failures never mask the caller's error.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>()
  const state = { failTx: false }
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
    doc: (path: string) => ({ path }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      if (h.state.failTx) throw new Error('ABORTED')
      return fn(h.tx)
    },
  }),
}))

import { DAILY_CALL_LIMIT, refundUsage, reserveChatTurn, reserveDailyCall } from './quota'
import { parseAgentUsage } from './chatQuota'

const AGENT = 'users/u1/state/agentUsage'
const MOCHI = 'users/u1/state/mochiUsage'
const today = () => new Date().toISOString().slice(0, 10)
const envelope = (data: unknown) => ({ value: JSON.stringify({ version: 1, data }), updatedAt: 1 })
const agentUsage = () => parseAgentUsage(h.store.get(AGENT))

beforeEach(() => {
  h.store.clear()
  h.state.failTx = false
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
