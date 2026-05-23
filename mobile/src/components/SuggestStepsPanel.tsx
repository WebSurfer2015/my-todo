import React, { useMemo, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Sparkles } from 'lucide-react-native'
import { suggestSubtasks } from '../aiInfer'
import { distributeSubtaskDueDates } from '../../../core/src/utils'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'

/**
 * Suggest steps — split into hook + trigger + review so the trigger
 * pill can live in the STEPS section header row while the review
 * checklist renders below the subtask list. Mirrors the web pattern
 * in web/src/components/SuggestStepsPanel.tsx.
 */

export function useSuggestSteps({
  parentTitle,
  parentNotes,
}: {
  parentTitle: string
  parentNotes?: string
}) {
  const { t } = useLang()
  const [thinking, setThinking] = useState(false)
  const [suggestions, setSuggestions] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function request() {
    setThinking(true)
    setError(null)
    try {
      const res = await suggestSubtasks({ title: parentTitle, notes: parentNotes })
      const texts = res.subtasks.map((s) => s.text).filter((s) => s.length > 0)
      if (texts.length === 0) {
        setError(t.suggestStepsError)
        return
      }
      setSuggestions(texts)
    } catch {
      setError(t.suggestStepsError)
    } finally {
      setThinking(false)
    }
  }

  function reset() {
    setSuggestions(null)
    setError(null)
  }

  return { thinking, suggestions, error, request, reset }
}

interface TriggerProps {
  thinking: boolean
  error: string | null
  onClick: () => void
}

export function SuggestStepsTrigger({ thinking, error, onClick }: TriggerProps) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeTriggerStyles(theme), [theme])
  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        onPress={onClick}
        disabled={thinking}
        activeOpacity={0.6}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${t.suggestSteps} — ${t.aiSuggestionA11y}`}
        style={[styles.pill, thinking && styles.pillDim]}
      >
        {thinking
          ? <ActivityIndicator size="small" color={theme.primary} />
          : <Sparkles size={14} color={theme.primary} strokeWidth={2.2} />}
        <Text style={[styles.text, thinking && styles.textDim]}>
          {thinking ? t.suggestStepsThinking : t.suggestSteps}
        </Text>
      </TouchableOpacity>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  )
}

interface ReviewProps {
  suggestions: string[]
  parentDueDate?: string
  onAddSelected: (picks: Array<{ text: string; dueDate: string }>) => void
  onCancel: () => void
}

export function SuggestStepsReview({
  suggestions,
  parentDueDate,
  onAddSelected,
  onCancel,
}: ReviewProps) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeReviewStyles(theme), [theme])
  const [selected, setSelected] = useState<Set<number>>(
    new Set(suggestions.map((_, i) => i)),
  )

  function toggleSelected(i: number) {
    const next = new Set(selected)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setSelected(next)
  }

  function handleAdd() {
    const pickedTexts = suggestions.filter((_, i) => selected.has(i))
    if (pickedTexts.length === 0) return
    const dueDates = distributeSubtaskDueDates(parentDueDate, pickedTexts.length)
    onAddSelected(pickedTexts.map((text, i) => ({ text, dueDate: dueDates[i] ?? '' })))
  }

  return (
    <View style={styles.panel}>
      {suggestions.map((text, i) => {
        const isOn = selected.has(i)
        return (
          <TouchableOpacity
            key={i}
            style={styles.row}
            onPress={() => toggleSelected(i)}
            activeOpacity={0.6}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isOn }}
          >
            <View style={[styles.checkbox, isOn && styles.checkboxOn]}>
              {isOn && <Text style={styles.check}>✓</Text>}
            </View>
            <Text style={styles.rowText}>{text}</Text>
          </TouchableOpacity>
        )
      })}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.btnSecondary} onPress={onCancel} activeOpacity={0.6}>
          <Text style={styles.btnSecondaryText}>{t.cancel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnPrimary, selected.size === 0 && styles.btnPrimaryDisabled]}
          onPress={handleAdd}
          disabled={selected.size === 0}
          activeOpacity={0.6}
        >
          <Text style={styles.btnPrimaryText}>{t.addSelected}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function makeTriggerStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    pillDim: { opacity: 0.7 },
    text: {
      fontSize: 12,
      fontWeight: '600',
      color: c.primary,
      letterSpacing: -0.1,
    },
    textDim: { color: c.label3 },
    errorText: {
      fontSize: 11,
      color: c.label3,
    },
  })
}

function makeReviewStyles(c: ThemeColors) {
  return StyleSheet.create({
    panel: {
      borderWidth: 1,
      borderColor: c.primarySoft,
      backgroundColor: c.primarySoft,
      borderRadius: 12,
      padding: 12,
      gap: 6,
      marginVertical: 6,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 4,
    },
    checkbox: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: c.gray3,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    checkboxOn: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    check: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 14,
    },
    rowText: {
      flex: 1,
      fontSize: 14,
      color: c.label,
      letterSpacing: -0.1,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 8,
    },
    btnSecondary: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
    },
    btnSecondaryText: {
      color: c.label2,
      fontSize: 13,
      fontWeight: '600',
    },
    btnPrimary: {
      paddingHorizontal: 18,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: c.primary,
    },
    btnPrimaryDisabled: {
      opacity: 0.4,
    },
    btnPrimaryText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '600',
    },
  })
}
