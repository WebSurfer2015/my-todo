import { useEffect, useRef, useState, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Subtask, Todo } from '../types'
import { useLang } from '../LangContext'

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

function Plus({ size = 16, strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

interface Props {
  todo: Todo
  onClose: () => void
  onUpdateText: (id: string, text: string) => void
  onAddSubtask: (id: string, text: string) => void
  onToggleSubtask: (id: string, subId: string) => void
  onUpdateSubtaskText: (id: string, subId: string, text: string) => void
  onRemoveSubtask: (id: string, subId: string) => void
}

export default function TaskDetailsModal({
  todo, onClose, onUpdateText, onAddSubtask, onToggleSubtask, onUpdateSubtaskText, onRemoveSubtask,
}: Props) {
  const { t } = useLang()
  const [newText, setNewText] = useState('')
  const [titleEditing, setTitleEditing] = useState(false)
  const [titleText, setTitleText] = useState(todo.text)
  const addInputRef = useRef<HTMLInputElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const subs = todo.subtasks ?? []
  const doneCount = subs.filter((s) => s.done).length

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
    onAddSubtask(todo.id, trimmed)
    setNewText('')
    // Refocus so users can rapidly add multiple subtasks.
    addInputRef.current?.focus()
  }

  function handleNewKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitNew()
    }
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card modal-card--details"
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
          <p className="modal-details-subtitle">
            {t.subtasks}
            {subs.length > 0 && (
              <> · <span className="subtask-progress-text">{t.subtaskProgress(doneCount, subs.length)}</span></>
            )}
          </p>
        </div>

        <ul className="subtask-list">
          {subs.map((s) => (
            <SubtaskRow
              key={s.id}
              parentId={todo.id}
              subtask={s}
              onToggle={onToggleSubtask}
              onUpdateText={onUpdateSubtaskText}
              onRemove={onRemoveSubtask}
            />
          ))}
        </ul>

        <div className="subtask-add-row">
          <input
            ref={addInputRef}
            type="text"
            className="subtask-add-input"
            placeholder={t.addSubtask}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={handleNewKey}
            maxLength={500}
          />
          <button
            type="button"
            className="subtask-add-btn"
            onClick={commitNew}
            disabled={!newText.trim()}
            aria-label={t.add}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function SubtaskRow({
  parentId, subtask, onToggle, onUpdateText, onRemove,
}: {
  parentId: string
  subtask: Subtask
  onToggle: (id: string, subId: string) => void
  onUpdateText: (id: string, subId: string, text: string) => void
  onRemove: (id: string, subId: string) => void
}) {
  const { t } = useLang()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(subtask.text)
  const inputRef = useRef<HTMLInputElement>(null)

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
    <li className={`subtask-row${subtask.done ? ' done' : ''}`}>
      <input
        type="checkbox"
        checked={subtask.done}
        onChange={() => onToggle(parentId, subtask.id)}
        aria-label={subtask.text}
      />
      {editing ? (
        <input
          ref={inputRef}
          className="subtask-text-edit"
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
        <span className="subtask-text" onClick={() => setEditing(true)}>
          {subtask.text}
        </span>
      )}
      <button
        type="button"
        className="subtask-remove"
        onClick={() => onRemove(parentId, subtask.id)}
        aria-label={t.deleteSubtask}
        title={t.deleteSubtask}
      >
        <X size={14} />
      </button>
    </li>
  )
}
