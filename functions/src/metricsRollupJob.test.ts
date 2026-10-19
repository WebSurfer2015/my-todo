/**
 * metricsRollupJob against an in-memory Firestore/Auth fake (no emulator):
 * the roll-up reads each user's signals + agentUsage, and the same pass is the
 * daily clean-up of expired Mochi conversation records (docs/PRIVACY.md) —
 * conditional on the doc's update time, so a live write is never clobbered.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  /** path → { data, version } — `version` plays the doc's updateTime. */
  const store = new Map<string, { data: Record<string, unknown>; version: number }>()
  const state = {
    users: [] as { uid: string; metadata: { creationTime: string } }[],
    /** Called between the read and the pruning write (simulate a live write). */
    beforeUpdate: null as null | ((path: string) => void),
    failUpdate: false,
  }
  let clock = 0
  const put = (path: string, data: Record<string, unknown>) =>
    void store.set(path, { data, version: ++clock })
  const ref = (path: string) => ({
    path,
    update: async (data: Record<string, unknown>, pre?: { lastUpdateTime?: number }) => {
      state.beforeUpdate?.(path)
      if (state.failUpdate) throw new Error('UNAVAILABLE')
      const cur = store.get(path)
      if (!cur) throw new Error('NOT_FOUND')
      if (pre?.lastUpdateTime !== undefined && pre.lastUpdateTime !== cur.version) {
        throw new Error('FAILED_PRECONDITION')
      }
      put(path, { ...cur.data, ...data })
    },
  })
  const snap = (path: string) => {
    const cur = store.get(path)
    return {
      ref: ref(path),
      exists: !!cur,
      updateTime: cur?.version,
      data: () => cur?.data,
    }
  }
  return { store, state, put, ref, snap }
})

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (opts: unknown, handler: () => Promise<void>) => Object.assign(handler, { __opts: opts }),
}))
vi.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: vi.fn(),
  auth: () => ({
    listUsers: async (_max: number, token?: string) =>
      token
        ? { users: h.state.users.slice(1), pageToken: undefined }
        : { users: h.state.users.slice(0, 1), pageToken: h.state.users.length > 1 ? 'p2' : undefined },
  }),
  firestore: () => ({
    doc: (path: string) => ({
      ...h.ref(path),
      set: async (data: Record<string, unknown>) => h.put(path, data),
    }),
    getAll: async (...refs: { path: string }[]) => refs.map((r) => h.snap(r.path)),
  }),
}))

import { collectRollupUsers, metricsRollup, pruneUsageSnapshot, type PruneStats } from './metricsRollupJob'
import { CONV_RECORD_TTL_MS, parseAgentUsage } from './chatQuota'

const NOW = new Date('2026-10-19T12:00:00.000Z').getTime()
const envelope = (data: unknown) => ({ value: JSON.stringify({ version: 1, data }), updatedAt: 1 })
const rec = (id: string, ageMs: number) => ({ id, t: NOW - ageMs, u: NOW - ageMs, h: 'hash', n: 1, r: 0 })
const STALE = rec('SSSSSSSSSSSSSSSS', CONV_RECORD_TTL_MS + 60_000)
const FRESH = rec('FFFFFFFFFFFFFFFF', 60_000)
const usageDoc = (convs: unknown[]) =>
  envelope({ date: '2026-10-18', calls: 2, chatTurns: 3, chatConversations: 2, ceilingHit: false, convs })
const usageOf = (uid: string) => parseAgentUsage(h.store.get(`users/${uid}/state/agentUsage`)?.data)
const user = (uid: string) => ({ uid, metadata: { creationTime: '2026-10-01T00:00:00Z' } })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  h.store.clear()
  h.state.users = []
  h.state.beforeUpdate = null
  h.state.failUpdate = false
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
})

describe('daily conversation-record clean-up', () => {
  it('removes only expired records; counters and live records untouched', async () => {
    h.state.users = [user('u1'), user('u2')]
    h.put('users/u1/state/agentUsage', usageDoc([STALE, FRESH]))
    h.put('users/u2/state/agentUsage', usageDoc([STALE]))
    const prune: PruneStats = { candidates: 0, pruned: 0 }
    await collectRollupUsers(prune, NOW)
    expect(prune).toEqual({ candidates: 2, pruned: 2 })
    expect(usageOf('u1')).toMatchObject({ calls: 2, chatTurns: 3, chatConversations: 2, convs: [FRESH] })
    // All expired → the list is dropped entirely (with every hash).
    expect(usageOf('u2')?.convs).toBeUndefined()
    expect(h.store.get('users/u2/state/agentUsage')?.data.value).not.toContain('hash')
    expect(usageOf('u2')).toMatchObject({ calls: 2, chatTurns: 3 })
  })

  it('a record is kept until exactly 24h after its LAST use', async () => {
    const edge = rec('EEEEEEEEEEEEEEEE', CONV_RECORD_TTL_MS - 1)
    const gone = rec('GGGGGGGGGGGGGGGG', CONV_RECORD_TTL_MS)
    h.state.users = [user('u1')]
    h.put('users/u1/state/agentUsage', usageDoc([gone, edge]))
    await collectRollupUsers(undefined, NOW)
    expect(usageOf('u1')?.convs).toEqual([edge])
  })

  it('nothing expired (or no doc) → no write; re-running is a no-op', async () => {
    h.state.users = [user('u1'), user('u2')]
    h.put('users/u1/state/agentUsage', usageDoc([FRESH]))
    const before = h.store.get('users/u1/state/agentUsage')
    const prune: PruneStats = { candidates: 0, pruned: 0 }
    await collectRollupUsers(prune, NOW)
    await collectRollupUsers(prune, NOW)
    expect(prune).toEqual({ candidates: 0, pruned: 0 })
    expect(h.store.get('users/u1/state/agentUsage')).toBe(before)
    expect(h.store.has('users/u2/state/agentUsage')).toBe(false)
  })

  it('RACE: a live reservation writes between read and prune → the prune is skipped, the live write survives', async () => {
    h.state.users = [user('u1')]
    h.put('users/u1/state/agentUsage', usageDoc([STALE]))
    const live = usageDoc([FRESH, rec('NNNNNNNNNNNNNNNN', 0)])
    h.state.beforeUpdate = (path) => {
      h.state.beforeUpdate = null
      h.put(path, live) // agentChat's transaction commits first
    }
    const prune: PruneStats = { candidates: 0, pruned: 0 }
    const rows = await collectRollupUsers(prune, NOW)
    expect(prune).toEqual({ candidates: 1, pruned: 0 })
    expect(h.store.get('users/u1/state/agentUsage')?.data).toEqual(live)
    // The roll-up itself still completes.
    expect(rows).toHaveLength(1)
  })

  it('a failed write never fails the roll-up', async () => {
    h.state.users = [user('u1')]
    h.put('users/u1/state/agentUsage', usageDoc([STALE]))
    h.state.failUpdate = true
    const rows = await collectRollupUsers(undefined, NOW)
    expect(rows).toHaveLength(1)
    expect(usageOf('u1')?.convs).toEqual([STALE])
  })

  it('an unparseable doc is left alone', async () => {
    h.put('users/u1/state/agentUsage', { value: 'not json' })
    expect(await pruneUsageSnapshot(h.snap('users/u1/state/agentUsage') as never, NOW)).toBe(false)
  })
})

describe('metricsRollup schedule', () => {
  it('writes metrics/{yesterday} and prunes in the same run', async () => {
    h.state.users = [user('u1')]
    h.put('users/u1/state/signals', envelope({ lastActiveDate: '2026-10-18' }))
    h.put('users/u1/state/agentUsage', usageDoc([STALE, FRESH]))
    const job = metricsRollup as unknown as (() => Promise<void>) & { __opts: Record<string, unknown> }
    expect(job.__opts).toMatchObject({ schedule: '15 6 * * *', timeZone: 'Etc/UTC', maxInstances: 1 })
    await job()
    const metrics = h.store.get('metrics/2026-10-18')?.data
    expect(metrics).toMatchObject({ version: 2, users: { total: 1 } })
    // The usage doc was read for the roll-up before its prune.
    expect(metrics?.mochi).toMatchObject({ users: 1, conversations: 2, turns: 3, ceilingHits: 0 })
    expect(usageOf('u1')?.convs).toEqual([FRESH])
    expect(h.store.get('users/u1/state/agentUsage')?.data.updatedAt).toBe(NOW)
  })
})
