/**
 * Tests for the pure Tier 2 roll-up. The scheduled job's Auth/Firestore reads
 * are integration territory; these cover what gets counted.
 */
import { describe, expect, it } from 'vitest'
import { addDays, rollUpMetrics, toDay, type RollupUser } from './metricsRollup'

const DAY = '2026-10-17'

describe('addDays / toDay', () => {
  it('crosses month + year boundaries in UTC', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09') // US DST start
  })
  it('normalizes ISO timestamps, passes days through, rejects junk', () => {
    expect(toDay('2026-10-17T23:30:00.000Z')).toBe('2026-10-17')
    expect(toDay('Sat, 17 Oct 2026 08:00:00 GMT')).toBe('2026-10-17') // Auth creationTime format
    expect(toDay('2026-10-17')).toBe('2026-10-17')
    expect(toDay('nope')).toBeUndefined()
    expect(toDay(undefined)).toBeUndefined()
  })
})

describe('rollUpMetrics', () => {
  const users: RollupUser[] = [
    // signed up yesterday-of-DAY, came back on DAY, activated
    { signupDay: '2026-10-16', lastActiveDate: '2026-10-17', activatedDay: '2026-10-16' },
    // signed up yesterday-of-DAY, never came back
    { signupDay: '2026-10-16', lastActiveDate: '2026-10-16' },
    // D7 cohort (10-10): one returned a week later, one lapsed
    { signupDay: '2026-10-10', lastActiveDate: '2026-10-17', activatedDay: '2026-10-12' },
    { signupDay: '2026-10-10', lastActiveDate: '2026-10-11', activatedDay: '2026-10-11' },
    // D30 cohort (09-17), active 20 days ago
    { signupDay: '2026-09-17', lastActiveDate: '2026-09-27' },
    // signed up ON the day
    { signupDay: '2026-10-17', lastActiveDate: '2026-10-17' },
    // pre-signals user: no profile signals at all
    { signupDay: '2026-01-05' },
    // future signup (late run) — must be excluded entirely
    { signupDay: '2026-10-18', lastActiveDate: '2026-10-18', activatedDay: '2026-10-18' },
  ]
  const m = rollUpMetrics(users, DAY)

  it('counts totals, signups and activation as of the day', () => {
    expect(m.day).toBe(DAY)
    expect(m.users.total).toBe(7)
    expect(m.users.activated).toBe(3)
    expect(m.signups).toBe(1)
  })

  it('counts actives over 1 / 7 / 30-day windows', () => {
    expect(m.active.d1).toBe(3) // 10-17 x3
    expect(m.active.d7).toBe(5) // + 10-16, 10-11
    expect(m.active.d30).toBe(6) // + 09-27
  })

  it('computes D1 / D7 / D30 cohort return + activation', () => {
    expect(m.cohorts.d1).toEqual({ cohortDay: '2026-10-16', size: 2, returned: 1, activated: 1 })
    expect(m.cohorts.d7).toEqual({ cohortDay: '2026-10-10', size: 2, returned: 1, activated: 2 })
    expect(m.cohorts.d30).toEqual({ cohortDay: '2026-09-17', size: 1, returned: 0, activated: 0 })
  })

  it('mochi defaults to zeros when no one used it', () => {
    expect(m.mochi).toEqual({ users: 0, conversations: 0, turns: 0, ceilingHits: 0 })
  })

  it('output carries counts only — no per-user data', () => {
    const json = JSON.stringify(m)
    expect(json).not.toMatch(/uid|lastActiveDate|activatedDay|mochiDays/)
  })
})

describe('rollUpMetrics — mochi', () => {
  const md = (date: string, conversations: number, turns: number, ceilingHit = false) => ({
    date,
    conversations,
    turns,
    ceilingHit,
  })
  const users: RollupUser[] = [
    // used Mochi on DAY (2 convos, 5 turns) and the day before
    { signupDay: '2026-10-01', mochiDays: [md('2026-10-18', 1, 1), md(DAY, 2, 5)] },
    // hit the ceiling on DAY after some use
    { signupDay: '2026-10-01', mochiDays: [md(DAY, 15, 20, true)] },
    // rejected on first try on DAY (no allowed turn) — ceiling hit, not a user
    { signupDay: '2026-10-01', mochiDays: [md(DAY, 0, 0, true)] },
    // used Mochi only on another day
    { signupDay: '2026-10-01', mochiDays: [md('2026-10-16', 3, 3, true)] },
    // never used Mochi
    { signupDay: '2026-10-01' },
    // future signup — excluded
    { signupDay: '2026-10-18', mochiDays: [md(DAY, 9, 9, true)] },
  ]
  const m = rollUpMetrics(users, DAY)

  it('counts users, conversations, turns and ceiling hits for the day only', () => {
    expect(m.mochi).toEqual({ users: 2, conversations: 17, turns: 25, ceilingHits: 2 })
  })
})
