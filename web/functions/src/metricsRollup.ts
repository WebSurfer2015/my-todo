/**
 * P0 Tier 2 — aggregate activation / retention roll-up (docs/MEASUREMENT-PLAN.md).
 *
 * PURE: takes one anonymous row per user (dates only — no uid, no content) and
 * returns COUNTS. The scheduled job (metricsRollupJob.ts) reads the inputs
 * server-side and writes only this output to metrics/{day}; nothing per-user
 * is ever stored. No firebase-admin import, so it's unit-testable.
 *
 * Inputs per user:
 *  - signupDay:      Firebase Auth account creation (UTC day). Authoritative —
 *                    profile.createdAt is stamped lazily at the first open after
 *                    the signals shipped, so it would bunch every pre-existing
 *                    user into one fake "signup" day.
 *  - lastActiveDate: profile.lastActiveDate (user-LOCAL day, stamped at open).
 *  - activatedDay:   day of profile.activatedAt (first open with a completed
 *                    to-do — so activation lands on the next open, not the
 *                    exact completion moment).
 * Mixed UTC/local days make each boundary fuzzy by ±1 day; fine for trends.
 *
 * Retention is "returned on or after day N" (unbounded retention): with a
 * single lastActiveDate we can tell whether a user came back at least N days
 * after signup, not every day they were active.
 */

export interface RollupUser {
  signupDay: string // YYYY-MM-DD
  lastActiveDate?: string // YYYY-MM-DD
  activatedDay?: string // YYYY-MM-DD
}

export interface CohortMetrics {
  /** The signup day of this cohort. */
  cohortDay: string
  size: number
  /** Came back on or after cohortDay + N. */
  returned: number
  /** Activated (completed a to-do) by cohortDay + N. */
  activated: number
}

export interface DailyMetrics {
  day: string
  users: { total: number; activated: number }
  signups: number
  /** Users whose last open is on/after the start of each window ending `day`. */
  active: { d1: number; d7: number; d30: number }
  cohorts: { d1: CohortMetrics; d7: CohortMetrics; d30: CohortMetrics }
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** YYYY-MM-DD ± n days, computed in UTC so DST never skews it. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** ISO timestamp / date string → YYYY-MM-DD (UTC), or undefined if unusable. */
export function toDay(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  if (DAY_RE.test(raw)) return raw
  const t = Date.parse(raw)
  return Number.isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10)
}

function cohort(users: RollupUser[], cohortDay: string, n: number): CohortMetrics {
  const members = users.filter((u) => u.signupDay === cohortDay)
  const by = addDays(cohortDay, n)
  return {
    cohortDay,
    size: members.length,
    returned: members.filter((u) => !!u.lastActiveDate && u.lastActiveDate >= by).length,
    activated: members.filter((u) => !!u.activatedDay && u.activatedDay <= by).length,
  }
}

/** Aggregate counts for `day` (normally yesterday, UTC). Users who signed up
 * after `day` are excluded so a late run can't leak tomorrow into today. */
export function rollUpMetrics(all: RollupUser[], day: string): DailyMetrics {
  const users = all.filter((u) => u.signupDay <= day)
  const activeSince = (start: string) =>
    users.filter((u) => !!u.lastActiveDate && u.lastActiveDate >= start).length
  return {
    day,
    users: {
      total: users.length,
      activated: users.filter((u) => !!u.activatedDay && u.activatedDay <= day).length,
    },
    signups: users.filter((u) => u.signupDay === day).length,
    active: {
      d1: activeSince(day),
      d7: activeSince(addDays(day, -6)),
      d30: activeSince(addDays(day, -29)),
    },
    cohorts: {
      d1: cohort(users, addDays(day, -1), 1),
      d7: cohort(users, addDays(day, -7), 7),
      d30: cohort(users, addDays(day, -30), 30),
    },
  }
}
