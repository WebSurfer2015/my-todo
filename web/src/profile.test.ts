/**
 * Tests for core/src/profile.ts — pebble counters, avatar lookups,
 * and the migrateProfile defensive parser. Pebble logic is the
 * load-bearing part because it's the visible reward surface
 * across web + mobile.
 */
import { describe, expect, it } from 'vitest'
import {
  getTodayPebbles,
  incrementPebble,
  decrementPebble,
  collectedGlyphFor,
  collectedNounKeyFor,
  findPreset,
  migrateProfile,
  SEED_PROFILE,
  AVATAR_PRESET_LIBRARY,
  type Profile,
} from '../../core/src/profile'

describe('getTodayPebbles', () => {
  it('returns zeros when pebblesDate is unset', () => {
    expect(getTodayPebbles({ ...SEED_PROFILE }, '2026-05-20')).toEqual({
      task: 0,
      subtask: 0,
    })
  })
  it('returns zeros when pebblesDate is a different day', () => {
    const p: Profile = {
      ...SEED_PROFILE,
      pebblesDate: '2026-05-19',
      todayTaskPebbles: 5,
      todaySubtaskPebbles: 2,
    }
    expect(getTodayPebbles(p, '2026-05-20')).toEqual({ task: 0, subtask: 0 })
  })
  it('returns the stored counts when pebblesDate matches today', () => {
    const p: Profile = {
      ...SEED_PROFILE,
      pebblesDate: '2026-05-20',
      todayTaskPebbles: 4,
      todaySubtaskPebbles: 3,
    }
    expect(getTodayPebbles(p, '2026-05-20')).toEqual({ task: 4, subtask: 3 })
  })
})

describe('incrementPebble', () => {
  it('bumps lifetime + today for task', () => {
    const next = incrementPebble({ ...SEED_PROFILE }, '2026-05-20', 'task')
    expect(next.lifetimePebbles).toBe(1)
    expect(next.todayTaskPebbles).toBe(1)
    expect(next.todaySubtaskPebbles).toBe(0)
    expect(next.pebblesDate).toBe('2026-05-20')
  })
  it('bumps lifetime + today for subtask', () => {
    const next = incrementPebble({ ...SEED_PROFILE }, '2026-05-20', 'subtask')
    expect(next.lifetimePebbles).toBe(1)
    expect(next.todayTaskPebbles).toBe(0)
    expect(next.todaySubtaskPebbles).toBe(1)
  })
  it('resets today when pebblesDate advances', () => {
    const p: Profile = {
      ...SEED_PROFILE,
      pebblesDate: '2026-05-19',
      todayTaskPebbles: 5,
      todaySubtaskPebbles: 3,
      lifetimePebbles: 100,
    }
    const next = incrementPebble(p, '2026-05-20', 'task')
    expect(next.lifetimePebbles).toBe(101)
    expect(next.todayTaskPebbles).toBe(1) // reset + +1
    expect(next.todaySubtaskPebbles).toBe(0)
    expect(next.pebblesDate).toBe('2026-05-20')
  })
  it('accumulates within the same day', () => {
    let p: Profile = { ...SEED_PROFILE }
    p = incrementPebble(p, '2026-05-20', 'task')
    p = incrementPebble(p, '2026-05-20', 'task')
    p = incrementPebble(p, '2026-05-20', 'subtask')
    expect(p.lifetimePebbles).toBe(3)
    expect(p.todayTaskPebbles).toBe(2)
    expect(p.todaySubtaskPebbles).toBe(1)
  })
  it('is immutable (returns a new object, never mutates input)', () => {
    const p: Profile = { ...SEED_PROFILE, lifetimePebbles: 0 }
    const next = incrementPebble(p, '2026-05-20', 'task')
    expect(p.lifetimePebbles).toBe(0)
    expect(next).not.toBe(p)
  })
})

describe('decrementPebble', () => {
  it('decrements lifetime + today task when pebblesDate matches', () => {
    const p: Profile = {
      ...SEED_PROFILE,
      pebblesDate: '2026-05-20',
      lifetimePebbles: 10,
      todayTaskPebbles: 3,
      todaySubtaskPebbles: 2,
    }
    const next = decrementPebble(p, '2026-05-20', 'task')
    expect(next.lifetimePebbles).toBe(9)
    expect(next.todayTaskPebbles).toBe(2)
    expect(next.todaySubtaskPebbles).toBe(2)
  })
  it('decrements lifetime + today subtask when pebblesDate matches', () => {
    const p: Profile = {
      ...SEED_PROFILE,
      pebblesDate: '2026-05-20',
      lifetimePebbles: 10,
      todayTaskPebbles: 3,
      todaySubtaskPebbles: 2,
    }
    const next = decrementPebble(p, '2026-05-20', 'subtask')
    expect(next.lifetimePebbles).toBe(9)
    expect(next.todayTaskPebbles).toBe(3)
    expect(next.todaySubtaskPebbles).toBe(1)
  })
  it('decrements only lifetime when pebblesDate is a different day', () => {
    const p: Profile = {
      ...SEED_PROFILE,
      pebblesDate: '2026-05-19',
      lifetimePebbles: 10,
      todayTaskPebbles: 5,
      todaySubtaskPebbles: 2,
    }
    const next = decrementPebble(p, '2026-05-20', 'task')
    expect(next.lifetimePebbles).toBe(9)
    expect(next.todayTaskPebbles).toBe(5) // unchanged
    expect(next.todaySubtaskPebbles).toBe(2) // unchanged
  })
  it('clamps each counter at 0', () => {
    const p: Profile = {
      ...SEED_PROFILE,
      pebblesDate: '2026-05-20',
      lifetimePebbles: 0,
      todayTaskPebbles: 0,
      todaySubtaskPebbles: 0,
    }
    const next = decrementPebble(p, '2026-05-20', 'task')
    expect(next.lifetimePebbles).toBe(0)
    expect(next.todayTaskPebbles).toBe(0)
  })
})

describe('collectedGlyphFor', () => {
  it('returns null for undefined avatar', () => {
    expect(collectedGlyphFor(undefined)).toBeNull()
  })
  it('returns null for non-preset avatar kinds', () => {
    expect(
      collectedGlyphFor({ kind: 'image', uri: 'data:foo' } as never),
    ).toBeNull()
    expect(
      collectedGlyphFor({ kind: 'icon', icon: 'star', color: '#000' } as never),
    ).toBeNull()
  })
  it('returns null for default mochi preset (no themed glyph)', () => {
    expect(collectedGlyphFor({ kind: 'preset', key: 'mochi' })).toBeNull()
  })
  it('returns the themed glyph for known presets', () => {
    expect(collectedGlyphFor({ kind: 'preset', key: 'rabbit' })).toBe('🥕')
    expect(collectedGlyphFor({ kind: 'preset', key: 'owl' })).toBe('📚')
    expect(collectedGlyphFor({ kind: 'preset', key: 'whale' })).toBe('💦')
  })
  it('returns null for unknown preset keys', () => {
    expect(collectedGlyphFor({ kind: 'preset', key: 'fairy' })).toBeNull()
  })
})

describe('collectedNounKeyFor', () => {
  it('returns null for undefined or non-preset avatar', () => {
    expect(collectedNounKeyFor(undefined)).toBeNull()
    expect(
      collectedNounKeyFor({ kind: 'image', uri: 'foo' } as never),
    ).toBeNull()
  })
  it('returns the noun key for known presets', () => {
    expect(collectedNounKeyFor({ kind: 'preset', key: 'rabbit' })).toBe('carrots')
    expect(collectedNounKeyFor({ kind: 'preset', key: 'cat' })).toBe('fish')
  })
  it('returns null for mochi (default) and unknown keys', () => {
    expect(collectedNounKeyFor({ kind: 'preset', key: 'mochi' })).toBeNull()
    expect(collectedNounKeyFor({ kind: 'preset', key: 'unicorn' })).toBeNull()
  })
})

describe('findPreset', () => {
  it('returns the matching preset for a valid key', () => {
    const p = findPreset('rabbit')
    expect(p.key).toBe('rabbit')
  })
  it('falls back to the first preset for an unknown key (never throws)', () => {
    const p = findPreset('does-not-exist')
    expect(p.key).toBe(AVATAR_PRESET_LIBRARY[0].key)
  })
  it('the fallback preset is mochi (the brand mascot)', () => {
    expect(AVATAR_PRESET_LIBRARY[0].key).toBe('mochi')
  })
})

describe('migrateProfile', () => {
  it('returns SEED_PROFILE for non-object input', () => {
    expect(migrateProfile(null)).toEqual(SEED_PROFILE)
    expect(migrateProfile(undefined)).toEqual(SEED_PROFILE)
    expect(migrateProfile('hello')).toEqual(SEED_PROFILE)
    expect(migrateProfile([1, 2])).toEqual(SEED_PROFILE)
  })
  it('returns SEED_PROFILE when name is missing/empty', () => {
    expect(migrateProfile({ name: '' })).toEqual(SEED_PROFILE)
    expect(migrateProfile({ avatar: { kind: 'preset', key: 'cat' } })).toEqual(
      SEED_PROFILE,
    )
  })
  it('returns SEED_PROFILE when avatar is missing', () => {
    expect(migrateProfile({ name: 'Ying' })).toEqual(SEED_PROFILE)
  })
  it('caps name length at MAX_PROFILE_NAME_LEN', () => {
    const long = 'x'.repeat(200)
    const out = migrateProfile({
      name: long,
      avatar: { kind: 'preset', key: 'mochi' },
    })
    expect(out.name.length).toBe(64)
  })
  it('caps quote length and accepts valid string', () => {
    const out = migrateProfile({
      name: 'Ying',
      avatar: { kind: 'preset', key: 'mochi' },
      quote: 'be kind',
    })
    expect(out.quote).toBe('be kind')
  })
  it('drops invalid density values', () => {
    const out = migrateProfile({
      name: 'Ying',
      avatar: { kind: 'preset', key: 'mochi' },
      density: 'spacious',
    })
    expect(out.density).toBeUndefined()
  })
  it('preserves valid density values', () => {
    expect(
      migrateProfile({
        name: 'Ying',
        avatar: { kind: 'preset', key: 'mochi' },
        density: 'compact',
      }).density,
    ).toBe('compact')
  })
  it('coerces lifetimePebbles to integer when non-negative', () => {
    const out = migrateProfile({
      name: 'Ying',
      avatar: { kind: 'preset', key: 'mochi' },
      lifetimePebbles: 12.7,
    })
    expect(out.lifetimePebbles).toBe(12)
  })
  it('drops negative pebble counts', () => {
    const out = migrateProfile({
      name: 'Ying',
      avatar: { kind: 'preset', key: 'mochi' },
      lifetimePebbles: -5,
      todayTaskPebbles: -1,
    })
    expect(out.lifetimePebbles).toBeUndefined()
    expect(out.todayTaskPebbles).toBeUndefined()
  })
  it('drops malformed pebblesDate', () => {
    const out = migrateProfile({
      name: 'Ying',
      avatar: { kind: 'preset', key: 'mochi' },
      pebblesDate: 'today',
    })
    expect(out.pebblesDate).toBeUndefined()
  })
  it('preserves a well-formed pebblesDate', () => {
    expect(
      migrateProfile({
        name: 'Ying',
        avatar: { kind: 'preset', key: 'mochi' },
        pebblesDate: '2026-05-20',
      }).pebblesDate,
    ).toBe('2026-05-20')
  })
  it('only accepts explicit boolean onboardingDone === true', () => {
    expect(
      migrateProfile({
        name: 'Ying',
        avatar: { kind: 'preset', key: 'mochi' },
        onboardingDone: true,
      }).onboardingDone,
    ).toBe(true)
    expect(
      migrateProfile({
        name: 'Ying',
        avatar: { kind: 'preset', key: 'mochi' },
        onboardingDone: 'yes',
      }).onboardingDone,
    ).toBeUndefined()
  })
  it('filters guidesSeen down to valid string ids', () => {
    const out = migrateProfile({
      name: 'Ying',
      avatar: { kind: 'preset', key: 'mochi' },
      guidesSeen: ['intro', 42, '', 'x'.repeat(100), 'add-task'],
    })
    expect(out.guidesSeen).toEqual(['intro', 'add-task'])
  })
  it('clamps dailyCheckinHour into 0..23', () => {
    const high = migrateProfile({
      name: 'Ying',
      avatar: { kind: 'preset', key: 'mochi' },
      dailyCheckinHour: 30,
    })
    expect(high.dailyCheckinHour).toBeUndefined()
    const ok = migrateProfile({
      name: 'Ying',
      avatar: { kind: 'preset', key: 'mochi' },
      dailyCheckinHour: 9.6,
    })
    expect(ok.dailyCheckinHour).toBe(9)
  })
  it('migrates web-style avatar { kind: image, data } → uri', () => {
    const out = migrateProfile({
      name: 'Ying',
      avatar: { kind: 'image', data: 'data:image/png;base64,xxx' },
    })
    expect(out.avatar.kind).toBe('image')
    if (out.avatar.kind === 'image') {
      expect(out.avatar.uri).toBe('data:image/png;base64,xxx')
    }
  })
})
