import { describe, it, expect, vi } from 'vitest'
import { runDeleteAccount, wipeUserCloudData } from '../../core/src/store/deleteAccount'

describe('runDeleteAccount', () => {
  it('wipes cloud data BEFORE deleting the auth user (rules-order invariant)', async () => {
    const calls: string[] = []
    await runDeleteAccount({
      wipeCloudData: async () => {
        calls.push('wipe')
      },
      deleteAuthUser: async () => {
        calls.push('deleteUser')
      },
    })
    expect(calls).toEqual(['wipe', 'deleteUser'])
  })

  it('runs onAuthError then rethrows when deleteAuthUser fails', async () => {
    const onAuthError = vi.fn()
    const boom = new Error('auth blew up')
    await expect(
      runDeleteAccount({
        wipeCloudData: async () => {},
        deleteAuthUser: async () => {
          throw boom
        },
        onAuthError,
      }),
    ).rejects.toBe(boom)
    expect(onAuthError).toHaveBeenCalledWith(boom)
  })

  it('lets onAuthError translate the error (e.g. RecentLoginRequired)', async () => {
    class RecentLoginRequiredError extends Error {}
    await expect(
      runDeleteAccount({
        wipeCloudData: async () => {},
        deleteAuthUser: async () => {
          throw { code: 'auth/requires-recent-login' }
        },
        onAuthError: (err) => {
          if ((err as { code?: string }).code === 'auth/requires-recent-login') {
            throw new RecentLoginRequiredError()
          }
        },
      }),
    ).rejects.toBeInstanceOf(RecentLoginRequiredError)
  })

  it('does NOT delete the auth user if the cloud wipe rejects', async () => {
    const deleteAuthUser = vi.fn(async () => {})
    await expect(
      runDeleteAccount({
        wipeCloudData: async () => {
          throw new Error('wipe failed')
        },
        deleteAuthUser,
      }),
    ).rejects.toThrow('wipe failed')
    expect(deleteAuthUser).not.toHaveBeenCalled()
  })
})

describe('wipeUserCloudData', () => {
  it('removes every user-owned key, best-effort (swallows per-key errors)', async () => {
    const removed: string[] = []
    const cloud = {
      removeItem: vi.fn(async (k: string) => {
        if (k === 'profile') throw new Error('transient')
        removed.push(k)
      }),
    }
    await expect(
      wipeUserCloudData(cloud, ['todos', 'categories', 'profile']),
    ).resolves.toBeUndefined() // the 'profile' failure does not reject
    expect(removed).toContain('todos')
    expect(removed).toContain('categories')
    expect(cloud.removeItem).toHaveBeenCalledTimes(3)
  })
})
