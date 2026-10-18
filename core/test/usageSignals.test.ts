// P0 Tier 2 usage signals live in their own state doc (QA 2026-10-18): these
// lock in that a failed read never writes, set-once fields are preserved, and
// nothing ever touches the profile.
import { describe, expect, it, vi } from 'vitest'
import {
  USAGE_SIGNALS_KEY,
  migrateUsageSignals,
  refreshUsageSignals,
  stampUsageSignals,
} from '../src/store/usageSignals'

const NOW = '2026-10-18T08:00:00.000Z'
const TODAY = '2026-10-18'
const opts = (hasCompletedTodo = false) => ({ nowISO: NOW, today: TODAY, hasCompletedTodo })
const envelope = (data: unknown) => JSON.stringify({ version: 1, data })

function fakeAdapter(stored: string | null | Error) {
  const writes: { key: string; value: string }[] = []
  return {
    writes,
    adapter: {
      getItem: vi.fn(async (key: string) => {
        expect(key).toBe(USAGE_SIGNALS_KEY) // never the profile
        if (stored instanceof Error) throw stored
        return stored
      }),
      setItem: vi.fn(async (key: string, value: string) => {
        writes.push({ key, value })
      }),
    },
  }
}

describe('stampUsageSignals', () => {
  it('first open: createdAt + lastActiveDate, no activatedAt yet', () => {
    expect(stampUsageSignals({}, opts())).toEqual({ createdAt: NOW, lastActiveDate: TODAY })
  })
  it('stamps activatedAt once a to-do is completed', () => {
    expect(stampUsageSignals({}, opts(true)).activatedAt).toBe(NOW)
  })
  it('set-once fields are preserved; only lastActiveDate moves', () => {
    const prior = {
      createdAt: '2026-01-01T00:00:00.000Z',
      activatedAt: '2026-01-02T00:00:00.000Z',
      lastActiveDate: '2026-10-17',
    }
    expect(stampUsageSignals(prior, opts(true))).toEqual({ ...prior, lastActiveDate: TODAY })
  })
  it('returns the SAME reference when nothing changes', () => {
    const settled = { createdAt: NOW, lastActiveDate: TODAY }
    expect(stampUsageSignals(settled, opts())).toBe(settled)
  })
})

describe('migrateUsageSignals', () => {
  it('drops junk and keeps valid fields', () => {
    expect(
      migrateUsageSignals({ createdAt: NOW, lastActiveDate: 'yesterday', activatedAt: 5, extra: 'x' }),
    ).toEqual({ createdAt: NOW })
    expect(migrateUsageSignals(null)).toEqual({})
    expect(migrateUsageSignals([1, 2])).toEqual({})
  })
})

describe('refreshUsageSignals', () => {
  it('no doc yet → writes a fresh envelope to the signals key only', async () => {
    const { adapter, writes } = fakeAdapter(null)
    await expect(refreshUsageSignals(adapter, opts())).resolves.toBe('written')
    expect(writes).toHaveLength(1)
    expect(writes[0].key).toBe(USAGE_SIGNALS_KEY)
    expect(JSON.parse(writes[0].value)).toEqual({
      version: 1,
      data: { createdAt: NOW, lastActiveDate: TODAY },
    })
  })

  it('a FAILED read writes nothing (offline / permission / timeout)', async () => {
    const { adapter, writes } = fakeAdapter(new Error('client is offline'))
    await expect(refreshUsageSignals(adapter, opts(true))).resolves.toBe('skipped')
    expect(writes).toHaveLength(0)
  })

  it('already stamped today → no write', async () => {
    const { adapter, writes } = fakeAdapter(envelope({ createdAt: NOW, lastActiveDate: TODAY }))
    await expect(refreshUsageSignals(adapter, opts())).resolves.toBe('unchanged')
    expect(writes).toHaveLength(0)
  })

  it('preserves an earlier activatedAt across days', async () => {
    const first = '2026-09-01T10:00:00.000Z'
    const { adapter, writes } = fakeAdapter(
      envelope({ createdAt: first, activatedAt: first, lastActiveDate: '2026-10-01' }),
    )
    await refreshUsageSignals(adapter, opts(true))
    expect(JSON.parse(writes[0].value).data).toEqual({
      createdAt: first,
      activatedAt: first,
      lastActiveDate: TODAY,
    })
  })

  it('a failed WRITE is swallowed (measurement never breaks the app)', async () => {
    const { adapter } = fakeAdapter(null)
    adapter.setItem.mockRejectedValueOnce(new Error('denied'))
    await expect(refreshUsageSignals(adapter, opts())).resolves.toBe('skipped')
  })

  it('unparseable stored value is treated as a failed read', async () => {
    const { adapter, writes } = fakeAdapter('{not json')
    await expect(refreshUsageSignals(adapter, opts())).resolves.toBe('skipped')
    expect(writes).toHaveLength(0)
  })
})
