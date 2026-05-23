import React, { useMemo, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Sparkles } from 'lucide-react-native'
import { suggestSubtasks } from '../aiInfer'
import { distributeSubtaskDueDates } from '../../../core/src/utils'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'

interface Props {
  parentTitle: string
  parentNotes?: string
  /** Parent's due date (ISO yyyy-mm-dd) or undefined. Used to spread
   * suggested subtasks across the window from today to the parent's
   * date. Last subtask always lands on the parent's date. */
  parentDueDate?: string
  /** Receives picks in the same order as the user selected them. The
   * dueDate per pick is computed by distributeSubtaskDueDates and
   * may be '' when the parent has no date. */
  onAddSelected: (picks: Array<{ text: string; dueDate: string }>) => void
}

/**
 * Inline panel rendered in the empty subtask state when the user has
 * AI assistance enabled. Tapping "Suggest steps" calls aiInfer
 * (breakdown-subtasks mode), shows the suggestions as a check list
 * with everything selected by default, and lets the user commit a
 * subset through onAddSelected.
 *
 * Mirrors web/src/components/SuggestStepsPanel.tsx so the UX is
 * identical across platforms.
 */
export default function SuggestStepsPanel({ parentTitle, parentNotes, parentDueDate, onAddSelected }: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  async function handleSuggest() {
    setThinking(true)
    setError(null)
    try {
      const res = await suggestSubtasks({
        title: parentTitle,
        notes: parentNotes,
      })
      const texts = res.subtasks.map((s) => s.text).filter((s) => s.length > 0)
      if (texts.length === 0) {
        setError(t.suggestStepsError)
        return
      }
      setSuggestions(texts)
      setSelected(new Set(texts.map((_, i) => i)))
    } catch {
      setError(t.suggestStepsError)
    } finally {
      setThinking(false)
    }
  }

  function toggleSelected(i: number) {
    const next = new Set(selected)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setSelected(next)
  }

  function handleAdd() {
    if (!suggestions) return
    const pickedTexts = suggestions.filter((_, i) => selected.has(i))
    if (pickedTexts.length === 0) return
    const dueDates = distributeSubtaskDueDates(parentDueDate, pickedTexts.length)
    onAddSelected(pickedTexts.map((text, i) => ({ text, dueDate: dueDates[i] ?? '' })))
    setSuggestions(null)
    setSelected(new Set())
  }

  function handleDiscard() {
    setSuggestions(null)
    setSelected(new Set())
    setError(null)
  }

  if (suggestions) {
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
          <TouchableOpacity style={styles.btnSecondary} onPress={handleDiscard} activeOpacity={0.6}>
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

  return (
    <View style={styles.trigger}>
      <TouchableOpacity
        onPress={handleSuggest}
        disabled={thinking}
        activeOpacity={0.6}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${t.suggestSteps} — ${t.aiSuggestionA11y}`}
        style={[styles.triggerPill, thinking && styles.triggerPillDim]}
      >
        {thinking
          ? <ActivityIndicator size="small" color={theme.primary} />
          : <Sparkles size={14} color={theme.primary} strokeWidth={2.2} />}
        <Text style={[styles.triggerText, thinking && styles.triggerTextDim]}>
          {thinking ? t.suggestStepsThinking : t.suggestSteps}
        </Text>
      </TouchableOpacity>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    trigger: {
      paddingVertical: 6,
      paddingHorizontal: 2,
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    // Soft tonal AI pill — distinguishes the trigger from regular
    // text links and pairs with the Sparkles icon to signal AI.
    triggerPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 6,
      alignSelf: 'flex-start',
    },
    triggerPillDim: { opacity: 0.7 },
    triggerText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.primary,
      letterSpacing: -0.1,
    },
    triggerTextDim: { color: c.label3 },
    errorText: {
      fontSize: 12,
      color: c.label3,
    },
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
