import { useEffect, useMemo, useRef, useState, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Priority, Subtask, Todo, PRIORITY_VALUES, PRIORITY_COLORS } from '../types'
import { CategoryDef, categoryLabel } from '../categories'
import { formatDisplayDate, todayLocal } from '../utils'
import { tonalPalette } from '../../../core/src/m3palette'
import PriorityBarsIcon from './PriorityBarsIcon'
import CategoryIcon from './CategoryIcon'
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
}

export default function TaskDetailsModal({
  todo, categories, onClose, onUpdateText, onAddSubtask, onToggleSubtask, onUpdateSubtaskText,
  onUpdateSubtaskPriority, onUpdateSubtaskDueDate, onRemoveSubtask,
}: Props) {
  const { t } = useLang()
  const subs = todo.subtasks ?? []
  const doneCount = subs.filter((s) => s.done).length

  // New-subtask state: defaults inherit from parent, so a quick Enter keeps
  // the new sub aligned with the parent's priority + due date.
  const [newText, setNewText] = useState('')
  const [newPriority, setNewPriority] = useState<Priority>(todo.priority)
  const [newDueDate, setNewDueDate] = useState<string>(todo.dueDate || '')
  const [newPriorityOpen, setNewPriorityOpen] = useState(false)
  const newPriorityRef = useRef<HTMLDivElement>(null)
  const newDateRef = useRef<HTMLInputElement>(null)
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
    onAddSubtask(todo.id, trimmed, newPriority, newDueDate)
    setNewText('')
    setNewPriority(todo.priority)
    setNewDueDate(todo.dueDate || '')
    addInputRef.current?.focus()
  }

  function handleNewKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitNew()
    }
  }

  // Status: derived from subs (or todo.done if no subs)
  let statusLabel: string
  if (subs.length === 0) {
    statusLabel = todo.done ? t.statusDone : t.statusNotStarted
  } else if (doneCount === subs.length) {
    statusLabel = t.statusDone
  } else if (doneCount === 0) {
    statusLabel = t.statusNotStarted
  } else {
    statusLabel = t.statusInProgress
  }

  const cat = categories.find((c) => c.id === todo.category) ?? categories[0]
  const today = todayLocal()
  const parentOverdue = !!todo.dueDate && !todo.done && todo.dueDate < today
  const parentToday = !!todo.dueDate && !todo.done && todo.dueDate === today

  // M3 Expressive dynamic palette derived from the parent's category color.
  // Generates both light and dark variants and exposes them as CSS vars so
  // the stylesheet can theme containers/text/outlines from a single seed.
  const seed = cat?.color ?? '#007AFF'
  const m3Vars = useMemo(() => {
    const light = tonalPalette(seed, false)
    const dark = tonalPalette(seed, true)
    return {
      ['--m3-primary']: light.primary,
      ['--m3-on-primary']: light.onPrimary,
      ['--m3-primary-container']: light.primaryContainer,
      ['--m3-on-primary-container']: light.onPrimaryContainer,
      ['--m3-surface']: light.surface,
      ['--m3-surface-container']: light.surfaceContainer,
      ['--m3-surface-container-high']: light.surfaceContainerHigh,
      ['--m3-outline']: light.outline,
      ['--m3-on-surface']: light.onSurface,
      ['--m3-on-surface-variant']: light.onSurfaceVariant,
      ['--m3d-primary']: dark.primary,
      ['--m3d-on-primary']: dark.onPrimary,
      ['--m3d-primary-container']: dark.primaryContainer,
      ['--m3d-on-primary-container']: dark.onPrimaryContainer,
      ['--m3d-surface']: dark.surface,
      ['--m3d-surface-container']: dark.surfaceContainer,
      ['--m3d-surface-container-high']: dark.surfaceContainerHigh,
      ['--m3d-outline']: dark.outline,
      ['--m3d-on-surface']: dark.onSurface,
      ['--m3d-on-surface-variant']: dark.onSurfaceVariant,
    } as React.CSSProperties
  }, [seed])

  return createPortal(
    <div className="modal-backdrop m3-backdrop" onMouseDown={onClose}>
      <div
        className="m3-dialog"
        style={m3Vars}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t.taskDetails}
      >
        <header className="m3-dialog-header">
          <div className="m3-dialog-title-row">
            {titleEditing ? (
              <input
                ref={titleInputRef}
                className="m3-dialog-title-edit"
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
              <h2
                className="m3-dialog-title"
                onClick={() => setTitleEditing(true)}
                title={t.editTask}
              >
                {todo.text}
              </h2>
            )}
            <button
              type="button"
              className="m3-icon-btn m3-icon-btn--close"
              onClick={onClose}
              aria-label={t.cancel}
            >
              <X size={20} />
            </button>
          </div>
          <div className="m3-dialog-meta">
            <span className={`m3-status-chip m3-status-chip--${subs.length === 0 && !todo.done ? 'notstarted' : doneCount === subs.length && subs.length > 0 ? 'done' : doneCount > 0 ? 'progress' : todo.done ? 'done' : 'notstarted'}`}>
              {statusLabel}
            </span>
            {cat && (
              <span className="m3-meta-chip m3-meta-chip--cat">
                <CategoryIcon icon={cat.icon} size={12} />
                {categoryLabel(cat, t)}
              </span>
            )}
            <span className={`m3-meta-chip m3-meta-chip--date${parentOverdue ? ' is-overdue' : ''}${parentToday ? ' is-today' : ''}${!todo.dueDate ? ' is-empty' : ''}`}>
              {todo.dueDate ? formatDisplayDate(todo.dueDate, t.locale) : t.noDate}
            </span>
            {subs.length > 0 && (
              <span className="m3-meta-chip m3-meta-chip--progress">
                {t.subtaskProgress(doneCount, subs.length)}
              </span>
            )}
          </div>
        </header>

        <ul className="m3-sub-list">
          {subs.map((s) => (
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

        <div className="m3-add-card">
          <input
            ref={addInputRef}
            type="text"
            className="m3-add-input"
            placeholder={t.addSubtask}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={handleNewKey}
            maxLength={500}
          />
          <div className="priority-edit" ref={newPriorityRef}>
            <button
              type="button"
              className={`m3-icon-btn priority-${newPriority}`}
              onClick={() => setNewPriorityOpen((v) => !v)}
              aria-label={t.priorityLabel(t.priority[newPriority])}
              title={t.setPriority}
            >
              <PriorityBarsIcon level={newPriority} />
            </button>
            {newPriorityOpen && (
              <div className="item-priority-dropdown">
                {PRIORITY_VALUES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`item-priority-option${newPriority === value ? ' selected' : ''}`}
                    style={{ color: PRIORITY_COLORS[value] }}
                    onClick={() => { setNewPriority(value); setNewPriorityOpen(false) }}
                  >
                    <span className="item-priority-icon"><PriorityBarsIcon level={value} /></span>
                    {t.priority[value]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="due-date-edit">
            <input
              ref={newDateRef}
              type="date"
              className="date-input-hidden"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
            />
            <button
              type="button"
              className={`m3-meta-chip m3-meta-chip--date${!newDueDate ? ' is-empty' : ''}`}
              onClick={() => newDateRef.current?.showPicker()}
              title={t.setDueDate}
              aria-label={t.setDueDate}
            >
              {newDueDate ? formatDisplayDate(newDueDate, t.locale) : t.noDate}
            </button>
          </div>
          <button
            type="button"
            className="m3-fab"
            onClick={commitNew}
            disabled={!newText.trim()}
            aria-label={t.add}
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
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
    <li className={`m3-sub-card${subtask.done ? ' is-done' : ''}`}>
      <button
        type="button"
        className={`m3-sub-check${subtask.done ? ' is-checked' : ''}`}
        onClick={() => onToggle(parentId, subtask.id)}
        aria-label={subtask.text}
        aria-pressed={subtask.done}
      >
        {subtask.done && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      <div className="m3-sub-card-body">
        <div className="m3-sub-card-main">
          {editing ? (
            <input
              ref={inputRef}
              className="m3-sub-card-text-edit"
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
              className="m3-sub-card-text"
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
                className={`m3-icon-btn priority-${priority}`}
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
        <div className="m3-sub-card-meta">
          {onUpdateDueDate && (
            <div className="due-date-edit">
              <input
                ref={dateRef}
                type="date"
                className="date-input-hidden"
                value={dueDate}
                onChange={(e) => onUpdateDueDate(parentId, subtask.id, e.target.value)}
              />
              <button
                type="button"
                className={`m3-meta-chip m3-meta-chip--date${overdue ? ' is-overdue' : ''}${isToday ? ' is-today' : ''}${!dueDate ? ' is-empty' : ''}`}
                onClick={() => dateRef.current?.showPicker()}
                title={t.setDueDate}
                aria-label={t.setDueDate}
              >
                {dueDate ? formatDisplayDate(dueDate, t.locale) : t.noDate}
              </button>
            </div>
          )}
          <button
            type="button"
            className="m3-icon-btn m3-icon-btn--delete"
            onClick={() => onRemove(parentId, subtask.id)}
            title={t.deleteSubtask}
            aria-label={t.deleteSubtask}
          >
            <Trash2 size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
    </li>
  )
}
