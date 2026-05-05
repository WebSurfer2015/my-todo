import { forwardRef, useEffect, useImperativeHandle, useRef, useState, KeyboardEvent } from 'react'
import { Category, Priority, PRIORITY_VALUES, PRIORITY_COLORS } from '../types'
import { CategoryDef, categoryLabel } from '../categories'
import PriorityBarsIcon from './PriorityBarsIcon'
import CategoryIcon from './CategoryIcon'
import { useLang } from '../LangContext'
import { useCloseOnOutside } from '../hooks'

interface Props {
  onAdd: (text: string, priority: Priority, dueDate: string, category: Category) => void
  defaultCategory: Category
  categories: CategoryDef[]
}

export interface AddTaskHandle {
  focus: () => void
}

const AddTask = forwardRef<AddTaskHandle, Props>(function AddTask({ onAdd, defaultCategory, categories }, ref) {
  const { t } = useLang()
  const [text, setText] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [category, setCategory] = useState<Category>(defaultCategory)
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const priorityRef = useRef<HTMLDivElement>(null)
  const categoryRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus()
      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    },
  }))

  useCloseOnOutside(priorityRef, priorityOpen, () => setPriorityOpen(false))
  useCloseOnOutside(categoryRef, categoryOpen, () => setCategoryOpen(false))

  useEffect(() => {
    setCategory(defaultCategory)
  }, [defaultCategory])

  const activeCat = categories.find((c) => c.id === category) ?? categories[0]

  function submit() {
    const trimmed = text.trim()
    if (!trimmed || !activeCat) return
    onAdd(trimmed, priority, '', activeCat.id)
    setText('')
    setPriority('medium')
    setCategory(defaultCategory)
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
            className="category-trigger-btn"
            style={{ ['--cat-color' as string]: activeCat?.color, color: activeCat?.color }}
            onClick={() => setCategoryOpen((v) => !v)}
            aria-label={t.setCategory}
            title={t.setCategory}
          >
            {activeCat && <CategoryIcon icon={activeCat.icon} size={18} />}
          </button>
          {categoryOpen && (
            <div className="category-select-dropdown">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`category-select-option${category === c.id ? ' selected' : ''}`}
                  style={{ color: c.color }}
                  onClick={() => { setCategory(c.id); setCategoryOpen(false) }}
                >
                  <CategoryIcon icon={c.icon} />
                  {categoryLabel(c, t)}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          ref={inputRef}
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
})

export default AddTask
