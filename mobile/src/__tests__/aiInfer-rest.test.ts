/**
 * The ambient grocery AI calls (classifyGroceryDept, linkStoreToItems) honor
 * Mochi's shared "resting" window like every other AI surface: no request
 * while resting, and a fair-use rejection starts the rest. fetch is stubbed —
 * never the live Cloud Function.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@react-native-firebase/auth', () => ({
  default: () => ({ currentUser: { uid: 'uid-1', getIdToken: async () => 'id-token' } }),
}))

import { classifyGroceryDept, isAiQuotaError, linkStoreToItems } from '../adapters/aiInfer'
import { __resetForTests, markMochiResting, mochiRestUntil } from '../features/mochi/mochiRest'

const EMPTY = { groupId: null, newGroupLabel: null, storeHint: null, recommendedStores: [] }
const INPUT = { text: 'milk', departments: [{ id: 'dairy', label: 'Dairy' }], stores: [] }
const quota429 = () =>
  new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'resting' } }), { status: 429 })

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  __resetForTests()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('aiInfer — Mochi rest gate', () => {
  it('classifyGroceryDept spends no request while resting', async () => {
    markMochiResting('uid-1')
    await expect(classifyGroceryDept(INPUT)).resolves.toEqual(EMPTY)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('classifyGroceryDept hitting the cap marks Mochi resting (and stays a quiet no-op)', async () => {
    fetchMock.mockResolvedValueOnce(quota429())
    await expect(classifyGroceryDept(INPUT)).resolves.toEqual(EMPTY)
    expect(mochiRestUntil('uid-1')).toBeGreaterThan(0)
  })

  it('linkStoreToItems fails fast with the quota error while resting', async () => {
    markMochiResting('uid-1')
    const err = await linkStoreToItems({ storeName: 'Costco', items: [] }).catch((e: unknown) => e)
    expect(isAiQuotaError(err)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('linkStoreToItems hitting the cap marks Mochi resting and rethrows', async () => {
    fetchMock.mockResolvedValueOnce(quota429())
    const err = await linkStoreToItems({ storeName: 'Costco', items: [] }).catch((e: unknown) => e)
    expect(isAiQuotaError(err)).toBe(true)
    expect(mochiRestUntil('uid-1')).toBeGreaterThan(0)
  })
})
