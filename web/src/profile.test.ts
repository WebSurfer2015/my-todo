/**
 * Tests for core/src/profile.ts — avatar lookups and the
 * migrateProfile defensive parser.
 */
import { describe, expect, it } from 'vitest'
import {
  findPreset,
  migrateProfile,
  SEED_PROFILE,
  AVATAR_PRESET_LIBRARY,
} from '../../core/src/data/profile'

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
