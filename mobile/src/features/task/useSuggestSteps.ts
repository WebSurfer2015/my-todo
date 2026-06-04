/**
 * Suggest-steps request lifecycle hook. Extracted from
 * SuggestStepsPanel.tsx so it can be unit-tested without
 * pulling in the React Native panel UI.
 *
 * State machine: idle → thinking → (suggestions | error). Both
 * branches reset `thinking` to false. `reset()` clears suggestions
 * + error without firing a new request — the trigger pill calls
 * this when the user dismisses the panel.
 */

import { useState } from 'react'
import { suggestSubtasks } from '../../adapters/aiInfer'
import { useLang } from '../../app/LangContext'

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
      // Trim before the length check — a whitespace-only suggestion
      // would otherwise pass the > 0 guard and render as a blank step.
      const texts = res.subtasks
        .map((s) => s.text)
        .filter((s) => s.trim().length > 0)
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
