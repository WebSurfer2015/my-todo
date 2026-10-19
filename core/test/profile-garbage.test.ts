import { describe, it, expect } from 'vitest'
import { migrateProfile, SEED_PROFILE, type Profile } from '../src/data/profile'

/**
 * migrateProfile reads untrusted storage (cloud doc / AsyncStorage). Every
 * field must come back well-typed or undefined, whatever garbage it gets.
 */
const BASE = { name: 'Ana', avatar: { kind: 'preset', key: 'mochi' } }
const read = (extra: Record<string, unknown>): Profile => migrateProfile({ ...BASE, ...extra })

describe('migrateProfile — unusable docs fall back to the seed', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['number', 42],
    ['string', 'profile'],
    ['array', [BASE]],
    ['missing name', { avatar: BASE.avatar }],
    ['numeric name', { name: 7, avatar: BASE.avatar }],
    ['missing avatar', { name: 'Ana' }],
    ['avatar of unknown kind', { name: 'Ana', avatar: { kind: 'svg', data: '<svg/>' } }],
    ['image avatar without uri', { name: 'Ana', avatar: { kind: 'image', uri: '' } }],
  ])('%s → SEED_PROFILE', (_label, raw) => {
    expect(migrateProfile(raw)).toBe(SEED_PROFILE)
  })
})

describe('migrateProfile — field-level garbage drops to undefined', () => {
  it.each<[string, Record<string, unknown>, keyof Profile]>([
    ['reduceMotion as string', { reduceMotion: 'yes' }, 'reduceMotion'],
    ['view outside the enum', { view: 'grid' }, 'view'],
    ['theme as number', { theme: 42 }, 'theme'],
    ['unknown theme', { theme: 'neon' }, 'theme'],
    ['quoteMode outside the enum', { quoteMode: 'random' }, 'quoteMode'],
    ['unknown lastComposeMode', { lastComposeMode: 'voice' }, 'lastComposeMode'],
    ['lastComposeMode as boolean', { lastComposeMode: true }, 'lastComposeMode'],
    ['dailyCheckinHour NaN', { dailyCheckinHour: NaN }, 'dailyCheckinHour'],
    ['dailyCheckinHour Infinity', { dailyCheckinHour: Infinity }, 'dailyCheckinHour'],
    ['dailyCheckinHour 24', { dailyCheckinHour: 24 }, 'dailyCheckinHour'],
    ['dailyCheckinHour negative', { dailyCheckinHour: -1 }, 'dailyCheckinHour'],
    ['dailyCheckinHour as string', { dailyCheckinHour: '9' }, 'dailyCheckinHour'],
    ['quoteShuffle index NaN', { quoteShuffle: { date: '2026-10-19', index: NaN } }, 'quoteShuffle'],
    ['quoteShuffle index Infinity', { quoteShuffle: { date: '2026-10-19', index: Infinity } }, 'quoteShuffle'],
    ['quoteShuffle bad date', { quoteShuffle: { date: 'today', index: 1 } }, 'quoteShuffle'],
    ['pinnedFilters as object', { pinnedFilters: { 0: ['done'] } }, 'pinnedFilters'],
    ['pinnedFilters of junk sets', { pinnedFilters: [['nope'], [3], 'done'] }, 'pinnedFilters'],
    ['homeStatTiles as string', { homeStatTiles: 'done' }, 'homeStatTiles'],
    ['statuses of unknown ids', { statuses: [{ id: 'later' }, null, 5] }, 'statuses'],
    ['priorities of unknown ids', { priorities: [{ id: 'urgent' }] }, 'priorities'],
    ['groceryStores of non-strings', { groceryStores: [1, null, ' '] }, 'groceryStores'],
    ['onboardingDone as string', { onboardingDone: 'true' }, 'onboardingDone'],
    ['firstName empty', { firstName: '' }, 'firstName'],
  ])('%s', (_label, extra, field) => {
    expect(read(extra)[field]).toBeUndefined()
  })

  it('keeps valid values of the same fields', () => {
    const p = read({
      dailyCheckinHour: 7.9,
      quoteShuffle: { date: '2026-10-19', index: -3 },
      lastComposeMode: 'mochi',
      theme: 'sky',
    })
    expect(p.dailyCheckinHour).toBe(7)
    expect(p.quoteShuffle).toEqual({ date: '2026-10-19', index: 0 })
    expect(p.lastComposeMode).toBe('mochi')
    expect(p.theme).toBe('sky')
  })
})

describe('migrateProfile — oversized input is capped', () => {
  it.each<[string, Record<string, unknown>, (p: Profile) => number, number]>([
    ['name', { name: 'x'.repeat(10_000) }, (p) => p.name.length, 64],
    ['quote', { quote: 'q'.repeat(10_000) }, (p) => p.quote!.length, 240],
    [
      'pinnedFilters (12 sets)',
      { pinnedFilters: Array.from({ length: 500 }, (_, i) => [`cat:c${i}`]) },
      (p) => p.pinnedFilters!.length,
      12,
    ],
    [
      'homeStatTiles (12 tiles)',
      { homeStatTiles: Array.from({ length: 500 }, (_, i) => `cat:c${i}`) },
      (p) => p.homeStatTiles!.length,
      12,
    ],
    [
      'groceryStores (30)',
      { groceryStores: Array.from({ length: 500 }, (_, i) => `Store ${i}`) },
      (p) => p.groceryStores!.length,
      30,
    ],
    [
      'guidesSeen (64)',
      { guidesSeen: Array.from({ length: 5_000 }, (_, i) => `guide-${i}`) },
      (p) => p.guidesSeen!.length,
      64,
    ],
  ])('%s', (_label, extra, measure, max) => {
    expect(measure(read(extra))).toBe(max)
  })

  it('rejects an image avatar over the size cap', () => {
    expect(migrateProfile({ name: 'Ana', avatar: { kind: 'image', uri: 'x'.repeat(1_000_001) } })).toBe(SEED_PROFILE)
  })

  it('dedupes guidesSeen', () => {
    expect(read({ guidesSeen: ['a', 'a', 'b', 'a'] }).guidesSeen).toEqual(['a', 'b'])
  })
})
