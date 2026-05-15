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
