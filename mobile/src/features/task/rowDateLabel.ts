import { dueDateOnly, formatDisplayDate, todayLocal } from '../../core-bindings/utils'
import { weekdayDate } from '../../../../core/src/logic/labels'

/**
 * A to-do / step date chip. A PAST date names the day it was for
 * ("Mon, Oct 5") — never a count of days behind ("12 days ago"), which reads
 * as a scoreboard for a carried-over item. Today / future keep the relative
 * label ("Today", "Tomorrow", "in 3 days"). Same rule as the parent row.
 */
export function rowDateLabel(iso: string, locale?: string, today: string = todayLocal()): string {
  const day = dueDateOnly(iso)
  return day < today ? weekdayDate(day, { locale }) : formatDisplayDate(iso, locale)
}

/** The Done bin's chip: a past completion names its day ("Done Mon, Oct 5"),
 * never "Done 12 days ago"; today reads "Done today". */
export function doneOnLabel(completionDate: string, locale?: string, today: string = todayLocal()): string {
  const day = dueDateOnly(completionDate)
  return day < today
    ? `Done ${weekdayDate(day, { locale })}`
    : `Done ${formatDisplayDate(completionDate, locale).toLowerCase()}`
}
