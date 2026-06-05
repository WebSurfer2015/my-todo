/**
 * Tests for core/src/domain/priorities.ts — user-overridable priority
 * order + visibility. Pure Profile transforms (sibling of statuses.ts;
 * was the only 0%-covered core logic module). Mirrors statuses.test.ts.
 */
import { describe, expect, it } from 'vitest'
import {
  getOrderedPriorities,
  getOrderedVisiblePriorities,
  priorityToggleHidden,
  priorityReorder,
} from '../../core/src/domain/priorities'
import { SEED_PROFILE, type Profile } from '../../core/src/data/profile'
import { PRIORITY_VALUES } from '../../core/src/domain/types'
import { strings } from '../../core/src/data/i18n'

const t = strings.en

describe('getOrderedPriorities', () => {
  it('returns the default PRIORITY_VALUES order when no overrides', () => {
    const out = getOrderedPriorities(SEED_PROFILE, t)
    expect(out.map((p) => p.id)).toEqual([...PRIORITY_VALUES])
    expect(out.every((p) => !p.hidden)).toBe(true)
    expect(out[0].label).toBe(t.priority[out[0].id])
  })

  it('honors a custom order, then appends any missing defaults', () => {
    const p: Profile = { ...SEED_PROFILE, priorities: [{ id: 'low' }, { id: 'high' }] }
    const ids = getOrderedPriorities(p, t).map((x) => x.id)
    expect(ids.slice(0, 2)).toEqual(['low', 'high'])
    expect(new Set(ids)).toEqual(new Set(PRIORITY_VALUES)) // all present, no dups
    expect(ids.length).toBe(PRIORITY_VALUES.length)
  })

  it('dedups repeated override ids', () => {
    const p: Profile = { ...SEED_PROFILE, priorities: [{ id: 'high' }, { id: 'high' }] }
    const ids = getOrderedPriorities(p, t).map((x) => x.id)
    expect(ids.filter((i) => i === 'high')).toHaveLength(1)
  })

  it('carries the hidden flag through', () => {
    const p: Profile = { ...SEED_PROFILE, priorities: [{ id: 'medium', hidden: true }] }
    expect(getOrderedPriorities(p, t).find((x) => x.id === 'medium')?.hidden).toBe(true)
  })
})

describe('getOrderedVisiblePriorities', () => {
  it('filters out hidden entries', () => {
    const p: Profile = { ...SEED_PROFILE, priorities: [{ id: 'low', hidden: true }] }
    const ids = getOrderedVisiblePriorities(p, t).map((x) => x.id)
    expect(ids).not.toContain('low')
    expect(ids).toContain('high')
  })
})

describe('priorityToggleHidden', () => {
  it('hides a visible priority and unhides it again (round-trip)', () => {
    const hidden = priorityToggleHidden(SEED_PROFILE, 'high')
    expect(getOrderedPriorities(hidden, t).find((x) => x.id === 'high')?.hidden).toBe(true)
    const shown = priorityToggleHidden(hidden, 'high')
    expect(getOrderedPriorities(shown, t).find((x) => x.id === 'high')?.hidden).toBe(false)
  })

  it('does not mutate the input profile', () => {
    const before = JSON.stringify(SEED_PROFILE)
    priorityToggleHidden(SEED_PROFILE, 'low')
    expect(JSON.stringify(SEED_PROFILE)).toBe(before)
  })
})

describe('priorityReorder', () => {
  it('applies the new order and preserves all ids', () => {
    const out = priorityReorder(SEED_PROFILE, ['low', 'medium', 'high'])
    expect(out.priorities?.map((p) => p.id)).toEqual(['low', 'medium', 'high'])
  })

  it('appends any ids omitted from newOrder', () => {
    const out = priorityReorder(SEED_PROFILE, ['low'])
    const ids = out.priorities?.map((p) => p.id) ?? []
    expect(ids[0]).toBe('low')
    expect(new Set(ids)).toEqual(new Set(PRIORITY_VALUES))
  })

  it('preserves hidden flags across a reorder', () => {
    const hidden = priorityToggleHidden(SEED_PROFILE, 'high')
    const out = priorityReorder(hidden, ['medium', 'low', 'high'])
    expect(out.priorities?.find((p) => p.id === 'high')?.hidden).toBe(true)
  })
})
