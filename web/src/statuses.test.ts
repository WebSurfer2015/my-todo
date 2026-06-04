/**
 * Tests for core/src/statuses.ts — user-overridable status filter
 * labels + ordering + visibility. Pure Profile transforms.
 */
import { describe, expect, it } from 'vitest'
import {
  getStatusLabel,
  getOrderedStatuses,
  getOrderedVisibleStatuses,
  statusRename,
  statusToggleHidden,
  statusReorder,
} from '../../core/src/domain/statuses'
import { SEED_PROFILE, type Profile } from '../../core/src/data/profile'
import { strings } from '../../core/src/data/i18n'

const t = strings.en

describe('getStatusLabel', () => {
  it('returns the user override when set', () => {
    const p: Profile = {
      ...SEED_PROFILE,
      statuses: [{ id: 'open', label: 'In progress' }],
    }
    expect(getStatusLabel('open', p, t)).toBe('In progress')
  })
  it('falls back to i18n default when no override', () => {
    expect(getStatusLabel('open', SEED_PROFILE, t)).toBe(t.filters.open)
  })
  it('treats whitespace-only override as no override', () => {
    const p: Profile = {
      ...SEED_PROFILE,
      statuses: [{ id: 'done', label: '   ' }],
    }
    expect(getStatusLabel('done', p, t)).toBe(t.filters.done)
  })
})

describe('getOrderedStatuses', () => {
  it('returns the STATUS_FILTERS list when profile has no overrides', () => {
    const out = getOrderedStatuses(SEED_PROFILE, t)
    // core/types.ts STATUS_FILTERS = ['overdue', 'open', 'done']
    expect(out.map((s) => s.id)).toEqual(['overdue', 'open', 'done'])
    // None are hidden by default.
    expect(out.every((s) => s.hidden === false)).toBe(true)
  })
  it('places overrides first in their stored order', () => {
    const p: Profile = {
      ...SEED_PROFILE,
      statuses: [
        { id: 'done', label: 'Finished' },
        { id: 'open', label: 'Active' },
      ],
    }
    const ids = getOrderedStatuses(p, t).map((s) => s.id)
    expect(ids[0]).toBe('done')
    expect(ids[1]).toBe('open')
  })
  it('appends missing ids after the overrides (no silent drops)', () => {
    const p: Profile = {
      ...SEED_PROFILE,
      statuses: [{ id: 'done', label: 'Finished' }],
    }
    const ids = getOrderedStatuses(p, t).map((s) => s.id)
    // 'done' first (override), then all others.
    expect(ids[0]).toBe('done')
    expect(ids.length).toBeGreaterThan(1)
  })
  it('dedupes if the override list has the same id twice', () => {
    const p: Profile = {
      ...SEED_PROFILE,
      statuses: [
        { id: 'open', label: 'First' },
        { id: 'open', label: 'Second' },
      ],
    }
    const out = getOrderedStatuses(p, t)
    const opens = out.filter((s) => s.id === 'open')
    expect(opens.length).toBe(1)
    expect(opens[0].label).toBe('First')
  })
})

describe('getOrderedVisibleStatuses', () => {
  it('drops hidden entries', () => {
    const p: Profile = {
      ...SEED_PROFILE,
      statuses: [{ id: 'done', hidden: true }],
    }
    const ids = getOrderedVisibleStatuses(p, t).map((s) => s.id)
    expect(ids).not.toContain('done')
  })
})

describe('statusRename', () => {
  it('adds a new override entry when none exists', () => {
    const out = statusRename(SEED_PROFILE, 'open', 'In progress')
    const o = out.statuses?.find((s) => s.id === 'open')
    expect(o?.label).toBe('In progress')
  })
  it('updates an existing override entry', () => {
    const p: Profile = {
      ...SEED_PROFILE,
      statuses: [{ id: 'open', label: 'Old' }],
    }
    const out = statusRename(p, 'open', 'New')
    const o = out.statuses?.find((s) => s.id === 'open')
    expect(o?.label).toBe('New')
  })
  it('empty string clears the label override (treated as no label)', () => {
    const p: Profile = {
      ...SEED_PROFILE,
      statuses: [{ id: 'open', label: 'Old' }],
    }
    const out = statusRename(p, 'open', '   ')
    const o = out.statuses?.find((s) => s.id === 'open')
    expect(o?.label).toBeUndefined()
  })
  it('does not mutate the input profile', () => {
    const original: Profile = { ...SEED_PROFILE }
    statusRename(original, 'open', 'X')
    expect(original.statuses).toBeUndefined()
  })
})

describe('statusToggleHidden', () => {
  it('hides a previously-visible status', () => {
    const out = statusToggleHidden(SEED_PROFILE, 'done')
    const o = out.statuses?.find((s) => s.id === 'done')
    expect(o?.hidden).toBe(true)
  })
  it('unhides a previously-hidden status', () => {
    const p: Profile = {
      ...SEED_PROFILE,
      statuses: [{ id: 'done', hidden: true }],
    }
    const out = statusToggleHidden(p, 'done')
    const o = out.statuses?.find((s) => s.id === 'done')
    expect(o?.hidden).toBeUndefined()
  })
})

describe('statusReorder', () => {
  it('puts statuses in the new order', () => {
    const out = statusReorder(SEED_PROFILE, ['done', 'open', 'overdue'])
    const ids = out.statuses!.map((s) => s.id)
    expect(ids).toEqual(['done', 'open', 'overdue'])
  })
  it('appends any STATUS_FILTERS missing from newOrder (no silent drops)', () => {
    const out = statusReorder(SEED_PROFILE, ['done'])
    const ids = out.statuses!.map((s) => s.id)
    expect(ids[0]).toBe('done')
    // Tail should include the rest.
    expect(ids.length).toBeGreaterThan(1)
  })
  it('preserves existing labels + hidden flags through the reorder', () => {
    const p: Profile = {
      ...SEED_PROFILE,
      statuses: [
        { id: 'done', label: 'Finished', hidden: true },
        { id: 'open', label: 'Active' },
      ],
    }
    const out = statusReorder(p, ['open', 'done'])
    const open = out.statuses!.find((s) => s.id === 'open')!
    const done = out.statuses!.find((s) => s.id === 'done')!
    expect(open.label).toBe('Active')
    expect(done.label).toBe('Finished')
    expect(done.hidden).toBe(true)
  })
  it('dedupes if newOrder lists the same id twice', () => {
    const out = statusReorder(SEED_PROFILE, ['open', 'open', 'done'])
    const opens = out.statuses!.filter((s) => s.id === 'open')
    expect(opens.length).toBe(1)
  })
})
