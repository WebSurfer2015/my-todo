/**
 * Pure display-label helpers shared by the compose / details / reminder
 * sheets and the AI field-suggestion pills. They used to be copy-pasted
 * per sheet and had drifted (a 90-minute repeat read "every 1h" in two
 * places and "every 1h 30m" in a third; "every 2 weeks" read "Weekly").
 *
 * No React, no platform deps. Localized words are injected via small
 * string tables (pass the matching slice of `t`); date/time formatting
 * uses the JS Intl built-ins with an optional `locale` (undefined = the
 * device default) and an optional `now` so tests are deterministic.
 */

import type { Recurrence, RecurrenceFreq, Reminder } from '../domain/types'
import { formatRecurrence } from './utils'

/** The `t.recurrence` slice: plain-frequency words. */
export interface RecurrenceFreqStrings {
  never: string
  daily: string
  weekly: string
  monthly: string
  yearly: string
}

export const DEFAULT_RECURRENCE_FREQ_STRINGS: RecurrenceFreqStrings = {
  never: 'Never',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

/** Formatting context for date/time labels. */
export interface LabelFormatOptions {
  /** BCP-47 locale; undefined = device default. */
  locale?: string
  /** "Now" for the same-year check; defaults to the current time. */
  now?: Date
}

/** Local `yyyy-mm-ddTHH:mm` (no timezone) — the shape reminders store in
 * `at` and timed due dates use. */
export function isoLocalDateTime(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${hh}:${mm}`
}

/** "Daily" / "Weekly" / … for a bare frequency; `'none'` → never. */
export function recurrenceFreqLabel(
  freq: 'none' | RecurrenceFreq,
  strings: RecurrenceFreqStrings = DEFAULT_RECURRENCE_FREQ_STRINGS,
): string {
  switch (freq) {
    case 'daily': return strings.daily
    case 'weekly': return strings.weekly
    case 'monthly': return strings.monthly
    case 'yearly': return strings.yearly
    default: return strings.never
  }
}

/** Short cadence label without the end date: the localized frequency word
 * for a plain every-1 rule, otherwise the full summary ("Every 2 weeks",
 * "Weekly · Mon, Wed"). */
export function recurrenceShortLabel(
  rec: Recurrence | undefined,
  strings: RecurrenceFreqStrings = DEFAULT_RECURRENCE_FREQ_STRINGS,
): string {
  if (!rec) return strings.never
  const hasWeekdays = !!rec.byWeekday && rec.byWeekday.length > 0
  if (hasWeekdays || (rec.interval ?? 1) > 1) return formatRecurrence(rec)
  return recurrenceFreqLabel(rec.freq, strings)
}

/** Parse a local 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm' (no timezone — read as
 * device-local, never UTC). Undefined when unparseable. */
function parseLocalISO(iso: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso)
  if (!m) return undefined
  const [, y, mo, d, hh, mm] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh ?? 0), Number(mm ?? 0))
  return Number.isNaN(date.valueOf()) ? undefined : date
}

/** Short date: "May 17" this year, "May 17, 2027" otherwise. Accepts a Date
 * or a local 'YYYY-MM-DD[THH:mm]' string (the time part is ignored);
 * an unparseable string is returned as-is. */
export function shortDate(input: Date | string, opts: LabelFormatOptions = {}): string {
  const d = typeof input === 'string' ? parseLocalISO(input) : input
  if (!d || Number.isNaN(d.valueOf())) return typeof input === 'string' ? input : ''
  const now = opts.now ?? new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString(opts.locale, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** Date with weekday: "Wed, Oct 21" this year, "Wed, Oct 21, 2027"
 * otherwise. Same inputs as shortDate (a Date or a local
 * 'YYYY-MM-DD[THH:mm]' string; an unparseable string is returned as-is). */
export function weekdayDate(input: Date | string, opts: LabelFormatOptions = {}): string {
  const d = typeof input === 'string' ? parseLocalISO(input) : input
  if (!d || Number.isNaN(d.valueOf())) return typeof input === 'string' ? input : ''
  const now = opts.now ?? new Date()
  return d.toLocaleDateString(opts.locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}

/** Time of day only: "9:00 AM". Accepts a Date or a date-time string (a
 * timezone-less 'YYYY-MM-DDTHH:mm' reads as device-local); an unparseable
 * string is returned as-is. */
export function timeOfDay(input: Date | string, opts: LabelFormatOptions = {}): string {
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.valueOf())) return typeof input === 'string' ? input : ''
  return d.toLocaleTimeString(opts.locale, { hour: 'numeric', minute: '2-digit' })
}

/** Cadence label plus " · ends <date>" when the rule has an end date. */
export function recurrenceLabel(
  rec: Recurrence | undefined,
  strings: RecurrenceFreqStrings = DEFAULT_RECURRENCE_FREQ_STRINGS,
  opts: LabelFormatOptions = {},
): string {
  const base = recurrenceShortLabel(rec, strings)
  const end = formatRepeatEnd(rec?.endDate, opts)
  return end ? `${base} · ends ${end}` : base
}

/** The "Repeat ends" value: shortDate of a rule's `endDate`, or undefined
 * when there is none (or it doesn't parse) — the caller shows its own
 * "No end" / "Never" copy. */
export function formatRepeatEnd(endDate: string | undefined, opts: LabelFormatOptions = {}): string | undefined {
  if (!endDate) return undefined
  const end = parseLocalISO(endDate)
  return end ? shortDate(end, opts) : undefined
}

/** Compact datetime: "May 17, 9:00 AM" (year added when not this year).
 * Unparseable input is returned as-is. */
export function formatDateTime(at: string, opts: LabelFormatOptions = {}): string {
  const d = new Date(at)
  if (Number.isNaN(d.valueOf())) return at
  return `${shortDate(d, opts)}, ${timeOfDay(d, opts)}`
}

/** Absolute calendar label for a confirm card: "Today" / "Tomorrow" /
 * "Fri, Oct 23" (year added when not this year), plus ", 9:00 AM" when the
 * value carries a time. Relative "in 4 days" reads badly after "Complete by".
 * Accepts 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm'; anything else is returned as-is. */
export function formatCalendarDate(iso: string, opts: LabelFormatOptions = {}): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso)
  if (!m) return iso
  const [, y, mo, d, hh, mm] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d))
  if (Number.isNaN(date.valueOf())) return iso
  const now = opts.now ?? new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round((date.valueOf() - startOfToday.valueOf()) / 86_400_000)
  const day =
    diffDays === 0
      ? 'Today'
      : diffDays === 1
        ? 'Tomorrow'
        : weekdayDate(date, { ...opts, now })
  if (hh === undefined) return day
  const time = timeOfDay(new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm)), opts)
  return `${day}, ${time}`
}

/** Compact interval: "30m", "1h", "1h 30m". */
export function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** One reminder: the datetime for a one-shot, "every 1h 30m[ until …]" for
 * a repeating one. Empty string when there's no reminder. */
export function formatReminder(
  reminder: Pick<Reminder, 'at' | 'intervalMinutes' | 'until'> | undefined,
  opts: LabelFormatOptions = {},
): string {
  if (!reminder?.at) return ''
  if (!reminder.intervalMinutes) return formatDateTime(reminder.at, opts)
  const cadence = formatInterval(reminder.intervalMinutes)
  return reminder.until
    ? `every ${cadence} until ${formatDateTime(reminder.until, opts)}`
    : `every ${cadence}`
}

/** Strings for the Remind-me row summary (`t.remindNone`,
 * `t.remindYourRemindersWithCount`). */
export interface ReminderSummaryStrings {
  none: string
  withCount: (n: number) => string
}

/** Remind-me row value: 0 → none, 1 → that reminder, N → "Your reminders (N)". */
export function reminderSummary(
  reminders: readonly Pick<Reminder, 'at' | 'intervalMinutes' | 'until'>[],
  strings: ReminderSummaryStrings,
  opts: LabelFormatOptions = {},
): string {
  if (reminders.length === 0) return strings.none
  if (reminders.length === 1) return formatReminder(reminders[0], opts)
  return strings.withCount(reminders.length)
}
