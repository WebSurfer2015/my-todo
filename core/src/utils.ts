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
  const d = new Date()
  const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 0 ? 0 : 7 - dow))
  return isoDate(d)
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface DateLabels {
  today?: string
  tomorrow?: string
  yesterday?: string
}

const MS_PER_DAY = 86_400_000

export function formatDisplayDate(iso: string, locale = 'default', labels?: DateLabels): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round((date.getTime() - startOfToday.getTime()) / MS_PER_DAY)

  if (diffDays === 0 && labels?.today) return labels.today
  if (diffDays === 1 && labels?.tomorrow) return labels.tomorrow
  if (diffDays === -1 && labels?.yesterday) return labels.yesterday
  if (diffDays > 1 && diffDays < 7) {
    return date.toLocaleString(locale, { weekday: 'long' })
  }
  if (diffDays < -1 && diffDays > -7) {
    return date.toLocaleString(locale, { weekday: 'long' })
  }

  const weekday = date.toLocaleString(locale, { weekday: 'short' })
  const month   = date.toLocaleString(locale, { month: 'short' })
  return y === now.getFullYear()
    ? `${weekday}, ${month} ${d}`
    : `${weekday}, ${month} ${d}, ${y}`
}
