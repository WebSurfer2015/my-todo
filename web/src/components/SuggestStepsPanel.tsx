import { useState } from 'react'
import { suggestSubtasks } from '../aiInfer'
import { useLang } from '../LangContext'

interface Props {
  parentTitle: string
  parentNotes?: string
  onAddSelected: (texts: string[]) => void
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
export default function SuggestStepsPanel({ parentTitle, parentNotes, onAddSelected }: Props) {
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
    const picks = suggestions.filter((_, i) => selected.has(i))
    if (picks.length === 0) return
    onAddSelected(picks)
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
      >
        {thinking ? t.suggestStepsThinking : t.suggestSteps}
      </button>
      {error && <span className="suggest-steps-error">{error}</span>}
    </div>
  )
}
