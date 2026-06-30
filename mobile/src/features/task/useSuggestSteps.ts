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
  canSend = true,
}: {
  parentTitle: string
  parentNotes?: string
  /** When false, the user is out of AI requests — the trigger shows a
   * quota message instead of spending a (doomed) request. */
  canSend?: boolean
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
    // Out of AI requests — don't burn a call that the server will reject;
    // surface the quota wall directly so it isn't a vague failure.
    if (!canSend) {
      setSuggestions(null)
      setError("You're out of AI requests right now.")
      return
    }
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
      // Surface the server's hard-cap message (e.g. "AI daily limit
      // reached.") instead of the generic error so a quota wall reads as
      // a quota wall, not a glitch.
      const msg = e instanceof Error ? e.message : ''
      setError(/limit|reached|quota/i.test(msg) ? msg : t.suggestStepsError)
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
