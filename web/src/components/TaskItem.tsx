import { memo, useRef, useState } from 'react'
import { Category, Priority, Subtask, Todo, PRIORITY_VALUES, PRIORITY_COLORS } from '../types'
import { CategoryDef, categoryLabel } from '../categories'
import { formatDisplayDate, todayLocal } from '../utils'
import { sortedSubs } from '../../../core/src/derive'
import PriorityBarsIcon from './PriorityBarsIcon'
import CategoryIcon from './CategoryIcon'
import TaskDetailsModal from './TaskDetailsModal'
import { useLang } from '../LangContext'
import { useCloseOnOutside } from '../hooks'
import { useNotify } from '../notify'

export type SubtaskVisibility = 'all' | 'open' | 'done'

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

function ChevronRight({ size = 14, strokeWidth = 2.5 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

interface Props {
  todo: Todo
  categories: CategoryDef[]
  inTrash: boolean
  selected?: boolean
  bulkSelecting?: boolean
  /** @deprecated kept for backward compat; inline list always shows all subs now */
  subtaskVisibility?: SubtaskVisibility
  onToggleSelect?: (id: string, shiftKey: boolean) => void
  onToggle: (id: string) => void
  onMoveToTrash: (id: string) => void
  onRestore: (id: string) => void
  onPermanentDelete: (id: string) => void
  onUpdatePriority: (id: string, priority: Priority) => void
  onUpdateDueDate: (id: string, dueDate: string) => void
  onUpdateCategory: (id: string, category: Category) => void
  onUpdateText: (id: string, text: string) => void
  onAddSubtask?: (id: string, text: string, priority?: Priority, dueDate?: string) => void
  onToggleSubtask?: (id: string, subId: string) => void
  onUpdateSubtaskText?: (id: string, subId: string, text: string) => void
  onUpdateSubtaskPriority?: (id: string, subId: string, priority: Priority) => void
  onUpdateSubtaskDueDate?: (id: string, subId: string, dueDate: string) => void
  onRemoveSubtask?: (id: string, subId: string) => void
}

function TaskItem({
  todo, categories, inTrash, selected = false, bulkSelecting = false,
  subtaskVisibility: _subtaskVisibility = 'all',
  onToggleSelect,
  onToggle, onMoveToTrash, onRestore, onPermanentDelete,
  onUpdatePriority, onUpdateDueDate, onUpdateCategory, onUpdateText,
  onAddSubtask, onToggleSubtask, onUpdateSubtaskText,
  onUpdateSubtaskPriority, onUpdateSubtaskDueDate, onRemoveSubtask,
}: Props) {
  const { t } = useLang()
  const notify = useNotify()
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const subs = todo.subtasks ?? []
  const hasSubs = subs.length > 0
  const subsDoneCount = subs.filter((s) => s.done).length
  const detailsAvailable =
    !!onAddSubtask && !!onToggleSubtask && !!onUpdateSubtaskText && !!onRemoveSubtask
  const priorityRef = useRef<HTMLDivElement>(null)
  const categoryRef = useRef<HTMLDivElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)

  const today = todayLocal()
  const overdue = !!todo.dueDate && !todo.done && todo.dueDate < today
  const isToday = !!todo.dueDate && !todo.done && todo.dueDate === today
  const cat = categories.find((c) => c.id === todo.category) ?? categories[0]

  useCloseOnOutside(priorityRef, priorityOpen, () => setPriorityOpen(false))
  useCloseOnOutside(categoryRef, categoryOpen, () => setCategoryOpen(false))

  // Always show all subs inline, sorted: open first, then earliest due
  // date, then high priority first.
  const visibleSubs = sortedSubs(subs)

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

  function handleTextClick() {
    if (inTrash) return
    if (detailsAvailable) setDetailsOpen(true)
  }

  return (
    <li
      className={`item${todo.done ? ' done' : ''}${inTrash ? ' trashed' : ''}${selected ? ' selected' : ''}${expanded ? ' expanded' : ''}${hasSubs ? ' has-subs' : ''}`}
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
      ) : hasSubs ? (
        <button
          type="button"
          className={`expand-toggle${expanded ? ' expanded' : ''}${todo.done ? ' done' : ''}`}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          title={t.subtasks}
          aria-label={t.subtaskProgress(subsDoneCount, subs.length)}
        >
          <ChevronRight size={16} />
        </button>
      ) : (
        <input
          type="checkbox"
          checked={todo.done}
          onChange={() => onToggle(todo.id)}
        />
      )}
      <div className="item-body">
        <div className="item-main">
          <span
            className={`item-text${detailsAvailable && !inTrash ? ' clickable' : ''}`}
            onClick={handleTextClick}
            title={inTrash ? '' : t.taskDetails}
          >
            {todo.text}
          </span>
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
          <span className="meta-dot" aria-hidden="true">·</span>
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
              className={`date-chip${overdue ? ' overdue' : ''}${isToday ? ' today' : ''}${!todo.dueDate ? ' no-date' : ''}`}
              onClick={() => !inTrash && dateRef.current?.showPicker()}
              title={inTrash ? '' : t.setDueDate}
              aria-label={t.setDueDate}
              disabled={inTrash}
            >
              {todo.dueDate
                ? formatDisplayDate(todo.dueDate, t.locale)
                : t.noDate}
            </button>
          </div>

          {hasSubs && !inTrash && (
            <span
              className="subtask-progress-pill"
              aria-hidden="true"
              title={t.subtaskProgress(subsDoneCount, subs.length)}
            >
              {t.subtaskProgress(subsDoneCount, subs.length)}
            </span>
          )}

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

        {expanded && detailsAvailable && !inTrash && visibleSubs.length > 0 && (
          <ul className="subtask-inline-list">
            {visibleSubs.map((s) => (
              <SubtaskInlineRow
                key={s.id}
                parentId={todo.id}
                subtask={s}
                onToggle={onToggleSubtask!}
                onUpdatePriority={onUpdateSubtaskPriority}
                onUpdateDueDate={onUpdateSubtaskDueDate}
                onRemove={onRemoveSubtask}
                onOpenDetails={() => setDetailsOpen(true)}
              />
            ))}
          </ul>
        )}
      </div>
      {detailsOpen && detailsAvailable && (
        <TaskDetailsModal
          todo={todo}
          categories={categories}
          onClose={() => setDetailsOpen(false)}
          onUpdateText={onUpdateText}
          onAddSubtask={onAddSubtask!}
          onToggleSubtask={onToggleSubtask!}
          onUpdateSubtaskText={onUpdateSubtaskText!}
          onUpdateSubtaskPriority={onUpdateSubtaskPriority}
          onUpdateSubtaskDueDate={onUpdateSubtaskDueDate}
          onRemoveSubtask={onRemoveSubtask!}
        />
      )}
    </li>
  )
}

function SubtaskInlineRow({
  parentId, subtask, onToggle, onUpdatePriority, onUpdateDueDate, onRemove, onOpenDetails,
}: {
  parentId: string
  subtask: Subtask
  onToggle: (id: string, subId: string) => void
  onUpdatePriority?: (id: string, subId: string, priority: Priority) => void
  onUpdateDueDate?: (id: string, subId: string, dueDate: string) => void
  onRemove?: (id: string, subId: string) => void
  onOpenDetails: () => void
}) {
  const { t } = useLang()
  const [priorityOpen, setPriorityOpen] = useState(false)
  const priorityRef = useRef<HTMLDivElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  useCloseOnOutside(priorityRef, priorityOpen, () => setPriorityOpen(false))

  const priority: Priority = subtask.priority ?? 'medium'
  const dueDate = subtask.dueDate ?? ''
  const today = todayLocal()
  const overdue = !!dueDate && !subtask.done && dueDate < today
  const isToday = !!dueDate && !subtask.done && dueDate === today

  return (
    <li className={`subtask-row-inline${subtask.done ? ' done' : ''}`}>
      <input
        type="checkbox"
        className="subtask-inline-checkbox"
        checked={subtask.done}
        onChange={() => onToggle(parentId, subtask.id)}
      />
      <div className="subtask-inline-body">
        <div className="subtask-inline-main">
          <span
            className="subtask-inline-text clickable"
            onClick={onOpenDetails}
            title={t.editTask}
          >
            {subtask.text}
          </span>
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
        {onRemove && (
          <button
            type="button"
            className="subtask-inline-remove"
            onClick={() => onRemove(parentId, subtask.id)}
            title={t.deleteSubtask}
            aria-label={t.deleteSubtask}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </li>
  )
}

export default memo(TaskItem)
