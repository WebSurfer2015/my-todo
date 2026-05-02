import { useEffect, useRef, useState } from 'react'
import { Category, Priority, Todo, PRIORITY_VALUES, PRIORITY_COLORS, CATEGORY_VALUES, CATEGORY_COLORS } from '../types'
import { formatDisplayDate, todayLocal } from '../utils'
import PriorityBarsIcon from './PriorityBarsIcon'
import CategoryIcon from './CategoryIcon'
import { useLang } from '../LangContext'
import { useCloseOnOutside } from '../hooks'

interface Props {
  todo: Todo
  onToggle: (id: number) => void
  onRemove: (id: number) => void
  onUpdatePriority: (id: number, priority: Priority) => void
  onUpdateDueDate: (id: number, dueDate: string) => void
  onUpdateCategory: (id: number, category: Category) => void
  onUpdateText: (id: number, text: string) => void
}

export default function TaskItem({ todo, onToggle, onRemove, onUpdatePriority, onUpdateDueDate, onUpdateCategory, onUpdateText }: Props) {
  const { t } = useLang()
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(todo.text)
  const priorityRef = useRef<HTMLDivElement>(null)
  const categoryRef = useRef<HTMLDivElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const overdue = !!todo.dueDate && !todo.done && todo.dueDate < todayLocal()

  useCloseOnOutside(priorityRef, priorityOpen, () => setPriorityOpen(false))
  useCloseOnOutside(categoryRef, categoryOpen, () => setCategoryOpen(false))

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function commitEdit() {
    const trimmed = editText.trim()
    if (trimmed && trimmed !== todo.text) onUpdateText(todo.id, trimmed)
    else setEditText(todo.text)
    setEditing(false)
  }

  function cancelEdit() {
    setEditText(todo.text)
    setEditing(false)
  }

  const catClass = todo.category ? `cat-${todo.category}` : 'cat-none'

  return (
    <li className={`item ${catClass}${todo.done ? ' done' : ''}`}>
      <input
        type="checkbox"
        checked={todo.done}
        onChange={() => onToggle(todo.id)}
      />
      <div className="item-body">
        <div className="item-main">
          {editing ? (
            <input
              ref={inputRef}
              className="item-text-edit"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit()
                else if (e.key === 'Escape') cancelEdit()
              }}
              maxLength={200}
            />
          ) : (
            <span
              className="item-text"
              onClick={() => !todo.done && setEditing(true)}
              title={todo.done ? '' : 'Click to edit'}
            >
              {todo.text}
            </span>
          )}
          <div className="priority-edit" ref={priorityRef}>
            <button
              type="button"
              className={`priority-icon-btn priority-${todo.priority}`}
              onClick={() => setPriorityOpen((v) => !v)}
              aria-label={t.priorityLabel(t.priority[todo.priority])}
            >
              <PriorityBarsIcon level={todo.priority} />
            </button>
            {priorityOpen && (
              <div className="item-priority-dropdown">
                {PRIORITY_VALUES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`item-priority-option${todo.priority === value ? ' selected' : ''}`}
                    style={{ color: PRIORITY_COLORS[value] }}
                    onClick={() => { onUpdatePriority(todo.id, value); setPriorityOpen(false) }}
                  >
                    <span className="item-priority-icon"><PriorityBarsIcon level={value} /></span>
                    {t.priority[value]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="item-meta">
          <div className="category-edit" ref={categoryRef}>
            <button
              type="button"
              className={`category-chip${todo.category ? ` cat-${todo.category}` : ' no-category'}`}
              onClick={() => setCategoryOpen((v) => !v)}
            >
              {todo.category && <CategoryIcon category={todo.category} size={11} />}
              {todo.category ? t.categories[todo.category] : t.noCategory}
            </button>
            {categoryOpen && (
              <div className="category-item-dropdown">
                {CATEGORY_VALUES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`category-option${todo.category === value ? ' selected' : ''}`}
                    style={{ color: CATEGORY_COLORS[value] }}
                    onClick={() => { onUpdateCategory(todo.id, value); setCategoryOpen(false) }}
                  >
                    <CategoryIcon category={value} size={13} />
                    {t.categories[value]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="due-date-edit">
            <input
              ref={dateRef}
              type="date"
              className="date-input-hidden"
              value={todo.dueDate}
              onChange={(e) => onUpdateDueDate(todo.id, e.target.value)}
            />
            <button
              type="button"
              className={`date-chip${overdue ? ' overdue' : ''}${!todo.dueDate ? ' no-date' : ''}`}
              onClick={() => dateRef.current?.showPicker()}
            >
              {todo.dueDate
                ? (overdue ? t.overdue : '') + formatDisplayDate(todo.dueDate, t.locale)
                : t.noDate}
            </button>
          </div>
        </div>
      </div>
      <button
        className="btn-delete"
        onClick={() => onRemove(todo.id)}
        title={t.deleteTask}
        aria-label={t.deleteTask}
      >
        &#x2715;
      </button>
    </li>
  )
}
