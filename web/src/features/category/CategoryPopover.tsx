import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CategoryDef, COLOR_PALETTE, categoryLabel } from '../../core-bindings/categories'
import { useLang } from '../../app/LangContext'
import CategoryIcon, { ICON_NAMES } from '../../ui/CategoryIcon'

interface Props {
  category?: CategoryDef
  taskCount: number
  reassignTarget: CategoryDef | null
  canDelete: boolean
  onSave: (data: { label: string; color: string; icon: string }) => void
  onDelete?: () => void
  onClose: () => void
}

const ICON_RESULT_LIMIT = 60

export default function CategoryPopover({ category, taskCount, reassignTarget, canDelete, onSave, onDelete, onClose }: Props) {
  const { t } = useLang()
  const isEdit = !!category
  const seedLabel = category ? categoryLabel(category, t) : ''
  const [label, setLabel] = useState(seedLabel)
  const [color, setColor] = useState(category?.color ?? COLOR_PALETTE[5])
  const [icon, setIcon] = useState(category?.icon ?? 'tag')
  const [iconQuery, setIconQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const filteredIcons = useMemo(() => {
    const q = iconQuery.trim().toLowerCase()
    const matches = q ? ICON_NAMES.filter((n) => n.includes(q)) : ICON_NAMES
    const limited = matches.slice(0, ICON_RESULT_LIMIT)
    if (icon && matches.includes(icon) && !limited.includes(icon)) {
      return [icon, ...limited.slice(0, ICON_RESULT_LIMIT - 1)]
    }
    return limited
  }, [iconQuery, icon])

  function handleSave() {
    const trimmed = label.trim()
    if (!trimmed) {
      inputRef.current?.focus()
      return
    }
    onSave({ label: trimmed, color, icon })
  }

  function handleDelete() {
    if (!onDelete || !canDelete) return
    onDelete()
  }

  const reassignNote = isEdit && taskCount > 0 && reassignTarget
    ? t.deleteCategoryConfirm(category ? categoryLabel(category, t) : '', categoryLabel(reassignTarget, t), taskCount)
    : null

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{isEdit ? t.editCategory : t.addCategory}</h3>

        <label className="modal-field">
          <span className="modal-label">{t.categoryNameLabel}</span>
          <input
            ref={inputRef}
            className="modal-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            maxLength={40}
          />
        </label>

        <div className="modal-field">
          <span className="modal-label">{t.categoryColorLabel}</span>
          <div className="palette">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${color === c ? ' selected' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        <div className="modal-field">
          <span className="modal-label">{t.categoryIconLabel}</span>
          <input
            type="text"
            className="modal-input"
            value={iconQuery}
            onChange={(e) => setIconQuery(e.target.value)}
            placeholder={t.iconSearchPlaceholder}
          />
          <div className="icon-grid">
            {filteredIcons.map((iconKey) => (
              <button
                key={iconKey}
                type="button"
                className={`icon-swatch${icon === iconKey ? ' selected' : ''}`}
                style={{ color }}
                onClick={() => setIcon(iconKey)}
                aria-label={iconKey}
                title={iconKey}
              >
                <CategoryIcon icon={iconKey} size={18} />
              </button>
            ))}
            {filteredIcons.length === 0 && (
              <div className="icon-grid-empty">{t.iconSearchEmpty}</div>
            )}
          </div>
        </div>

        {reassignNote && <p className="modal-note">{reassignNote}</p>}

        <div className="modal-actions">
          {isEdit && onDelete && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDelete}
              disabled={!canDelete}
              title={canDelete ? '' : t.cannotDeleteLast}
            >
              {t.deleteCategoryAction}
            </button>
          )}
          <span className="modal-spacer" />
          <button type="button" className="btn" onClick={onClose}>{t.cancel}</button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>{t.save}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
