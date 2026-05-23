import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { suggestSubtasks } from '../aiInfer'
import { distributeSubtaskDueDates } from '../../../core/src/utils'
import { useLang } from '../LangContext'

interface Props {
  parentTitle: string
  parentNotes?: string
  /** Parent's due date (ISO yyyy-mm-dd) or undefined. Used to spread
   * suggested subtasks' dates from today → parent's date. Last
   * subtask always lands on the parent's date. */
  parentDueDate?: string
  /** Receives one text per selected suggestion plus the matching due
   * date in the same order. Empty-string entries in `dueDates` mean
   * "no date" — happens when parent has no due date. */
  onAddSelected: (picks: Array<{ text: string; dueDate: string }>) => void
}

/**
 * Inline panel rendered in TaskDetailsModal when the user has AI assistance
 * on and the to-do has no subtasks yet. Tapping "Suggest steps" calls
 * aiInfer (breakdown-subtasks mode), shows the returned steps as a check
 * list with everything selected by default, and lets the user add all
 * checked items as subtasks of the parent.
 *
 * Calm-UX rules followed:
 *   - No automatic mutation: the panel only adds subtasks after explicit
 *     "Add selected" tap, mirroring how compose flows already work.
 *   - Errors are displayed inline (one short sentence), no toast cascade.
 *   - Panel collapses back to the trigger button after Add or Discard so
 *     the user can ask again with different framing if needed.
 */
export default function SuggestStepsPanel({ parentTitle, parentNotes, parentDueDate, onAddSelected }: Props) {
  const { t } = useLang()
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
    // Distribute dates across the picked subtasks so the last one
    // lands on the parent's due date and earlier ones pace back
    // toward today. Pure function; no-date when parent has no date.
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
      <div className="suggest-steps-panel">
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
          <button type="button" className="btn" onClick={handleDiscard}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="btn btn-add"
            onClick={handleAdd}
            disabled={selected.size === 0}
          >
            {t.addSelected}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="suggest-steps-trigger">
      <button
        type="button"
        className="suggest-steps-btn"
        onClick={handleSuggest}
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
