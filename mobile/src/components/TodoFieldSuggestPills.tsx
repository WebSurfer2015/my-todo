import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Sparkles } from 'lucide-react-native'
import { suggestTodoFields, SuggestFieldsResult } from '../aiInfer'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'
import { CategoryDef, categoryLabel } from '../categories'
import { Priority } from '../types'
import { formatDisplayDate } from '../utils'
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
        const hasAny = !!(res.category || res.priority || res.dueDate)
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

  function dismissField(field: 'category' | 'priority' | 'dueDate') {
    setSuggestions((prev) => {
      if (!prev) return prev
      const next = { ...prev, [field]: null }
      const stillHas = !!(next.category || next.priority || next.dueDate)
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
  onApplyCategory: (id: string) => void
  onApplyPriority: (p: Priority) => void
  onApplyDueDate: (iso: string) => void
  onDismissField: (field: 'category' | 'priority' | 'dueDate') => void
}

export function TodoFieldSuggestPills({
  suggestions,
  thinking,
  categories,
  onApplyCategory,
  onApplyPriority,
  onApplyDueDate,
  onDismissField,
}: RowProps) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  const hasAny = !!(
    suggestions &&
    (suggestions.category || suggestions.priority || suggestions.dueDate)
  )

  // Don't render anything when there's nothing to show. Suppressing
  // the bare "thinking" state too — the input field is the user's
  // focus; a spinner under it would be noise on most keystrokes.
  if (!hasAny) return null

  const catDef =
    suggestions?.category
      ? categories.find((c) => c.id === suggestions.category)
      : undefined

  return (
    <View style={styles.row}>
      <Sparkles size={12} color={theme.primary} strokeWidth={2.2} />
      {thinking && <ActivityIndicator size="small" color={theme.primary} />}
      {suggestions?.category && catDef && (
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
      {suggestions?.priority && (
        <Pill
          styles={styles}
          onApply={() => {
            onApplyPriority(suggestions.priority!)
            onDismissField('priority')
          }}
          onDismiss={() => onDismissField('priority')}
          accessibilityLabel={`${t.aiSuggestionA11y}: ${t.composePriorityLabel} ${t.priority[suggestions.priority]}`}
          icon={<PriorityDot level={suggestions.priority} size={10} />}
          label={t.priority[suggestions.priority]}
        />
      )}
      {suggestions?.dueDate && (
        <Pill
          styles={styles}
          onApply={() => {
            onApplyDueDate(suggestions.dueDate!)
            onDismissField('dueDate')
          }}
          onDismiss={() => onDismissField('dueDate')}
          accessibilityLabel={`${t.aiSuggestionA11y}: ${t.composeDateLabel} ${formatDisplayDate(suggestions.dueDate, t.locale)}`}
          label={formatDisplayDate(suggestions.dueDate, t.locale)}
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
  })
}

