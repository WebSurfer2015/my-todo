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
import { currentAiUid, isAiQuotaError, suggestSubtasks } from '../../adapters/aiInfer'
import { useLang } from '../../app/LangContext'
import { markMochiResting, mochiRestUntil, suggestStepsRestingText } from '../mochi/mochiRest'

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
  // supersedes it) so a late response never lands in a closed panel. (The
  // server's model call still completes and bills — abort is client-side.)
  const controllerRef = useRef<AbortController | null>(null)
  useEffect(() => () => controllerRef.current?.abort(), [])

  async function request() {
    // Mochi's resting (the shared daily cap is spent — maybe by the chat):
    // say until when, and don't spend a request on a "no".
    const uid = currentAiUid()
    const restingUntil = mochiRestUntil(uid)
    if (restingUntil) {
      setError(suggestStepsRestingText(restingUntil))
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
      // A request WE cancelled (unmount / a newer request) is not a failure —
      // stay silent rather than flashing an error as the panel closes. Any
      // other abort (the adapter's 35s timeout) is a real failure: show the
      // calm error instead of silently dropping the spinner.
      if (controller.signal.aborted) return
      // Over the invisible fair-use ceiling (P1.7): a gentle "Mochi's
      // resting until <time>" note — never the server's text, never a wall
      // — and every ambient AI call stays quiet until the reset. Typing
      // steps by hand still works.
      setError(
        isAiQuotaError(e) ? suggestStepsRestingText(markMochiResting(uid)) : t.suggestStepsError,
      )
    } finally {
      // Only the live request owns the spinner — a superseded one must not
      // flip it off under the newer in-flight request.
      if (controllerRef.current === controller) setThinking(false)
    }
  }

  function reset() {
    setSuggestions(null)
    setError(null)
  }

  return { thinking, suggestions, error, request, reset }
}
