import { describe, it, expect } from 'vitest'
import {
  migrateLocalToCloud,
  MIGRATION_KEYS,
} from '../../core/src/store/migration'
import type { StorageAdapter } from '../../core/src/ports/persistence'

/** In-memory StorageAdapter for testing the migration decision logic. */
function fakeAdapter(initial: Record<string, string> = {}): StorageAdapter & {
  map: Map<string, string>
} {
  const map = new Map(Object.entries(initial))
  return {
    map,
    async getItem(k) {
      return map.has(k) ? map.get(k)! : null
    },
    async setItem(k, v) {
      map.set(k, v)
    },
    async removeItem(k) {
      map.delete(k)
    },
    async clear() {
      map.clear()
    },
  }
}

describe('migrateLocalToCloud', () => {
  it('pushes a local key up when the cloud key is missing', async () => {
    const cloud = fakeAdapter()
    const local = fakeAdapter({ todos: 'L-todos' })
    const migrated = await migrateLocalToCloud(cloud, local)
    expect(cloud.map.get('todos')).toBe('L-todos')
    expect(migrated).toContain('todos')
  })

  it('NEVER stomps a populated cloud key (the data-bleed guard)', async () => {
    const cloud = fakeAdapter({ todos: 'CLOUD-todos' })
    const local = fakeAdapter({ todos: 'LOCAL-todos' })
    const migrated = await migrateLocalToCloud(cloud, local)
    expect(cloud.map.get('todos')).toBe('CLOUD-todos') // unchanged
    expect(migrated).not.toContain('todos')
  })

  it('skips a key absent from both cloud and local', async () => {
    const cloud = fakeAdapter()
    const local = fakeAdapter() // nothing anywhere
    const migrated = await migrateLocalToCloud(cloud, local)
    expect(migrated).toEqual([])
    expect(cloud.map.size).toBe(0)
  })

  it('gates each key INDEPENDENTLY — a present cloud key does not block others', async () => {
    // The exact cross-device-loss scenario the per-key design prevents:
    // cloud has todos but its profile doc is missing; local has both.
    // profile must migrate; cloud todos must NOT be overwritten.
    const cloud = fakeAdapter({ todos: 'CLOUD-todos' })
    const local = fakeAdapter({ todos: 'LOCAL-todos', profile: 'LOCAL-profile' })
    const migrated = await migrateLocalToCloud(cloud, local)
    expect(cloud.map.get('todos')).toBe('CLOUD-todos') // preserved
    expect(cloud.map.get('profile')).toBe('LOCAL-profile') // migrated
    expect(migrated).toEqual(['profile'])
  })

  it('defaults to the shared three keys', async () => {
    expect([...MIGRATION_KEYS]).toEqual(['todos', 'categories', 'profile'])
    const cloud = fakeAdapter()
    const local = fakeAdapter({
      todos: 't',
      categories: 'c',
      profile: 'p',
      groceries: 'g', // NOT in the default set
    })
    const migrated = await migrateLocalToCloud(cloud, local)
    expect(migrated.sort()).toEqual(['categories', 'profile', 'todos'])
    expect(cloud.map.has('groceries')).toBe(false)
  })

  it('honors a custom key set (mobile passes its grocery superset)', async () => {
    const cloud = fakeAdapter()
    const local = fakeAdapter({ groceries: 'g', groceryGroups: 'gg' })
    const migrated = await migrateLocalToCloud(cloud, local, [
      'todos',
      'categories',
      'profile',
      'groceries',
      'groceryGroups',
    ])
    expect(migrated.sort()).toEqual(['groceries', 'groceryGroups'])
    expect(cloud.map.get('groceries')).toBe('g')
    expect(cloud.map.get('groceryGroups')).toBe('gg')
  })
})
