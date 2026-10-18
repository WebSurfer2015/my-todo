/**
 * Tests for the account-deletion erasure helper. The trigger wiring itself
 * (auth onDelete → deleteUserTree) is integration territory; these cover the
 * part that decides WHAT gets deleted.
 */
import { describe, expect, it } from 'vitest'
import { deleteUserTree, isSafeUid, type RecursiveDeleter } from './deleteUserData'

function fakeDb() {
  const deleted: string[] = []
  const db: RecursiveDeleter = {
    doc: (path: string) => ({ path }),
    recursiveDelete: async (ref: never) => {
      deleted.push((ref as { path: string }).path)
    },
  }
  return { db, deleted }
}

describe('deleteUserTree', () => {
  it('recursively deletes exactly the users/{uid} subtree', async () => {
    const { db, deleted } = fakeDb()
    await deleteUserTree(db, 'LqAnzu24pYfDZevLkwIvkHSR8u93')
    expect(deleted).toEqual(['users/LqAnzu24pYfDZevLkwIvkHSR8u93'])
  })

  it.each(['', 'a/b', '../x', 'x'.repeat(129)])('refuses unsafe uid %j', async (uid) => {
    const { db, deleted } = fakeDb()
    await expect(deleteUserTree(db, uid)).rejects.toThrow(/unsafe uid/)
    expect(deleted).toEqual([])
  })
})

describe('isSafeUid', () => {
  it('rejects non-strings', () => {
    expect(isSafeUid(undefined)).toBe(false)
    expect(isSafeUid(123)).toBe(false)
  })
})
