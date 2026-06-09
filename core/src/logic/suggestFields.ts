/**
 * Pure helpers for the AI "suggest fields" flow — kept in core so both the
 * mobile adapter and the test suite can exercise them without pulling in
 * any platform (Firebase / RN) deps.
 */

export interface SuggestedReminder {
  at: string
  intervalMinutes?: number
  until?: string
}

/**
 * Guard against the model mapping a recurrence cadence into the reminder as
 * a long repeating interval — e.g. "remind at 9am" on a Mon/Wed/Fri todo
 * coming back as `{intervalMinutes: 10080}` ("every 168 hours"). When a
 * recurrence is present AND the reminder repeats on a daily-or-longer
 * cadence (>= 1440 min), drop the interval and keep just the fixed `at`
 * time: the recurrence already repeats the todo, and the app rebases the
 * reminder per occurrence. Sub-daily nudges (< 1 day) are left intact —
 * those are legitimate within a single occurrence.
 */
export function normalizeSuggestedReminder(
  recurrence: unknown | null | undefined,
  reminder: SuggestedReminder | null | undefined,
): SuggestedReminder | null {
  if (!reminder) return null
  if (recurrence && reminder.intervalMinutes && reminder.intervalMinutes >= 1440) {
    return { at: reminder.at }
  }
  return reminder
}
