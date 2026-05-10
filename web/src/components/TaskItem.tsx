import { memo, useEffect, useRef, useState } from 'react'
import { Category, Priority, Todo, PRIORITY_VALUES, PRIORITY_COLORS } from '../types'
import { CategoryDef, categoryLabel } from '../categories'
import { formatDisplayDate, todayLocal } from '../utils'
import PriorityBarsIcon from './PriorityBarsIcon'
import CategoryIcon from './CategoryIcon'
import { useLang } from '../LangContext'
import { useCloseOnOutside } from '../hooks'
import { useNotify } from '../notify'

interface IconProps {
  size?: number
  strokeWidth?: number
}

function Trash2({ size = 14, strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  )
}

function Undo2({ size = 14, strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
    </svg>
  )
}

function X({ size = 15, strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  )
}

interface Props {
  todo: Todo
  categories: CategoryDef[]
  inTrash: boolean
  selected?: boolean
  bulkSelecting?: boolean
  onToggleSelect?: (id: string, shiftKey: boolean) => void
  onToggle: (id: string) => void
  onMoveToTrash: (id: string) => void
  onRestore: (id: string) => void
  onPermanentDelete: (id: string) => void
  onUpdatePriority: (id: string, priority: Priority) => void
  onUpdateDueDate: (id: string, dueDate: string) => void
  onUpdateCategory: (id: string, category: Category) => void
  onUpdateText: (id: string, text: string) => void
}

function TaskItem({
  todo, categories, inTrash, selected = false, bulkSelecting = false, onToggleSelect,
  onToggle, onMoveToTrash, onRestore, onPermanentDelete,
  onUpdatePriority, onUpdateDueDate, onUpdateCategory, onUpdateText,
}: Props) {
  const { t } = useLang()
  const notify = useNotify()
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(todo.text)
  const priorityRef = useRef<HTMLDivElement>(null)
  const categoryRef = useRef<HTMLDivElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const overdue = !!todo.dueDate && !todo.done && todo.dueDate < todayLocal()
  const cat = categories.find((c) => c.id === todo.category) ?? categories[0]

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

  async function handlePermanentDelete() {
    const ok = await notify.confirm({
      title: t.deletePermanently,
      message: t.deletePermanentlyConfirm(todo.text),
      confirmLabel: t.deletePermanently,
      cancelLabel: t.cancel,
      variant: 'danger',
    })
    if (ok) onPermanentDelete(todo.id)
  }

  return (
    <li
      className={`item${todo.done ? ' done' : ''}${inTrash ? ' trashed' : ''}${selected ? ' selected' : ''}`}
      style={{ ['--cat-color' as string]: cat?.color }}
    >
      {inTrash ? (
        <input
          type="checkbox"
          className="select-checkbox"
          checked={selected}
          onChange={() => undefined}
          onClick={(e) => onToggleSelect?.(todo.id, e.shiftKey)}
          aria-label={t.selectTask}
        />
      ) : (
        <input
          type="checkbox"
          checked={todo.done}
          onChange={() => onToggle(todo.id)}
        />
      )}
      <div className="item-body">
        <div className="item-main">
          {editing && !inTrash ? (
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
              onClick={() => !inTrash && setEditing(true)}
              title={inTrash ? '' : t.editTask}
            >
              {todo.text}
            </span>
          )}
          <div className="priority-edit" ref={priorityRef}>
            <button
              type="button"
              className={`priority-icon-btn priority-${todo.priority}`}
              onClick={() => !inTrash && setPriorityOpen((v) => !v)}
              aria-label={t.priorityLabel(t.priority[todo.priority])}
              title={inTrash ? '' : t.setPriority}
              disabled={inTrash}
            >
              <PriorityBarsIcon level={todo.priority} />
            </button>
            {priorityOpen && !inTrash && (
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
              className="category-chip"
              style={{ color: cat?.color }}
              onClick={() => !inTrash && setCategoryOpen((v) => !v)}
              title={inTrash ? '' : t.setCategory}
              aria-label={t.setCategory}
              disabled={inTrash}
            >
              {cat && <CategoryIcon icon={cat.icon} size={11} />}
              {cat ? categoryLabel(cat, t) : ''}
            </button>
            {categoryOpen && !inTrash && (
              <div className="category-item-dropdown">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`category-option${todo.category === c.id ? ' selected' : ''}`}
                    style={{ color: c.color }}
                    onClick={() => { onUpdateCategory(todo.id, c.id); setCategoryOpen(false) }}
                  >
                    <CategoryIcon icon={c.icon} size={13} />
                    {categoryLabel(c, t)}
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
              disabled={inTrash}
            />
            <button
              type="button"
              className={`date-chip${overdue ? ' overdue' : ''}${!todo.dueDate ? ' no-date' : ''}`}
              onClick={() => !inTrash && dateRef.current?.showPicker()}
              title={inTrash ? '' : t.setDueDate}
              aria-label={t.setDueDate}
              disabled={inTrash}
            >
              {todo.dueDate
                ? (overdue ? t.overdue : '') + formatDisplayDate(todo.dueDate, t.locale)
                : t.noDate}
            </button>
          </div>

          <div className="item-actions">
            {inTrash ? (
              <>
                <button
                  type="button"
                  className="item-action item-action--restore"
                  onClick={() => onRestore(todo.id)}
                  disabled={bulkSelecting}
                  title={t.restoreTask}
                  aria-label={t.restoreTask}
                >
                  <Undo2 size={14} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="item-action item-action--delete"
                  onClick={handlePermanentDelete}
                  disabled={bulkSelecting}
                  title={t.deletePermanently}
                  aria-label={t.deletePermanently}
                >
                  <X size={15} strokeWidth={2} />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="item-action item-action--trash"
                onClick={() => onMoveToTrash(todo.id)}
                title={t.moveToTrash}
                aria-label={t.moveToTrash}
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

export default memo(TaskItem)
