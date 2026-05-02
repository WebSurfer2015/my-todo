export function todayLocal(): string {
  const d = new Date()
  return isoDate(d)
}

export function endOfWeekLocal(): string {
  const d = new Date()
  const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 0 ? 0 : 7 - dow))
  return isoDate(d)
}

export function endOfMonthLocal(): string {
  const d = new Date()
  return isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatDisplayDate(iso: string, locale = 'default'): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const weekday = date.toLocaleString(locale, { weekday: 'short' })
  const month   = date.toLocaleString(locale, { month: 'short' })
  const thisYear = new Date().getFullYear()
  return y === thisYear
    ? `${weekday}, ${month} ${d}`
    : `${weekday}, ${month} ${d}, ${y}`
}
