/**
 * firestoreAdapter: cache-first hydrate read and the one-shot resubscribe
 * after a permission-denied listener error. The RNFB modular API is mocked —
 * no Firestore access.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Snap = { exists: () => boolean; data: () => unknown; metadata: { hasPendingWrites: boolean; fromCache: boolean } }
const snap = (value: string | null, fromCache = false): Snap => ({
  exists: () => value !== null,
  data: () => (value === null ? undefined : { value }),
  metadata: { hasPendingWrites: false, fromCache },
})

const fs = vi.hoisted(() => ({
  getDocFromCache: vi.fn(),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
}))

vi.mock('@react-native-firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  getDoc: fs.getDoc,
  getDocFromCache: fs.getDocFromCache,
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: fs.onSnapshot,
}))

import { makeFirestoreAdapter, SUBSCRIBE_RETRY_MS } from '../adapters/firestoreAdapter'

const db = {} as never

describe('makeFirestoreAdapter', () => {
  beforeEach(() => {
    fs.getDocFromCache.mockReset()
    fs.getDoc.mockReset()
    fs.onSnapshot.mockReset()
  })

  describe('getItem', () => {
    it('returns a cached doc without waiting on the server', async () => {
      fs.getDocFromCache.mockResolvedValue(snap('cached', true))
      const a = makeFirestoreAdapter(db, 'u1')
      expect(await a.getItem('todos')).toBe('cached')
      expect(fs.getDoc).not.toHaveBeenCalled()
    })

    it('falls back to the default read when the doc is not cached', async () => {
      fs.getDocFromCache.mockRejectedValue(new Error('unavailable'))
      fs.getDoc.mockResolvedValue(snap('server'))
      expect(await makeFirestoreAdapter(db, 'u1').getItem('todos')).toBe('server')
    })

    it('a cached "missing" doc still asks the server', async () => {
      fs.getDocFromCache.mockResolvedValue(snap(null, true))
      fs.getDoc.mockResolvedValue(snap(null))
      expect(await makeFirestoreAdapter(db, 'u1').getItem('todos')).toBeNull()
      expect(fs.getDoc).toHaveBeenCalledTimes(1)
    })
  })

  describe('subscribe', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    type OnErr = (err: unknown) => void
    const errorHandlers: OnErr[] = []
    const unsubs: Array<ReturnType<typeof vi.fn>> = []
    beforeEach(() => {
      errorHandlers.length = 0
      unsubs.length = 0
      fs.onSnapshot.mockImplementation((_ref: unknown, _opts: unknown, _next: unknown, onErr: OnErr) => {
        errorHandlers.push(onErr)
        const u = vi.fn()
        unsubs.push(u)
        return u
      })
    })

    it('resubscribes once after permission-denied while still subscribed', () => {
      const stop = makeFirestoreAdapter(db, 'u1').subscribe!('todos', () => {})
      expect(fs.onSnapshot).toHaveBeenCalledTimes(1)
      errorHandlers[0]({ code: 'firestore/permission-denied' })
      vi.advanceTimersByTime(SUBSCRIBE_RETRY_MS)
      expect(fs.onSnapshot).toHaveBeenCalledTimes(2)
      // Only once.
      errorHandlers[1]({ code: 'firestore/permission-denied' })
      vi.advanceTimersByTime(SUBSCRIBE_RETRY_MS * 2)
      expect(fs.onSnapshot).toHaveBeenCalledTimes(2)
      stop()
      expect(unsubs[1]).toHaveBeenCalled()
    })

    it('does not resubscribe after unsubscribe (sign-out teardown)', () => {
      const stop = makeFirestoreAdapter(db, 'u1').subscribe!('todos', () => {})
      errorHandlers[0]({ code: 'firestore/permission-denied' })
      stop()
      vi.advanceTimersByTime(SUBSCRIBE_RETRY_MS * 2)
      expect(fs.onSnapshot).toHaveBeenCalledTimes(1)
    })
  })
})
