import { formatDateTime, shortDate } from '../../../../core/src/logic/labels'

/**
 * Absolute label for a picked date ("Complete by", "Repeat ends"):
 * "May 17" this year, "May 17, 2027" otherwise, plus ", 9:00 AM" when the
 * value carries a time. Relative wording ("in 2 days") reads wrong for a
 * date the user explicitly picked. Shared by the compose + details sheets
 * so the two can't drift; both formats come from core labels.
 */
export function absoluteDateLabel(iso: string, locale?: string): string {
  return iso.includes('T') ? formatDateTime(iso, { locale }) : shortDate(iso, { locale })
}
