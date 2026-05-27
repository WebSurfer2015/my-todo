import React, { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Sparkles, Plus, Repeat, Bell } from 'lucide-react-native'
import { SuggestFieldsResult } from '../aiInfer'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'
import { CategoryDef, categoryLabel } from '../categories'
import { Priority, RecurrenceFreq } from '../types'
import { formatDisplayDate, formatRecurrence } from '../utils'
import CategoryIcon from './CategoryIcon'
import PriorityDot from './PriorityDot'
import MochiThinking from './MochiThinking'
import { useTodoFieldSuggestions } from './useTodoFieldSuggestions'

/**
 * Phase 2 #6: ambient suggestions while typing a to-do title.
 *
 * The hook owns the request lifecycle (debounce, dedupe, race
 * protection). The component is a pure presentational chip row. Both
 * live in one file because the hook is used in exactly one place
 * (ComposeSheet) and isn't worth a separate module.
 *
 * Token discipline: 800ms debounce, 3-char minimum, dedupe by
 * trimmed-text, profile.agentEnabled gate, single in-flight via
 * sequence number. With aggressive prompt caching (configured
 * server-side via cacheableSystemModes in web/functions/src/aiInfer.ts),
 * a typical session is ~$0.005/user.
 */

// Hook + its helpers moved to ./useTodoFieldSuggestions so they can be
// unit-tested without pulling in the React Native pill UI. Re-export
// preserves the import path existing callers (ComposeSheet, etc.) use.
export { useTodoFieldSuggestions }

interface RowProps {
  suggestions: SuggestFieldsResult | null
  thinking: boolean
  categories: CategoryDef[]
  /** Current compose-form values. A suggested value that already
   * equals the form's current value is suppressed — no point
   * offering a pill that would no-op on tap. */
  currentCategory: string
  currentPriority: Priority
  currentDueDate: string
  /** Undefined → no recurrence currently. The pill is suppressed
   * when the suggested freq+endDate already matches this. */
  currentRecurrenceFreq?: RecurrenceFreq
  /** Current recurrence endDate (ISO yyyy-mm-dd), if set.
   * Combined with freq for the no-op compare. */
  currentRecurrenceEndDate?: string
  /** Current byWeekday filter on the recurrence, if any. */
  currentRecurrenceByWeekday?: number[]
  /** Current reminder on the compose form. AI suggestion is
   * suppressed when it equals this (deep compare). Omit → the AI
   * suggestion always shows. */
  currentReminder?: { at: string; intervalMinutes?: number; until?: string }
  onApplyCategory: (id: string) => void
  /** Tap on a "+ <label>" pill. Implementation should confirm with
   * the user (it creates a new category in their sidebar). Omit to
   * skip the new-category pill entirely (useful in edit-todo flows
   * where the user typically reuses existing categories). */
  onApplyNewCategory?: (label: string) => void
  onApplyPriority: (p: Priority) => void
  onApplyDueDate: (iso: string) => void
  onApplyRecurrence: (rec: {
    freq: RecurrenceFreq
    byWeekday?: number[]
    endDate?: string
  }) => void
  /** Optional — when omitted, the reminder pill is hidden entirely
   * (useful in screens that don't expose a reminder field yet). */
  onApplyReminder?: (reminder: { at: string; intervalMinutes?: number; until?: string }) => void
  onDismissField: (
    field: 'category' | 'newCategoryLabel' | 'priority' | 'dueDate' | 'recurrence' | 'reminder',
  ) => void
}

export function TodoFieldSuggestPills({
  suggestions,
  thinking,
  categories,
  currentCategory,
  currentPriority,
  currentDueDate,
  currentRecurrenceFreq,
  currentRecurrenceEndDate,
  currentRecurrenceByWeekday,
  currentReminder,
  onApplyCategory,
  onApplyNewCategory,
  onApplyPriority,
  onApplyDueDate,
  onApplyRecurrence,
  onApplyReminder,
  onDismissField,
}: RowProps) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  const catDef =
    suggestions?.category
      ? categories.find((c) => c.id === suggestions.category)
      : undefined

  // Per-pill render guards: skip the pill if its suggested value
  // would no-op against the form's current state. Defense for the
  // new-category pill: also skip if a same-label category already
  // exists in the user's list (server-side blocklist *should*
  // prevent this, but a client-side guard avoids a confusing
  // "create the category you already have" prompt).
  const showCategoryPill =
    !!catDef && catDef.id !== currentCategory
  const newLabelLower = suggestions?.newCategoryLabel?.trim().toLowerCase() ?? null
  const newCategoryAlreadyExists =
    !!newLabelLower &&
    categories.some(
      (c) => categoryLabel(c, t).toLowerCase() === newLabelLower,
    )
  const showNewCategoryPill =
    !!onApplyNewCategory &&
    !suggestions?.category &&
    !!suggestions?.newCategoryLabel &&
    !newCategoryAlreadyExists
  const showPriorityPill =
    !!suggestions?.priority && suggestions.priority !== currentPriority
  const showDueDatePill =
    !!suggestions?.dueDate && suggestions.dueDate !== currentDueDate
  // Pill suppressed only when freq + endDate + byWeekday already
  // match the compose form. If any differ — same freq with a new
  // endDate, or same freq with different weekday picks — the pill
  // stays so the user can adopt the change.
  const showRecurrencePill =
    !!suggestions?.recurrence &&
    (suggestions.recurrence.freq !== currentRecurrenceFreq ||
      (suggestions.recurrence.endDate ?? undefined) !== currentRecurrenceEndDate ||
      !sameWeekdays(suggestions.recurrence.byWeekday, currentRecurrenceByWeekday))
  const showRemindAtPill =
    !!onApplyReminder &&
    !!suggestions?.reminder &&
    JSON.stringify(suggestions.reminder) !== JSON.stringify(currentReminder ?? null)

  const hasAny =
    showCategoryPill ||
    showNewCategoryPill ||
    showPriorityPill ||
    showDueDatePill ||
    showRecurrencePill ||
    showRemindAtPill

  // Render the row whenever AI is thinking OR has visible pills.
  // Hiding the row during the in-flight call (which can take 1-2s)
  // made it look like AI never fired — user feedback. A tiny
  // ActivityIndicator next to the Sparkles is honest signal without
  // being loud.
  if (!hasAny && !thinking) return null

  return (
    <View style={styles.row}>
      <Sparkles size={12} color={theme.primary} strokeWidth={2.2} />
      {thinking && (
        <View style={styles.thinkingPill}>
          <MochiThinking />
        </View>
      )}
      {showCategoryPill && catDef && (
        <Pill
          styles={styles}
          onApply={() => {
            onApplyCategory(catDef.id)
            onDismissField('category')
          }}
          onDismiss={() => onDismissField('category')}
          accessibilityLabel={`${t.aiSuggestionA11y}: ${t.composeCategoryLabel} ${categoryLabel(catDef, t)}`}
          icon={<CategoryIcon icon={catDef.icon} size={12} color={catDef.color} />}
          label={categoryLabel(catDef, t)}
        />
      )}
      {showNewCategoryPill && (
        <Pill
          styles={styles}
          onApply={() => {
            // Parent handler triggers the confirm dialog before
            // mutating the category list.
            onApplyNewCategory!(suggestions!.newCategoryLabel!)
          }}
          onDismiss={() => onDismissField('newCategoryLabel')}
          accessibilityLabel={`${t.aiSuggestionA11y}: ${t.composeCategoryLabel} ${suggestions!.newCategoryLabel} (new)`}
          icon={<Plus size={12} color={theme.primary} strokeWidth={2.4} />}
          label={suggestions!.newCategoryLabel!}
        />
      )}
      {showPriorityPill && (
        <Pill
          styles={styles}
          onApply={() => {
            onApplyPriority(suggestions!.priority!)
            onDismissField('priority')
          }}
          onDismiss={() => onDismissField('priority')}
          accessibilityLabel={`${t.aiSuggestionA11y}: ${t.composePriorityLabel} ${t.priority[suggestions!.priority!]}`}
          icon={<PriorityDot level={suggestions!.priority!} size={10} />}
          label={t.priority[suggestions!.priority!]}
        />
      )}
      {showDueDatePill && (
        <Pill
          styles={styles}
          onApply={() => {
            onApplyDueDate(suggestions!.dueDate!)
            onDismissField('dueDate')
          }}
          onDismiss={() => onDismissField('dueDate')}
          accessibilityLabel={`${t.aiSuggestionA11y}: ${t.composeDateLabel} ${formatDisplayDate(suggestions!.dueDate!, t.locale)}`}
          label={formatDisplayDate(suggestions!.dueDate!, t.locale)}
        />
      )}
      {showRecurrencePill && (
        <Pill
          styles={styles}
          onApply={() => {
            onApplyRecurrence(suggestions!.recurrence!)
            onDismissField('recurrence')
          }}
          onDismiss={() => onDismissField('recurrence')}
          accessibilityLabel={`${t.aiSuggestionA11y}: ${formatRecurrence(suggestions!.recurrence!)}${suggestions!.recurrence!.endDate ? `, ${formatDisplayDate(suggestions!.recurrence!.endDate, t.locale)}` : ''}`}
          icon={<Repeat size={11} color={theme.primary} strokeWidth={2.2} />}
          label={
            suggestions!.recurrence!.endDate
              ? `${formatRecurrence(suggestions!.recurrence!)} · ${formatDisplayDate(suggestions!.recurrence!.endDate, t.locale)}`
              : formatRecurrence(suggestions!.recurrence!)
          }
        />
      )}
      {showRemindAtPill && (
        <Pill
          styles={styles}
          onApply={() => {
            onApplyReminder!(suggestions!.reminder!)
            onDismissField('reminder')
          }}
          onDismiss={() => onDismissField('reminder')}
          accessibilityLabel={`${t.aiSuggestionA11y}: ${t.remindAiSuggest} ${formatReminderForPill(suggestions!.reminder!)}`}
          icon={<Bell size={11} color={theme.primary} strokeWidth={2.2} />}
          label={formatReminderForPill(suggestions!.reminder!)}
        />
      )}
    </View>
  )
}

/** Compact label for an AI-suggested reminder pill. One-shot →
 * datetime. Recurring → "every Xh until <datetime>". Kept in this
 * file so the pill component can render it without a util import
 * dance. */
function formatReminderForPill(reminder: { at: string; intervalMinutes?: number; until?: string }): string {
  const datePart = formatDateTimeForPill(reminder.at)
  if (!reminder.intervalMinutes) return datePart
  const cadence = reminder.intervalMinutes < 60
    ? `${reminder.intervalMinutes}m`
    : `${Math.floor(reminder.intervalMinutes / 60)}h`
  return reminder.until
    ? `every ${cadence} until ${formatDateTimeForPill(reminder.until)}`
    : `every ${cadence}`
}

function formatDateTimeForPill(at: string): string {
  const d = new Date(at)
  if (Number.isNaN(d.valueOf())) return at
  const sameYear = d.getFullYear() === new Date().getFullYear()
  const datePart = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
  const timePart = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${datePart}, ${timePart}`
}

interface PillProps {
  styles: ReturnType<typeof makeStyles>
  onApply: () => void
  onDismiss: () => void
  accessibilityLabel: string
  icon?: React.ReactNode
  label: string
}

function Pill({ styles, onApply, onDismiss, accessibilityLabel, icon, label }: PillProps) {
  return (
    <View style={styles.pillWrap}>
      <TouchableOpacity
        onPress={onApply}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={styles.pillTap}
      >
        {icon}
        <Text style={styles.pillText} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onDismiss}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Dismiss suggestion"
        style={styles.pillDismiss}
      >
        <Text style={styles.pillDismissText}>×</Text>
      </TouchableOpacity>
    </View>
  )
}

/**
 * Array-equality for two byWeekday lists. Treats undefined and []
 * as equal (both = no weekday filter) so the no-op suppression
 * doesn't trigger spuriously when one side omits the field.
 */
function sameWeekdays(a: number[] | undefined, b: number[] | undefined): boolean {
  const ax = a ?? []
  const bx = b ?? []
  if (ax.length !== bx.length) return false
  for (let i = 0; i < ax.length; i++) {
    if (ax[i] !== bx[i]) return false
  }
  return true
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
      paddingHorizontal: 4,
      paddingTop: 4,
      paddingBottom: 8,
    },
    pillWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.primarySoft,
      borderRadius: 999,
      paddingLeft: 10,
      paddingRight: 4,
      paddingVertical: 4,
      gap: 4,
    },
    pillTap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 2,
    },
    pillText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.primary,
      letterSpacing: -0.1,
    },
    pillDismiss: {
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    pillDismissText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.label3,
      lineHeight: 16,
    },
    thinkingPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    thinkingText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.primary,
      letterSpacing: -0.1,
    },
  })
}

