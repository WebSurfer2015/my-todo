import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { suggestSubtasks } from '../aiInfer'
import { distributeSubtaskDueDates } from '../../../core/src/utils'
import { useLang } from '../LangContext'

/**
 * Suggest steps — split into three pieces so the trigger can live in
 * the section header row while the review panel renders below the
 * subtask list. The hook owns request state; the two components are
 * pure presentation.
 *
 * Typical usage in TaskDetailsModal:
 *   const ai = useSuggestSteps({ parentTitle, parentNotes })
 *   // header row → <SuggestStepsTrigger {...ai} onClick={ai.request} />
 *   // body       → ai.suggestions && <SuggestStepsReview suggestions={ai.suggestions}
 *                     parentDueDate={...} onAddSelected={...} onCancel={ai.reset} />
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
  return (
    <div className="suggest-steps-trigger">
      <button
        type="button"
        className="suggest-steps-btn"
        onClick={onClick}
        disabled={thinking}
        title={t.aiSuggestionA11y}
        aria-label={`${t.suggestSteps} — ${t.aiSuggestionA11y}`}
      >
        <Sparkles size={14} strokeWidth={2.2} aria-hidden="true" />
        <span>{thinking ? t.suggestStepsThinking : t.suggestSteps}</span>
      </button>
      {error && <span className="suggest-steps-error">{error}</span>}
    </div>
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
    <div className="suggest-steps-panel">
      <p className="suggest-steps-hint">{t.suggestStepsHint}</p>
      <ul className="suggest-steps-list">
        {suggestions.map((text, i) => (
          <li key={i} className="suggest-steps-item">
            <label className="suggest-steps-label">
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={() => toggleSelected(i)}
              />
              <span>{text}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="suggest-steps-actions">
        <button type="button" className="btn" onClick={onCancel}>
          {t.cancel}
        </button>
        <button
          type="button"
          className="btn btn-add"
          onClick={handleAdd}
          disabled={selected.size === 0}
        >
          {t.addSelected}{selected.size > 0 ? ` (${selected.size})` : ''}
        </button>
      </div>
    </div>
  )
}
