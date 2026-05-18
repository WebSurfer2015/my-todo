/**
 * Firestore security rules tests.
 *
 * Requires the Firebase emulator running:
 *   firebase emulators:start --only firestore
 *
 * Or run via the convenience npm script (handles starting + stopping):
 *   npm run test:rules
 *
 * The emulator needs Java 11+ on PATH. macOS: `brew install openjdk`.
 */
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest'
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'my-todos-rules-test',
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

describe('users/{uid}/state/{key} access control', () => {
  it('signed-in user can write their own state', async () => {
    const alice = env.authenticatedContext('alice').firestore()
    await assertSucceeds(
      setDoc(doc(alice, 'users/alice/state/todos'), {
        value: '{"version":1,"data":[]}',
        updatedAt: Date.now(),
      }),
    )
  })

  it('signed-in user can read their own state', async () => {
    // seed via admin (bypasses rules) so the read is the only thing tested
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/state/todos'), {
        value: '{"version":1,"data":[]}',
        updatedAt: Date.now(),
      })
    })
    const alice = env.authenticatedContext('alice').firestore()
    await assertSucceeds(getDoc(doc(alice, 'users/alice/state/todos')))
  })

  it('signed-in user CANNOT read another user\'s state', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/bob/state/todos'), {
        value: '{"version":1,"data":[]}',
        updatedAt: Date.now(),
      })
    })
    const alice = env.authenticatedContext('alice').firestore()
    await assertFails(getDoc(doc(alice, 'users/bob/state/todos')))
  })

  it('signed-in user CANNOT write to another user\'s state', async () => {
    const alice = env.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(alice, 'users/bob/state/todos'), {
        value: '{"version":1,"data":[]}',
        updatedAt: Date.now(),
      }),
    )
  })

  it('unauthenticated user CANNOT read any state', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/state/todos'), {
        value: '{"version":1,"data":[]}',
        updatedAt: Date.now(),
      })
    })
    const anon = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anon, 'users/alice/state/todos')))
  })

  it('unauthenticated user CANNOT write any state', async () => {
    const anon = env.unauthenticatedContext().firestore()
    await assertFails(
      setDoc(doc(anon, 'users/alice/state/todos'), {
        value: '{"version":1,"data":[]}',
        updatedAt: Date.now(),
      }),
    )
  })

  it('default-deny applies to other collections', async () => {
    const alice = env.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(alice, 'random/collection/abc'), { foo: 'bar' }),
    )
  })

  // --- Shape + key-whitelist hardening (added with the rate-limit work). ---

  it('rejects writes to non-whitelisted state keys (e.g. agentUsage)', async () => {
    const alice = env.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(alice, 'users/alice/state/agentUsage'), {
        value: '{"version":1,"data":{}}',
        updatedAt: Date.now(),
      }),
    )
  })

  it('allows writes to grocery state keys (mobile)', async () => {
    const alice = env.authenticatedContext('alice').firestore()
    await assertSucceeds(
      setDoc(doc(alice, 'users/alice/state/groceries'), {
        value: '{"version":1,"data":[]}',
        updatedAt: Date.now(),
      }),
    )
    await assertSucceeds(
      setDoc(doc(alice, 'users/alice/state/groceryGroups'), {
        value: '{"version":1,"data":[]}',
        updatedAt: Date.now(),
      }),
    )
  })

  it('rejects writes to arbitrary state keys', async () => {
    const alice = env.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(alice, 'users/alice/state/something_else'), {
        value: '{"version":1,"data":[]}',
        updatedAt: Date.now(),
      }),
    )
  })

  it('rejects writes with extra top-level fields', async () => {
    const alice = env.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(alice, 'users/alice/state/todos'), {
        value: '{"version":1,"data":[]}',
        updatedAt: Date.now(),
        extra: 'should-not-be-allowed',
      }),
    )
  })

  it('rejects writes where value is not a string', async () => {
    const alice = env.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(alice, 'users/alice/state/todos'), {
        value: { version: 1, data: [] }, // map instead of serialized string
        updatedAt: Date.now(),
      }),
    )
  })

  it('rejects writes where updatedAt is not an int', async () => {
    const alice = env.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(alice, 'users/alice/state/todos'), {
        value: '{"version":1,"data":[]}',
        updatedAt: 'now', // string instead of int
      }),
    )
  })

  it('rejects writes with oversized value (> 512 KiB)', async () => {
    const alice = env.authenticatedContext('alice').firestore()
    const oversized = 'x'.repeat(524289) // 1 byte over the cap
    await assertFails(
      setDoc(doc(alice, 'users/alice/state/todos'), {
        value: oversized,
        updatedAt: Date.now(),
      }),
    )
  })

  it('reading agentUsage IS allowed (client surfaces quota UX)', async () => {
    // Function-only key — admin writes it, client only reads it. The
    // rules allow READ for any state key under the user's subtree.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/state/agentUsage'), {
        value: '{"version":1,"data":{"date":"2026-05-18","calls":1}}',
        updatedAt: Date.now(),
      })
    })
    const alice = env.authenticatedContext('alice').firestore()
    await assertSucceeds(getDoc(doc(alice, 'users/alice/state/agentUsage')))
  })
})
