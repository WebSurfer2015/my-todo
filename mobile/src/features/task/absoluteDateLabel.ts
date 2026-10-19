import { formatDateTime } from '../../../../core/src/logic/labels'

/**
 * Absolute label for a picked date ("Complete by", "Repeat ends"):
 * "May 17" this year, "May 17, 2027" otherwise, plus ", 9:00 AM" when the
 * value carries a time. Relative wording ("in 2 days") reads wrong for a
 * date the user explicitly picked. Shared by the compose + details sheets
 * so the two can't drift.
 *
 * Timed values go through core's `formatDateTime`. The date-only branch is
 * a thin local wrapper matching core's (currently private) `shortDate` —
 * swap it for the core export once that lands. It parses the parts by hand
 * because `new Date('YYYY-MM-DD')` is UTC midnight (the previous day in the
 * Americas).
 */
export function absoluteDateLabel(iso: string, locale?: string): string {
  if (iso.includes('T')) return formatDateTime(iso, { locale })
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}
