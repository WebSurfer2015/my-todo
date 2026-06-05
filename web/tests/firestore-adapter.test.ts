/**
 * Firestore StorageAdapter integration tests — run against the Firestore
 * emulator (same harness as firestore-rules.test.ts).
 *
 *   npm run test:rules   # boots the emulator, runs everything in tests/
 *
 * Needs Java 21+ on PATH (firebase-tools >=15). macOS: brew install openjdk@21.
 *
 * Covers the persistence seam that unit tests can't reach: the real
 * makeFirestoreAdapter round-trip, the on-disk { value, updatedAt }
 * envelope shape, and the onSnapshot subscribe() path (cross-client
 * delivery + delete → null). This is the layer that, if wrong, silently
 * loses or cross-contaminates user data.
 */
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest'
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { makeFirestoreAdapter } from '../src/adapters/firestoreAdapter'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'my-todos-adapter-test',
    firestore: {
      rules: readFileSync(resolve(__dirname, '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(async () => {
  await env.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
})

const ENVELOPE = '{"version":1,"data":[{"id":"a","text":"hi"}]}'

describe('makeFirestoreAdapter round-trip', () => {
  it('setItem then getItem returns the same string', async () => {
    const db = env.authenticatedContext('alice').firestore()
    const adapter = makeFirestoreAdapter(db as never, 'alice')
    await adapter.setItem('todos', ENVELOPE)
    expect(await adapter.getItem('todos')).toBe(ENVELOPE)
  })

  it('getItem returns null for a missing key', async () => {
    const db = env.authenticatedContext('alice').firestore()
    const adapter = makeFirestoreAdapter(db as never, 'alice')
    expect(await adapter.getItem('categories')).toBeNull()
  })

  // Contract lock-in: the security rules deliberately have NO `allow
  // delete` on state docs (the write rule needs request.resource, which is
  // null on delete). So removeItem() is REJECTED on cloud — the app clears
  // state by writing an empty `{version,data:[]}` wrapper instead (see
  // mobile/src/store/useTodoStore.ts "Cloud strategy: setItem the empty
  // wrapper (NOT removeItem)"). If someone adds allow-delete, this fails
  // and they should re-evaluate the clear strategy + the race notes there.
  it('removeItem is rejected by the rules (doc persists)', async () => {
    const db = env.authenticatedContext('alice').firestore()
    const adapter = makeFirestoreAdapter(db as never, 'alice')
    await adapter.setItem('profile', ENVELOPE)
    await expect(adapter.removeItem('profile')).rejects.toThrow()
    expect(await adapter.getItem('profile')).toBe(ENVELOPE)
  })

  it('clear path: setItem(empty envelope) round-trips (the real "delete")', async () => {
    const db = env.authenticatedContext('alice').firestore()
    const adapter = makeFirestoreAdapter(db as never, 'alice')
    const EMPTY = '{"version":1,"data":[]}'
    await adapter.setItem('todos', ENVELOPE)
    await adapter.setItem('todos', EMPTY)
    expect(await adapter.getItem('todos')).toBe(EMPTY)
  })

  it('writes the { value, updatedAt } envelope shape at users/{uid}/state/{key}', async () => {
    const db = env.authenticatedContext('alice').firestore()
    const adapter = makeFirestoreAdapter(db as never, 'alice')
    const before = Date.now()
    await adapter.setItem('todos', ENVELOPE)
    const snap = await getDoc(doc(db, 'users/alice/state/todos'))
    expect(snap.exists()).toBe(true)
    const data = snap.data() as { value: string; updatedAt: number }
    expect(data.value).toBe(ENVELOPE)
    expect(typeof data.updatedAt).toBe('number')
    expect(data.updatedAt).toBeGreaterThanOrEqual(before)
  })
})

describe('makeFirestoreAdapter subscribe (onSnapshot)', () => {
  it('delivers a value written by another client (cross-device sync)', async () => {
    // Two clients for the SAME user = two devices on one account.
    const reader = makeFirestoreAdapter(
      env.authenticatedContext('alice').firestore() as never,
      'alice',
    )
    const writer = makeFirestoreAdapter(
      env.authenticatedContext('alice').firestore() as never,
      'alice',
    )

    const received: (string | null)[] = []
    const got = new Promise<string | null>((res) => {
      const unsub = reader.subscribe!('todos', (v) => {
        received.push(v)
        if (v != null) {
          unsub()
          res(v)
        }
      })
    })

    await writer.setItem('todos', ENVELOPE)
    expect(await got).toBe(ENVELOPE)
  })

  it('delivers the empty envelope when another client clears via setItem', async () => {
    // Cross-client: the adapter's subscribe skips its OWN pending writes
    // (hasPendingWrites echo-guard), so the clear must come from a second
    // client — which is also the real scenario (clear on device B, device
    // A's listener updates).
    const EMPTY = '{"version":1,"data":[]}'
    const reader = makeFirestoreAdapter(
      env.authenticatedContext('alice').firestore() as never,
      'alice',
    )
    const writer = makeFirestoreAdapter(
      env.authenticatedContext('alice').firestore() as never,
      'alice',
    )
    await writer.setItem('todos', ENVELOPE)

    const sawEmpty = new Promise<string | null>((res) => {
      const unsub = reader.subscribe!('todos', (v) => {
        if (v === EMPTY) {
          unsub()
          res(v)
        }
      })
    })
    await writer.setItem('todos', EMPTY) // the real cloud-clear path
    expect(await sawEmpty).toBe(EMPTY)
  })
})
