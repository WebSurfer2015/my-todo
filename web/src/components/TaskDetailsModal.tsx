import { useEffect, useRef, useState, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Priority, Subtask, Todo, PRIORITY_VALUES, PRIORITY_COLORS } from '../types'
import { CategoryDef, categoryLabel } from '../categories'
import { formatDisplayDate, todayLocal } from '../utils'
import { sortedSubs } from '../../../core/src/derive'
import PriorityBarsIcon from './PriorityBarsIcon'
import CategoryIcon from './CategoryIcon'
import SuggestStepsPanel from './SuggestStepsPanel'
import { useLang } from '../LangContext'
import { useCloseOnOutside } from '../hooks'

interface IconProps {
  size?: number
  strokeWidth?: number
}

function X({ size = 18, strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  )
}

function Plus({ size = 16, strokeWidth = 2.4 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
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

interface Props {
  todo: Todo
  categories: CategoryDef[]
  onClose: () => void
  onUpdateText: (id: string, text: string) => void
  onAddSubtask: (id: string, text: string, priority?: Priority, dueDate?: string) => void
  onToggleSubtask: (id: string, subId: string) => void
  onUpdateSubtaskText: (id: string, subId: string, text: string) => void
  onUpdateSubtaskPriority?: (id: string, subId: string, priority: Priority) => void
  onUpdateSubtaskDueDate?: (id: string, subId: string, dueDate: string) => void
  onRemoveSubtask: (id: string, subId: string) => void
  /** When true, shows the "Suggest steps" panel for empty subtask lists.
   * Off by default; flipped by profile.agentEnabled at the call site. */
  agentEnabled?: boolean
}

export default function TaskDetailsModal({
  todo, categories, onClose, onUpdateText, onAddSubtask, onToggleSubtask, onUpdateSubtaskText,
  onUpdateSubtaskPriority, onUpdateSubtaskDueDate, onRemoveSubtask, agentEnabled,
}: Props) {
  const { t } = useLang()
  const subs = todo.subtasks ?? []
  const doneCount = subs.filter((s) => s.done).length

  // New-subtask state: defaults inherit from parent's priority. Date is
  // always inherited from the parent (no per-sub date in the add row).
  const [newText, setNewText] = useState('')
  const [newPriority, setNewPriority] = useState<Priority>(todo.priority)
  const [newPriorityOpen, setNewPriorityOpen] = useState(false)
  const newPriorityRef = useRef<HTMLDivElement>(null)
  useCloseOnOutside(newPriorityRef, newPriorityOpen, () => setNewPriorityOpen(false))

  const [titleEditing, setTitleEditing] = useState(false)
  const [titleText, setTitleText] = useState(todo.text)
  const addInputRef = useRef<HTMLInputElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (titleEditing) {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }
  }, [titleEditing])

  function commitTitle() {
    const trimmed = titleText.trim()
    if (trimmed && trimmed !== todo.text) onUpdateText(todo.id, trimmed)
    else setTitleText(todo.text)
    setTitleEditing(false)
  }

  function cancelTitle() {
    setTitleText(todo.text)
    setTitleEditing(false)
  }

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function commitNew() {
    const trimmed = newText.trim()
    if (!trimmed) return
    // No automatic date inheritance — sub starts with no date, user can pick later.
    onAddSubtask(todo.id, trimmed, newPriority, '')
    setNewText('')
    setNewPriority(todo.priority)
    addInputRef.current?.focus()
  }

  function handleNewKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitNew()
    }
  }

  const cat = categories.find((c) => c.id === todo.category) ?? categories[0]
  const today = todayLocal()
  const parentOverdue = !!todo.dueDate && !todo.done && todo.dueDate < today
  const parentToday = !!todo.dueDate && !todo.done && todo.dueDate === today

  return createPortal(
    <div className="task-panel-overlay" onMouseDown={onClose}>
      <aside
        className="task-panel"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t.taskDetails}
      >
        <div className="modal-details-header">
          <div className="modal-details-title-row">
            {titleEditing ? (
              <input
                ref={titleInputRef}
                className="modal-title-edit"
                value={titleText}
                onChange={(e) => setTitleText(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitTitle()
                  else if (e.key === 'Escape') cancelTitle()
                }}
                maxLength={200}
              />
            ) : (
              <h3
                className="modal-title modal-title--editable"
                onClick={() => setTitleEditing(true)}
                title={t.editTask}
              >
                {todo.text}
              </h3>
            )}
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label={t.cancel}
            >
              <X size={18} />
            </button>
          </div>
          <div className="modal-details-subtitle">
            {cat && (
              <span className="modal-meta-cat" style={{ color: cat.color }}>
                <CategoryIcon icon={cat.icon} size={11} />
                {categoryLabel(cat, t)}
              </span>
            )}
            {cat && <span className="modal-meta-sep">·</span>}
            <span className={`modal-meta-date${parentOverdue ? ' overdue' : ''}${parentToday ? ' today' : ''}${!todo.dueDate ? ' no-date' : ''}`}>
              {todo.dueDate ? formatDisplayDate(todo.dueDate, t.locale) : t.noDate}
            </span>
            {subs.length > 0 && (
              <>
                <span className="modal-meta-sep">·</span>
                <span className="subtask-progress-text">{t.subtaskProgress(doneCount, subs.length)}</span>
              </>
            )}
          </div>
        </div>

        <ul className="list subtask-card-list">
          {sortedSubs(subs).map((s) => (
            <SubtaskCard
              key={s.id}
              parentId={todo.id}
              subtask={s}
              onToggle={onToggleSubtask}
              onUpdateText={onUpdateSubtaskText}
              onUpdatePriority={onUpdateSubtaskPriority}
              onUpdateDueDate={onUpdateSubtaskDueDate}
              onRemove={onRemoveSubtask}
            />
          ))}
        </ul>

        {agentEnabled && subs.length === 0 && (
          <SuggestStepsPanel
            parentTitle={todo.text}
            parentNotes={todo.notes}
            onAddSelected={(texts) => {
              for (const text of texts) {
                onAddSubtask(todo.id, text, todo.priority, '')
              }
            }}
          />
        )}

        <div className="input-row">
          <div className="task-input-wrapper">
            <input
              ref={addInputRef}
              type="text"
              placeholder={t.addSubtask}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={handleNewKey}
              maxLength={500}
            />
            <div className="priority-trigger" ref={newPriorityRef}>
              <button
                type="button"
                className="priority-trigger-btn"
                style={{ color: PRIORITY_COLORS[newPriority] }}
                onClick={() => setNewPriorityOpen((v) => !v)}
                aria-label={t.priorityLabel(t.priority[newPriority])}
                title={t.setPriority}
              >
                <PriorityBarsIcon level={newPriority} />
              </button>
              {newPriorityOpen && (
                <div className="priority-dropdown">
                  {PRIORITY_VALUES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`priority-option${newPriority === value ? ' selected' : ''}`}
                      style={{ color: newPriority === value ? PRIORITY_COLORS[value] : undefined }}
                      onClick={() => { setNewPriority(value); setNewPriorityOpen(false) }}
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
          <button
            type="button"
            className="btn btn-add"
            onClick={commitNew}
            disabled={!newText.trim()}
          >
            <Plus size={16} />
            <span>{t.add}</span>
          </button>
        </div>
      </aside>
    </div>,
    document.body,
  )
}

function SubtaskCard({
  parentId, subtask,
  onToggle, onUpdateText, onUpdatePriority, onUpdateDueDate, onRemove,
}: {
  parentId: string
  subtask: Subtask
  onToggle: (id: string, subId: string) => void
  onUpdateText: (id: string, subId: string, text: string) => void
  onUpdatePriority?: (id: string, subId: string, priority: Priority) => void
  onUpdateDueDate?: (id: string, subId: string, dueDate: string) => void
  onRemove: (id: string, subId: string) => void
}) {
  const { t } = useLang()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(subtask.text)
  const [priorityOpen, setPriorityOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const priorityRef = useRef<HTMLDivElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  useCloseOnOutside(priorityRef, priorityOpen, () => setPriorityOpen(false))

  const priority: Priority = subtask.priority ?? 'medium'
  const dueDate = subtask.dueDate ?? ''
  const today = todayLocal()
  const overdue = !!dueDate && !subtask.done && dueDate < today
  const isToday = !!dueDate && !subtask.done && dueDate === today

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function commit() {
    const trimmed = text.trim()
    if (trimmed && trimmed !== subtask.text) onUpdateText(parentId, subtask.id, trimmed)
    else setText(subtask.text)
    setEditing(false)
  }

  function cancel() {
    setText(subtask.text)
    setEditing(false)
  }

  return (
    <li className={`subtask-row-inline${subtask.done ? ' done' : ''}`}>
      <input
        type="checkbox"
        className="subtask-inline-checkbox"
        checked={subtask.done}
        onChange={() => onToggle(parentId, subtask.id)}
        aria-label={subtask.text}
      />
      <div className="subtask-inline-body">
        <div className="subtask-inline-main">
          {editing ? (
            <input
              ref={inputRef}
              className="subtask-inline-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                else if (e.key === 'Escape') cancel()
              }}
              maxLength={500}
            />
          ) : (
            <span
              className="subtask-inline-text clickable"
              onClick={() => setEditing(true)}
              title={t.editTask}
            >
              {subtask.text}
            </span>
          )}
          {onUpdatePriority && (
            <div className="priority-edit" ref={priorityRef}>
              <button
                type="button"
                className={`priority-icon-btn priority-${priority}`}
                onClick={() => setPriorityOpen((v) => !v)}
                aria-label={t.priorityLabel(t.priority[priority])}
                title={t.setPriority}
              >
                <PriorityBarsIcon level={priority} />
              </button>
              {priorityOpen && (
                <div className="item-priority-dropdown">
                  {PRIORITY_VALUES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`item-priority-option${priority === value ? ' selected' : ''}`}
                      style={{ color: PRIORITY_COLORS[value] }}
                      onClick={() => { onUpdatePriority(parentId, subtask.id, value); setPriorityOpen(false) }}
                    >
                      <span className="item-priority-icon"><PriorityBarsIcon level={value} /></span>
                      {t.priority[value]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {onUpdateDueDate && (
          <div className="due-date-edit subtask-inline-meta">
            <input
              ref={dateRef}
              type="date"
              className="date-input-hidden"
              value={dueDate}
              onChange={(e) => onUpdateDueDate(parentId, subtask.id, e.target.value)}
            />
            <button
              type="button"
              className={`date-chip${overdue ? ' overdue' : ''}${isToday ? ' today' : ''}${!dueDate ? ' no-date' : ''}`}
              onClick={() => dateRef.current?.showPicker?.()}
              title={dueDate ? formatDisplayDate(dueDate, t.locale) : t.setDueDate}
              aria-label={t.setDueDate}
            >
              {dueDate ? formatDisplayDate(dueDate, t.locale) : t.noDate}
            </button>
          </div>
        )}
        <button
          type="button"
          className="subtask-inline-remove"
          onClick={() => onRemove(parentId, subtask.id)}
          title={t.deleteSubtask}
          aria-label={t.deleteSubtask}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  )
}
