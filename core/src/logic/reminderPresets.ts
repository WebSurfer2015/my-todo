// Reminder quick picks + the Gentle nudge time. Pure (no platform deps):
// the ReminderSheet renders the presets, the notification scheduler uses
// nudgeAtFor. All times are local `yyyy-mm-ddTHH:mm` strings — the shape
// reminders store in `at`.

import { dueDateOnly, isoDate } from './utils'

export type ReminderPresetKey =
  | 'atTime'
  | 'hourBefore'
  | 'morningOf'
  | 'dayBefore'
  | 'laterToday'
  | 'tomorrowMorning'

export interface ReminderPreset {
  key: ReminderPresetKey
  at: string
}

const MORNING = '09:00'
const EVENING = '18:00'

function localStamp(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${isoDate(d)}T${hh}:${mm}`
}

function dayShift(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T00:00:00`)
  d.setDate(d.getDate() + days)
  return isoDate(d)
}

/**
 * The presets that make sense for this to-do, earliest-first, future only:
 * - due WITH a time: At the time · 1 hour before · Morning of (when the due
 *   time is after 9:00) · Day before (6 PM)
 * - due date only: Morning of (9:00) · Day before (6 PM)
 * - no due date: Later today (6 PM, while it's still before 6) · Tomorrow
 *   morning (9:00)
 */
export function reminderPresetsFor(dueDate: string | undefined, now: Date = new Date()): ReminderPreset[] {
  const nowStamp = localStamp(now)
  const out: ReminderPreset[] = []
  const day = dueDateOnly(dueDate)
  if (!day) {
    const today = isoDate(now)
    out.push({ key: 'laterToday', at: `${today}T${EVENING}` })
    out.push({ key: 'tomorrowMorning', at: `${dayShift(today, 1)}T${MORNING}` })
  } else {
    const t = (dueDate ?? '').indexOf('T')
    const time = t === -1 ? '' : (dueDate ?? '').slice(t + 1, t + 6)
    out.push({ key: 'dayBefore', at: `${dayShift(day, -1)}T${EVENING}` })
    if (!time || time > MORNING) out.push({ key: 'morningOf', at: `${day}T${MORNING}` })
    if (time) {
      const due = new Date(`${day}T${time}:00`)
      const hourBefore = new Date(due.valueOf() - 60 * 60_000)
      out.push({ key: 'hourBefore', at: localStamp(hourBefore) })
      out.push({ key: 'atTime', at: `${day}T${time}` })
    }
  }
  return out.filter((p) => p.at > nowStamp).sort((a, b) => a.at.localeCompare(b.at))
}

/**
 * Gentle nudge: ONE quiet follow-up at 9:00 the morning after the to-do's
 * last one-shot reminder, if it's still open then. Repeating reminders
 * already re-notify, so they get no nudge. Null when there's nothing to
 * follow up (no one-shot reminder, or the nudge time has passed).
 */
export function nudgeAtFor(
  reminders: ReadonlyArray<{ at: string; intervalMinutes?: number }> | undefined,
  now: Date = new Date(),
): string | null {
  const oneShots = (reminders ?? []).filter((r) => r.at && !r.intervalMinutes)
  if (oneShots.length === 0 || (reminders ?? []).some((r) => r.intervalMinutes)) return null
  const last = oneShots.map((r) => r.at).sort().pop()!
  const at = `${dayShift(dueDateOnly(last), 1)}T${MORNING}`
  return at > localStamp(now) ? at : null
}
