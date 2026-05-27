/**
 * Ambient AI field suggestions hook. Owns the request lifecycle —
 * debounce, dedupe, race protection, signal pre-filter. Extracted
 * from TodoFieldSuggestPills.tsx so it can be unit-tested without
 * pulling in the React Native pill UI.
 *
 * Token discipline: 1500ms debounce, 8-char minimum, dedupe by
 * trimmed-text, profile.agentEnabled gate, single in-flight via
 * sequence number.
 */

import { useEffect, useRef, useState } from 'react'
import { suggestTodoFields, SuggestFieldsResult } from '../aiInfer'

interface HookArgs {
  text: string
  today: string
  categories: Array<{ id: string; label: string }>
  agentEnabled: boolean
  /** When set, the hook skips the AI call until `text` differs from
   * this seed (case-insensitive, trimmed). Used by the edit flow so
   * opening a todo doesn't immediately fire AI on the unchanged text. */
  initialText?: string
}

export const MIN_CHARS = 8
export const DEBOUNCE_MS = 1500

// Patterns that signal the AI *might* extract a useful field. If
// none match, we still allow a call when the text is long enough
// to plausibly carry a category signal — but for short text with no
// signal, skip to save tokens. Cheap regex, runs on every text
// change before the network call.
export const SIGNAL_PATTERNS: RegExp[] = [
  // clock time: "3pm", "3:30 pm", "at 3", "at 14:00"
  /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i,
  /\bat\s+\d{1,2}(:\d{2})?\b/i,
  // date keywords (English; AI handles other langs but local
  // pre-filter is intentionally English-only for now)
  /\b(today|tonight|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i,
  /\b(next|this|last)\s+(week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bin\s+\d+\s*(day|days|week|weeks|month|months|year|years)\b/i,
  /\b(by|due|before)\s+(next|this|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|\d)/i,
  // recurrence
  /\b(every|each|daily|weekly|monthly|yearly|weekdays|weekends)\b/i,
  // reminder
  /\bremind\b/i,
  // priority
  /\b(urgent|asap|important|low\s+priority|optional|whenever)\b/i,
]

export function hasExtractableSignal(text: string): boolean {
  if (SIGNAL_PATTERNS.some((re) => re.test(text))) return true
  // Allow any text long enough to plausibly carry intent beyond a
  // typo. The MIN_CHARS gate (8 chars) already trims trivial entries;
  // requiring multiple words would skip legitimate 2-word category
  // signals like "renew passport" (→ Travel) or "call dentist"
  // (→ Health). Token cost is bounded by the 1.5s debounce + the
  // lastQueriedRef dedupe — extra calls only fire when the user
  // actually pauses on changed text.
  return text.trim().length >= 8
}

export function useTodoFieldSuggestions({
  text,
  today,
  categories,
  agentEnabled,
  initialText,
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
    // Edit flow: don't fire on the seed text. Re-engages once the
    // user actually changes it.
    if (initialText && trimmed.toLowerCase() === initialText.trim().toLowerCase()) {
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
    // Local pre-filter — skip AI when text has no extractable signal
    // and is too short to be worth a category guess. Big token win
    // on early typing strokes that the debounce alone wouldn't catch
    // (e.g., the user pauses to think after "buy m").
    if (!hasExtractableSignal(trimmed)) {
      seqRef.current += 1
      setSuggestions(null)
      setThinking(false)
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
          res.recurrence ||
          res.reminder
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, agentEnabled])

  function dismissField(
    field: 'category' | 'newCategoryLabel' | 'priority' | 'dueDate' | 'recurrence' | 'reminder',
  ) {
    setSuggestions((prev) => {
      if (!prev) return prev
      const next = { ...prev, [field]: null }
      const stillHas = !!(
        next.category ||
        next.newCategoryLabel ||
        next.priority ||
        next.dueDate ||
        next.recurrence ||
        next.reminder
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
