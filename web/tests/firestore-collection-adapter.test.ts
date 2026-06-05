/**
 * Per-item Firestore collection adapter — emulator integration tests
 * (Phase 1 of docs/SPIKE-persistence-scale.md). Runs under the Firestore
 * emulator (npm run test:rules; JDK 21+). The adapter isn't wired into the
 * store yet — these prove the scale-path foundation works before any
 * cutover, so we don't repeat the "untested deployed code" trap.
 */
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest'
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { makeFirestoreCollectionAdapter } from '../src/adapters/firestoreCollectionAdapter'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'my-todos-coll-test',
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

const ENV = (data: unknown) => JSON.stringify({ version: 1, data })

describe('makeFirestoreCollectionAdapter', () => {
  it('upsert then getAll returns each item by id (per-doc, not one array)', async () => {
    const db = env.authenticatedContext('alice').firestore()
    const todos = makeFirestoreCollectionAdapter(db as never, 'alice', 'todos')
    await todos.upsert('t1', ENV({ id: 't1', text: 'a' }))
    await todos.upsert('t2', ENV({ id: 't2', text: 'b' }))
    const all = await todos.getAll()
    expect(all.map((e) => e.id).sort()).toEqual(['t1', 't2'])
    expect(all.find((e) => e.id === 't1')?.value).toBe(ENV({ id: 't1', text: 'a' }))
  })

  it('upsert overwrites a single item without touching siblings (no whole-array rewrite)', async () => {
    const db = env.authenticatedContext('alice').firestore()
    const todos = makeFirestoreCollectionAdapter(db as never, 'alice', 'todos')
    await todos.upsert('t1', ENV({ id: 't1', text: 'a' }))
    await todos.upsert('t2', ENV({ id: 't2', text: 'b' }))
    await todos.upsert('t1', ENV({ id: 't1', text: 'A!' })) // edit one
    const all = await todos.getAll()
    expect(all.find((e) => e.id === 't1')?.value).toBe(ENV({ id: 't1', text: 'A!' }))
    expect(all.find((e) => e.id === 't2')?.value).toBe(ENV({ id: 't2', text: 'b' })) // untouched
  })

  it('remove deletes one item doc (per-item delete IS allowed here)', async () => {
    const db = env.authenticatedContext('alice').firestore()
    const todos = makeFirestoreCollectionAdapter(db as never, 'alice', 'todos')
    await todos.upsert('t1', ENV({ id: 't1' }))
    await todos.remove('t1')
    expect(await todos.getAll()).toEqual([])
    expect((await getDoc(doc(db, 'users/alice/todos/t1'))).exists()).toBe(false)
  })

  it('subscribe delivers the full set when another client upserts (per-item sync)', async () => {
    const reader = makeFirestoreCollectionAdapter(
      env.authenticatedContext('alice').firestore() as never, 'alice', 'todos',
    )
    const writer = makeFirestoreCollectionAdapter(
      env.authenticatedContext('alice').firestore() as never, 'alice', 'todos',
    )
    await writer.upsert('t1', ENV({ id: 't1', text: 'a' }))
    const got = new Promise<number>((res) => {
      const unsub = reader.subscribe!((entries) => {
        if (entries.some((e) => e.id === 't2')) {
          unsub()
          res(entries.length)
        }
      })
    })
    await writer.upsert('t2', ENV({ id: 't2', text: 'b' }))
    expect(await got).toBe(2) // t1 + t2, not a clobbered single value
  })
})
