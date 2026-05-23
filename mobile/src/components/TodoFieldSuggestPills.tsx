import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Sparkles, Plus, Repeat } from 'lucide-react-native'
import { suggestTodoFields, SuggestFieldsResult } from '../aiInfer'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'
import { CategoryDef, categoryLabel } from '../categories'
import { Priority, RecurrenceFreq } from '../types'
import { formatDisplayDate, formatRecurrence } from '../utils'
import CategoryIcon from './CategoryIcon'
import PriorityDot from './PriorityDot'

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

interface HookArgs {
  text: string
  today: string
  categories: Array<{ id: string; label: string }>
  agentEnabled: boolean
}

const MIN_CHARS = 3
const DEBOUNCE_MS = 800

export function useTodoFieldSuggestions({
  text,
  today,
  categories,
  agentEnabled,
}: HookArgs) {
  const [suggestions, setSuggestions] = useState<SuggestFieldsResult | null>(null)
  const [thinking, setThinking] = useState(false)

  // Refs so the timer-fired closure reads the latest categories
  // without re-binding the effect on every parent re-render (parent
  // may re-allocate the categories array even when contents are stable).
  const categoriesRef = useRef(categories)
  useEffect(() => {
    categoriesRef.current = categories
  }, [categories])
  const todayRef = useRef(today)
  useEffect(() => {
    todayRef.current = today
  }, [today])

  // Sequence number — every dispatched request carries one; only the
  // latest one is allowed to apply its response. Mutating seqRef in
  // `clear()` invalidates any in-flight request.
  const seqRef = useRef(0)
  const lastQueriedRef = useRef<string>('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    const trimmed = text.trim()
    if (!agentEnabled || trimmed.length < MIN_CHARS) {
      // Off-by-default branch — hide pills and invalidate in-flight.
      seqRef.current += 1
      setSuggestions(null)
      setThinking(false)
      lastQueriedRef.current = ''
      return
    }
    if (trimmed === lastQueriedRef.current) {
      // No meaningful change — skip the network call. (Suggestions
      // from the last response stay visible until the user edits.)
      return
    }

    timerRef.current = setTimeout(() => {
      const querySeq = ++seqRef.current
      const queryText = trimmed
      lastQueriedRef.current = queryText
      setThinking(true)
      void suggestTodoFields({
        text: queryText,
        today: todayRef.current,
        categories: categoriesRef.current,
      }).then((res) => {
        // Drop stale response — the user kept typing.
        if (querySeq !== seqRef.current) return
        // If every field is null, hide the row entirely rather than
        // rendering an empty placeholder.
        const hasAny = !!(
          res.category ||
          res.newCategoryLabel ||
          res.priority ||
          res.dueDate ||
          res.recurrence
        )
        setSuggestions(hasAny ? res : null)
        setThinking(false)
      })
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [text, agentEnabled])

  function dismissField(
    field: 'category' | 'newCategoryLabel' | 'priority' | 'dueDate' | 'recurrence',
  ) {
    setSuggestions((prev) => {
      if (!prev) return prev
      const next = { ...prev, [field]: null }
      const stillHas = !!(
        next.category ||
        next.newCategoryLabel ||
        next.priority ||
        next.dueDate ||
        next.recurrence
      )
      return stillHas ? next : null
    })
  }

  function clear() {
    seqRef.current += 1
    setSuggestions(null)
    setThinking(false)
    lastQueriedRef.current = ''
  }

  return { suggestions, thinking, dismissField, clear }
}

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
  onApplyCategory: (id: string) => void
  /** Tap on a "+ <label>" pill. Implementation should confirm with
   * the user (it creates a new category in their sidebar). Omit to
   * skip the new-category pill entirely (useful in edit-todo flows
   * where the user typically reuses existing categories). */
  onApplyNewCategory?: (label: string) => void
  onApplyPriority: (p: Priority) => void
  onApplyDueDate: (iso: string) => void
  onApplyRecurrence: (rec: { freq: RecurrenceFreq; endDate?: string }) => void
  onDismissField: (
    field: 'category' | 'newCategoryLabel' | 'priority' | 'dueDate' | 'recurrence',
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
  onApplyCategory,
  onApplyNewCategory,
  onApplyPriority,
  onApplyDueDate,
  onApplyRecurrence,
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
  // Pill suppressed only when both freq AND endDate already match
  // the compose form — that's a genuine no-op. If the AI proposes
  // the same freq with a *new* endDate (e.g. user typed "for 30
  // days"), the pill stays so the user can adopt the bound.
  const showRecurrencePill =
    !!suggestions?.recurrence &&
    (suggestions.recurrence.freq !== currentRecurrenceFreq ||
      (suggestions.recurrence.endDate ?? undefined) !== currentRecurrenceEndDate)

  const hasAny =
    showCategoryPill ||
    showNewCategoryPill ||
    showPriorityPill ||
    showDueDatePill ||
    showRecurrencePill

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
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={styles.thinkingText}>{t.suggestStepsThinking}</Text>
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
          accessibilityLabel={`${t.aiSuggestionA11y}: ${formatRecurrence({ freq: suggestions!.recurrence!.freq })}${suggestions!.recurrence!.endDate ? `, ${formatDisplayDate(suggestions!.recurrence!.endDate, t.locale)}` : ''}`}
          icon={<Repeat size={11} color={theme.primary} strokeWidth={2.2} />}
          label={
            suggestions!.recurrence!.endDate
              ? `${formatRecurrence({ freq: suggestions!.recurrence!.freq })} · ${formatDisplayDate(suggestions!.recurrence!.endDate, t.locale)}`
              : formatRecurrence({ freq: suggestions!.recurrence!.freq })
          }
        />
      )}
    </View>
  )
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

