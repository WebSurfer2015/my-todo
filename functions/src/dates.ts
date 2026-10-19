/**
 * Calendar-validating ISO date helpers. PURE (no firebase-admin).
 *
 * The model (and the client) send local dates as plain strings. A shape-only
 * regex accepted impossible values — "2026-02-31", "2026-13-01",
 * "2026-06-07T25:99" — which the client then parsed into a silently-rolled
 * date (Feb 31 → Mar 3) or an Invalid Date. Every date that crosses the
 * server boundary goes through one of these instead.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

function isRealDay(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false
  // Day 0 of the next month = last day of month m (UTC, so no DST quirks).
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return d <= daysInMonth
}

/** True for a real calendar date in strict `yyyy-mm-dd` form. */
export function isValidIsoDate(s: unknown): s is string {
  if (typeof s !== 'string') return false
  const m = DATE_RE.exec(s)
  return !!m && isRealDay(Number(m[1]), Number(m[2]), Number(m[3]))
}

/** True for a real local datetime in strict `yyyy-mm-ddThh:mm` form (24h,
 * no seconds, no zone — a trailing Z/offset would be read as UTC). */
export function isValidIsoDateTime(s: unknown): s is string {
  if (typeof s !== 'string') return false
  const m = DATE_TIME_RE.exec(s)
  if (!m) return false
  const hh = Number(m[4])
  const mm = Number(m[5])
  return isRealDay(Number(m[1]), Number(m[2]), Number(m[3])) && hh <= 23 && mm <= 59
}

/** A to-do due date: either a date (`yyyy-mm-dd`) or a datetime
 * (`yyyy-mm-ddThh:mm`), both calendar-checked. */
export function isValidDueDate(s: unknown): s is string {
  return isValidIsoDate(s) || isValidIsoDateTime(s)
}
