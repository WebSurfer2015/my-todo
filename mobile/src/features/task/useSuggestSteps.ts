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

import { useEffect, useRef, useState } from 'react'
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

  // Abort the in-flight request when the panel unmounts (or a new request
  // supersedes it) so the model call doesn't bill after the UI is gone.
  const controllerRef = useRef<AbortController | null>(null)
  useEffect(() => () => controllerRef.current?.abort(), [])

  async function request() {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setThinking(true)
    setError(null)
    try {
      const res = await suggestSubtasks(
        { title: parentTitle, notes: parentNotes },
        controller.signal,
      )
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
    } catch (e) {
      // A cancelled request (unmount / new request) is not a failure —
      // stay silent rather than flashing an error as the panel closes.
      if (e instanceof Error && e.name === 'AbortError') return
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
