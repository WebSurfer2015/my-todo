/**
 * RevenueCat webhook (revenuecat.ts) with firebase-admin replaced by an
 * in-memory Firestore + Auth fake (no emulator): shared-secret auth, method
 * guard, lifecycle event → entitlement mapping, idempotent replay, unknown
 * users, and the multi-account TRANSFER fan-out.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>()
  const users = new Set<string>()
  const writes: string[] = []
  const snap = (path: string) => ({
    exists: store.has(path),
    data: () => store.get(path),
  })
  const tx = {
    get: async (ref: { path: string }) => snap(ref.path),
    set: (ref: { path: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      writes.push(ref.path)
      store.set(ref.path, opts?.merge ? { ...(store.get(ref.path) ?? {}), ...data } : data)
    },
  }
  const getUser = async (uid: string) => {
    if (uid === 'boom') throw Object.assign(new Error('backend down'), { code: 'auth/internal-error' })
    if (!users.has(uid)) throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' })
    return { uid }
  }
  return { store, users, writes, tx, getUser }
})

vi.mock('firebase-functions/v2/https', () => ({
  onRequest: (_opts: unknown, handler: unknown) => handler,
}))
vi.mock('firebase-functions/params', () => ({
  defineSecret: () => ({ value: () => 'whsec_test' }),
}))
vi.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: vi.fn(),
  auth: () => ({ getUser: h.getUser }),
  firestore: () => ({
    doc: (path: string) => ({ path }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(h.tx),
  }),
}))

import { revenuecatWebhook } from './revenuecat'
import { PRODUCT_IDS } from './entitlements'

type Req = { method: string; header: (n: string) => string | undefined; body?: unknown }
const handler = revenuecatWebhook as unknown as (req: Req, res: unknown) => Promise<void>

const EXP = 1893456000000
const ENT = (uid: string) => `users/${uid}/state/entitlement`

function entitlementOf(uid: string): { tier: string; validUntil: string | null } | undefined {
  const raw = h.store.get(ENT(uid)) as { value?: string } | undefined
  return raw?.value ? JSON.parse(raw.value).data : undefined
}

async function send(
  event: Record<string, unknown> | undefined,
  { method = 'POST', auth = 'whsec_test' }: { method?: string; auth?: string | null } = {},
) {
  let status = 0
  let body = ''
  const res = {
    status(code: number) {
      status = code
      return { send: (b: string) => void (body = b) }
    },
  }
  await handler(
    {
      method,
      header: (n: string) => (n === 'Authorization' ? (auth ?? undefined) : undefined),
      body: event === undefined ? {} : { event },
    },
    res,
  )
  return { status, body }
}

beforeEach(() => {
  h.store.clear()
  h.users.clear()
  h.writes.length = 0
  h.users.add('u1')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('revenuecatWebhook — request guards', () => {
  it('GET → 405, no write', async () => {
    expect((await send({ type: 'RENEWAL', app_user_id: 'u1' }, { method: 'GET' })).status).toBe(405)
    expect(h.writes).toEqual([])
  })
  it('missing / wrong / wrong-length Authorization → 401, no write', async () => {
    const ev = { id: 'e1', type: 'INITIAL_PURCHASE', app_user_id: 'u1', product_id: PRODUCT_IDS.premiumMonthly }
    expect((await send(ev, { auth: null })).status).toBe(401)
    expect((await send(ev, { auth: 'whsec_tesX' })).status).toBe(401)
    expect((await send(ev, { auth: 'nope' })).status).toBe(401)
    expect(h.writes).toEqual([])
  })
  it('missing type / app_user_id → 400, no write', async () => {
    expect((await send({ app_user_id: 'u1' })).status).toBe(400)
    expect((await send(undefined)).status).toBe(400)
    expect((await send({ type: 'RENEWAL' })).status).toBe(400)
    expect(h.writes).toEqual([])
  })
  it('unknown uid → 200, no write (deleted accounts are not resurrected)', async () => {
    const r = await send({ id: 'e1', type: 'INITIAL_PURCHASE', app_user_id: 'ghost', product_id: PRODUCT_IDS.premiumMonthly })
    expect(r.status).toBe(200)
    expect(h.writes).toEqual([])
  })
  it('an Auth backend error → 500 so RevenueCat retries', async () => {
    const r = await send({ id: 'e1', type: 'RENEWAL', app_user_id: 'boom', product_id: PRODUCT_IDS.premiumMonthly })
    expect(r.status).toBe(500)
    expect(h.writes).toEqual([])
  })
})

describe('revenuecatWebhook — lifecycle → entitlement', () => {
  it('INITIAL_PURCHASE → premium until expiration', async () => {
    const r = await send({
      id: 'e1',
      type: 'INITIAL_PURCHASE',
      app_user_id: 'u1',
      product_id: PRODUCT_IDS.premiumMonthly,
      expiration_at_ms: EXP,
    })
    expect(r.status).toBe(200)
    expect(entitlementOf('u1')).toEqual({ tier: 'premium', validUntil: new Date(EXP).toISOString() })
  })
  it('RENEWAL extends validUntil', async () => {
    await send({ id: 'e1', type: 'INITIAL_PURCHASE', app_user_id: 'u1', product_id: PRODUCT_IDS.premiumAnnual, expiration_at_ms: EXP })
    await send({ id: 'e2', type: 'RENEWAL', app_user_id: 'u1', product_id: PRODUCT_IDS.premiumAnnual, expiration_at_ms: EXP + 1000 })
    expect(entitlementOf('u1')).toEqual({ tier: 'premium', validUntil: new Date(EXP + 1000).toISOString() })
  })
  it('CANCELLATION keeps premium until expiry (no entitlement write)', async () => {
    await send({ id: 'e1', type: 'INITIAL_PURCHASE', app_user_id: 'u1', product_id: PRODUCT_IDS.premiumMonthly, expiration_at_ms: EXP })
    h.writes.length = 0
    const r = await send({ id: 'e2', type: 'CANCELLATION', app_user_id: 'u1', product_id: PRODUCT_IDS.premiumMonthly })
    expect(r.status).toBe(200)
    expect(entitlementOf('u1')?.tier).toBe('premium')
    expect(h.writes).not.toContain(ENT('u1'))
  })
  it('EXPIRATION drops to free', async () => {
    await send({ id: 'e1', type: 'INITIAL_PURCHASE', app_user_id: 'u1', product_id: PRODUCT_IDS.premiumMonthly, expiration_at_ms: EXP })
    await send({ id: 'e2', type: 'EXPIRATION', app_user_id: 'u1', product_id: PRODUCT_IDS.premiumMonthly })
    expect(entitlementOf('u1')).toEqual({ tier: 'free', validUntil: null })
  })
  it('a replayed event id is applied only once', async () => {
    const purchase = { id: 'e1', type: 'INITIAL_PURCHASE', app_user_id: 'u1', product_id: PRODUCT_IDS.premiumMonthly, expiration_at_ms: EXP }
    await send(purchase)
    await send({ id: 'e2', type: 'EXPIRATION', app_user_id: 'u1' })
    expect(entitlementOf('u1')?.tier).toBe('free')
    h.writes.length = 0
    // RevenueCat redelivers the (older) purchase — must NOT re-grant premium.
    const r = await send(purchase)
    expect(r.status).toBe(200)
    expect(entitlementOf('u1')?.tier).toBe('free')
    expect(h.writes).toEqual([])
  })
  it('the per-user dedupe log keeps only the newest 50 event ids', async () => {
    for (let i = 1; i <= 51; i++) {
      await send({ id: `e${i}`, type: 'RENEWAL', app_user_id: 'u1', product_id: PRODUCT_IDS.premiumMonthly, expiration_at_ms: EXP })
    }
    const ids = (h.store.get('users/u1/state/rcWebhook') as { ids: string[] }).ids
    expect(ids).toHaveLength(50)
    expect(ids[0]).toBe('e2')
    expect(ids.at(-1)).toBe('e51')
  })
  it('TRANSFER moves the subscription between accounts', async () => {
    h.users.add('u2')
    await send({ id: 'e1', type: 'INITIAL_PURCHASE', app_user_id: 'u1', product_id: PRODUCT_IDS.premiumMonthly, expiration_at_ms: EXP })
    const r = await send({
      id: 'e2',
      type: 'TRANSFER',
      product_id: PRODUCT_IDS.premiumMonthly,
      expiration_at_ms: EXP,
      transferred_from: ['u1'],
      transferred_to: ['u2', 'ghost'],
    })
    expect(r.status).toBe(200)
    expect(entitlementOf('u1')).toEqual({ tier: 'free', validUntil: null })
    expect(entitlementOf('u2')).toEqual({ tier: 'premium', validUntil: new Date(EXP).toISOString() })
    expect(entitlementOf('ghost')).toBeUndefined()
  })
  it('a replayed old TRANSFER does not downgrade a user who re-purchased since', async () => {
    h.users.add('u2')
    await send({ id: 'e1', type: 'INITIAL_PURCHASE', app_user_id: 'u1', product_id: PRODUCT_IDS.premiumMonthly, expiration_at_ms: EXP })
    const transfer = {
      id: 'e2',
      type: 'TRANSFER',
      product_id: PRODUCT_IDS.premiumMonthly,
      expiration_at_ms: EXP,
      transferred_from: ['u1'],
      transferred_to: ['u2'],
    }
    await send(transfer)
    expect(entitlementOf('u1')?.tier).toBe('free')
    // u1 buys again…
    await send({ id: 'e3', type: 'INITIAL_PURCHASE', app_user_id: 'u1', product_id: PRODUCT_IDS.premiumAnnual, expiration_at_ms: EXP + 5 })
    expect(entitlementOf('u1')?.tier).toBe('premium')
    // …then RevenueCat redelivers the old TRANSFER (at-least-once).
    h.writes.length = 0
    expect((await send(transfer)).status).toBe(200)
    expect(entitlementOf('u1')).toEqual({ tier: 'premium', validUntil: new Date(EXP + 5).toISOString() })
    expect(entitlementOf('u2')?.tier).toBe('premium')
    expect(h.writes).toEqual([])
  })
})
