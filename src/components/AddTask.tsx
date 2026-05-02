import { useRef, useState, KeyboardEvent } from 'react'
import { Category, Priority, PRIORITY_VALUES, PRIORITY_COLORS, CATEGORY_VALUES, CATEGORY_COLORS } from '../types'
import PriorityBarsIcon from './PriorityBarsIcon'
import CategoryIcon from './CategoryIcon'
import { useLang } from '../LangContext'
import { useCloseOnOutside } from '../hooks'

interface Props {
  onAdd: (text: string, priority: Priority, dueDate: string, category?: Category) => void
}

export default function AddTask({ onAdd }: Props) {
  const { t } = useLang()
  const [text, setText] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [category, setCategory] = useState<Category>('school')
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const priorityRef = useRef<HTMLDivElement>(null)
  const categoryRef = useRef<HTMLDivElement>(null)

  useCloseOnOutside(priorityRef, priorityOpen, () => setPriorityOpen(false))
  useCloseOnOutside(categoryRef, categoryOpen, () => setCategoryOpen(false))

  function submit() {
    const trimmed = text.trim()
    if (!trimmed) return
    onAdd(trimmed, priority, '', category)
    setText('')
    setPriority('medium')
    setCategory('school')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') submit()
  }

  return (
    <div className="input-row">
      <div className="task-input-wrapper">
        <div className="category-trigger" ref={categoryRef}>
          <button
            type="button"
            className={`category-trigger-btn cat-${category}`}
            onClick={() => setCategoryOpen((v) => !v)}
            aria-label={t.categories[category]}
            title={t.categories[category]}
          >
            <CategoryIcon category={category} size={18} />
          </button>
          {categoryOpen && (
            <div className="category-select-dropdown">
              {CATEGORY_VALUES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`category-select-option${category === value ? ' selected' : ''}`}
                  style={{ color: CATEGORY_COLORS[value] }}
                  onClick={() => { setCategory(value); setCategoryOpen(false) }}
                >
                  <CategoryIcon category={value} />
                  {t.categories[value]}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          type="text"
          placeholder={t.addPlaceholder}
          maxLength={200}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="priority-trigger" ref={priorityRef}>
          <button
            type="button"
            className="priority-trigger-btn"
            style={{ color: PRIORITY_COLORS[priority] }}
            onClick={() => setPriorityOpen((v) => !v)}
            aria-label={t.setPriority}
            title={t.setPriority}
          >
            <PriorityBarsIcon level={priority} />
          </button>
          {priorityOpen && (
            <div className="priority-dropdown">
              {PRIORITY_VALUES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`priority-option${priority === value ? ' selected' : ''}`}
                  style={{ color: priority === value ? PRIORITY_COLORS[value] : undefined }}
                  onClick={() => { setPriority(value); setPriorityOpen(false) }}
                >
                  <span className="priority-option-icon" style={{ color: PRIORITY_COLORS[value] }}>
                    <PriorityBarsIcon level={value} />
                  </span>
                  {t.priority[value]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <button className="btn btn-add" onClick={submit}>{t.add}</button>
    </div>
  )
}
