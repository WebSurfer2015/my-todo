/**
 * Globally-unique id generator. Prefers `crypto.randomUUID()` (RFC 4122 v4)
 * which is available in modern browsers and React Native via Hermes (RN
 * 0.79+). Falls back to a time-prefixed random string for older runtimes —
 * still collision-resistant under Phase-2 cross-device sync.
 */
export function genUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // Time-prefix gives ordering; 8 random base-36 chars keep collisions
  // negligible for our scale.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`
}

export function todayLocal(): string {
  return isoDate(new Date())
}

export function endOfWeekLocal(): string {
  // Last day of the current Sun-Sat week. On Sunday, "this week" runs Sun-Sat,
  // so we still need the upcoming Saturday — not today. Without the +6 branch,
  // every Sunday's `week` bucket would be empty (todos for Mon-Sat fall into
  // `upcoming` because their date > today).
  const d = new Date()
  const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 0 ? 6 : 6 - dow))
  return isoDate(d)
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Advance an ISO date string by one recurrence period. Used to roll a
 * recurring todo forward when it's marked done.
 *
 * Supports:
 *   - simple daily/weekly/monthly/yearly (interval-based)
 *   - weekly with byWeekday: next listed weekday after current
 *   - monthly with byWeekday + bySetPos: e.g. "2nd & 4th Thursday"
 */
export function nextOccurrence(
  iso: string,
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly',
  interval = 1,
  byWeekday?: number[],
  bySetPos?: number[],
): string {
  const [y, m, d] = iso.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  const n = Math.max(1, interval)

  // Weekly with specific weekdays: find next listed weekday strictly after start
  if (freq === 'weekly' && byWeekday && byWeekday.length > 0) {
    const set = new Set(byWeekday)
    const probe = new Date(start)
    for (let i = 1; i <= 14 * n; i++) {
      probe.setDate(probe.getDate() + 1)
      if (set.has(probe.getDay())) return isoDate(probe)
    }
    // Fallback (shouldn't hit): bump by interval weeks
    start.setDate(start.getDate() + 7 * n)
    return isoDate(start)
  }

  // Monthly with byWeekday + bySetPos: find next 2nd/4th Thursday etc.
  if (freq === 'monthly' && byWeekday && byWeekday.length > 0) {
    const weekdaySet = new Set(byWeekday)
    const positions = bySetPos && bySetPos.length > 0 ? bySetPos : [1, 2, 3, 4, 5]
    // Search current month, then advance month-by-month until we find one strictly after start.
    let monthCursor = new Date(start.getFullYear(), start.getMonth(), 1)
    for (let iter = 0; iter < 36; iter++) {
      const candidates: Date[] = []
      const year = monthCursor.getFullYear()
      const month = monthCursor.getMonth()
      // Build all matching weekday occurrences in this month
      const byWeekdayHits: Record<number, Date[]> = {}
      const lastDay = new Date(year, month + 1, 0).getDate()
      for (let day = 1; day <= lastDay; day++) {
        const dt = new Date(year, month, day)
        const wd = dt.getDay()
        if (!weekdaySet.has(wd)) continue
        ;(byWeekdayHits[wd] ??= []).push(dt)
      }
      // Pick by position
      for (const wd of byWeekday) {
        const list = byWeekdayHits[wd] ?? []
        for (const pos of positions) {
          if (pos === -1) {
            const last = list[list.length - 1]
            if (last) candidates.push(last)
          } else {
            const hit = list[pos - 1]
            if (hit) candidates.push(hit)
          }
        }
      }
      candidates.sort((a, b) => a.getTime() - b.getTime())
      const after = candidates.find((c) => c.getTime() > start.getTime())
      if (after) return isoDate(after)
      // Advance by interval months
      monthCursor = new Date(year, month + n, 1)
    }
    // Fallback: simple monthly bump
    start.setMonth(start.getMonth() + n)
    return isoDate(start)
  }

  // Simple frequency-based advance
  switch (freq) {
    case 'daily':   start.setDate(start.getDate() + n); break
    case 'weekly':  start.setDate(start.getDate() + 7 * n); break
    case 'monthly': start.setMonth(start.getMonth() + n); break
    case 'yearly':  start.setFullYear(start.getFullYear() + n); break
  }
  return isoDate(start)
}

/**
 * Returns true if `iso` is a valid occurrence date for the given recurrence
 * pattern. Used both to decide whether to include the start date in an
 * expansion and to validate manually picked dates.
 */
function matchesRecurrence(
  iso: string,
  rec: {
    freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
    byWeekday?: number[]
    bySetPos?: number[]
  },
): boolean {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)

  if (rec.freq === 'weekly' && rec.byWeekday && rec.byWeekday.length > 0) {
    return rec.byWeekday.includes(date.getDay())
  }

  if (rec.freq === 'monthly' && rec.byWeekday && rec.byWeekday.length > 0) {
    if (!rec.byWeekday.includes(date.getDay())) return false
    if (!rec.bySetPos || rec.bySetPos.length === 0) return true
    const dom = date.getDate()
    const positionInMonth = Math.ceil(dom / 7) // 1..5
    if (rec.bySetPos.includes(positionInMonth)) return true
    if (rec.bySetPos.includes(-1)) {
      const lastDay = new Date(y, m, 0).getDate()
      if (lastDay - dom < 7) return true
    }
    return false
  }

  // Simple freq with no day filter — any anchor date matches.
  return true
}

/**
 * Expand a recurrence definition into a list of ISO dates from `start` to
 * `end` inclusive. Capped at MAX_INSTANCES so a misclicked "daily for 10
 * years" doesn't blow up the task list.
 *
 * If `start` itself doesn't match the recurrence pattern (e.g. weekly with
 * byWeekday=[Tuesday] but start is a Monday), the first occurrence is the
 * next matching date strictly after `start`.
 */
export const MAX_RECURRENCE_INSTANCES = 365

export function expandRecurrence(
  start: string,
  end: string,
  rec: {
    freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
    interval?: number
    byWeekday?: number[]
    bySetPos?: number[]
  },
): string[] {
  if (end < start) return []
  const interval = rec.interval ?? 1
  const dates: string[] = []

  // First date — either start itself (if it matches) or the next valid date.
  let cursor: string
  if (matchesRecurrence(start, rec)) {
    cursor = start
  } else {
    cursor = nextOccurrence(start, rec.freq, interval, rec.byWeekday, rec.bySetPos)
  }

  while (cursor <= end && dates.length < MAX_RECURRENCE_INSTANCES) {
    dates.push(cursor)
    cursor = nextOccurrence(cursor, rec.freq, interval, rec.byWeekday, rec.bySetPos)
  }

  return dates
}

/** Friendly summary like "Every Monday" or "2nd & 4th Thursday". */
export function formatRecurrence(rec: {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval?: number
  byWeekday?: number[]
  bySetPos?: number[]
}): string {
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const POS_LABELS: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', [-1]: 'Last' }
  const interval = rec.interval ?? 1
  const everyN = interval === 1 ? 'every' : `every ${interval}`
  if (rec.freq === 'weekly' && rec.byWeekday && rec.byWeekday.length > 0) {
    const days = rec.byWeekday.slice().sort().map((w) => WEEKDAYS[w]).join(', ')
    return `Weekly · ${days}`
  }
  if (rec.freq === 'monthly' && rec.byWeekday && rec.byWeekday.length > 0) {
    const days = rec.byWeekday.slice().sort().map((w) => WEEKDAYS[w]).join(', ')
    const positions = rec.bySetPos && rec.bySetPos.length > 0
      ? rec.bySetPos.slice().sort((a, b) => a - b).map((p) => POS_LABELS[p] ?? `${p}`).join(' & ')
      : ''
    return positions ? `Monthly · ${positions} ${days}` : `Monthly · ${days}`
  }
  switch (rec.freq) {
    case 'daily':   return interval === 1 ? 'Daily'   : `Every ${interval} days`
    case 'weekly':  return interval === 1 ? 'Weekly'  : `Every ${interval} weeks`
    case 'monthly': return interval === 1 ? 'Monthly' : `Every ${interval} months`
    case 'yearly':  return interval === 1 ? 'Yearly'  : `Every ${interval} years`
  }
  // Unreachable; keeps `everyN` referenced for future use.
  return everyN
}

/**
 * Tactile reassurance: a short, gentle vibration for completing checklist
 * actions. No-op when navigator.vibrate isn't available (most desktop
 * browsers, iOS Safari). Defaults to 12ms — barely perceptible, just enough
 * to feel grounded.
 */
export function vibrate(ms = 12): void {
  const n = (globalThis as { navigator?: { vibrate?: (pattern: number) => boolean } }).navigator
  try { n?.vibrate?.(ms) } catch { /* ignore */ }
}

export interface DateLabels {
  today?: string
  tomorrow?: string
  yesterday?: string
}

const MS_PER_DAY = 86_400_000

/**
 * Renders "just now" / "2 min ago" / "12:14 PM" depending on how stale the
 * timestamp is. Used by the auto-save indicator — anxiety-friendly, gives the
 * user a clear, gentle confirmation that work was saved.
 */
export function formatSavedAt(ms: number, locale = 'default', now = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - ms) / 1000))
  if (diffSec < 30) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin === 1) return '1 min ago'
  if (diffMin < 60) return `${diffMin} min ago`
  return new Date(ms).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
}

/**
 * Relative-time date label: "Today" / "Tomorrow" / "Yesterday" / "in 3 days" /
 * "5 days ago" / "in 2 months" / "1 month ago" / "in 1 year" / "2 years ago".
 * `labels` overrides for the today/tomorrow/yesterday cases when provided.
 * `locale` is currently unused — kept for forward-compat with localized strings.
 */
export function formatDisplayDate(iso: string, _locale = 'default', labels?: DateLabels): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round((date.getTime() - startOfToday.getTime()) / MS_PER_DAY)

  if (diffDays === 0) return labels?.today ?? 'Today'
  if (diffDays === 1) return labels?.tomorrow ?? 'Tomorrow'
  if (diffDays === -1) return labels?.yesterday ?? 'Yesterday'

  const abs = Math.abs(diffDays)
  if (abs <= 30) {
    return diffDays > 0 ? `in ${abs} days` : `${abs} days ago`
  }
  if (abs <= 364) {
    const months = Math.round(abs / 30)
    const unit = months === 1 ? 'month' : 'months'
    return diffDays > 0 ? `in ${months} ${unit}` : `${months} ${unit} ago`
  }
  const years = Math.round(abs / 365)
  const yu = years === 1 ? 'year' : 'years'
  return diffDays > 0 ? `in ${years} ${yu}` : `${years} ${yu} ago`
}
