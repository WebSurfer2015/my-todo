import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface SnackbarOptions {
  message: string
  actionLabel?: string
  onAction?: () => void
  durationMs?: number
}

interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'danger'
}

interface SnackbarState extends SnackbarOptions {
  id: number
}

interface ConfirmState extends ConfirmOptions {
  id: number
  resolve: (ok: boolean) => void
}

interface NotifyApi {
  showSnackbar: (opts: SnackbarOptions) => void
  confirm: (opts: ConfirmOptions) => Promise<boolean>
}

const NotifyContext = createContext<NotifyApi>(null!)

const DEFAULT_DURATION = 5000

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const idRef = useRef(0)
  const timerRef = useRef<number | null>(null)

  const dismissSnackbar = useCallback(() => {
    setSnackbar(null)
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const showSnackbar = useCallback((opts: SnackbarOptions) => {
    const id = ++idRef.current
    setSnackbar({ ...opts, id })
    if (timerRef.current) window.clearTimeout(timerRef.current)
    const duration = opts.durationMs ?? DEFAULT_DURATION
    timerRef.current = window.setTimeout(() => {
      setSnackbar((cur) => (cur?.id === id ? null : cur))
      timerRef.current = null
    }, duration)
  }, [])

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      const id = ++idRef.current
      setConfirmState({ ...opts, id, resolve })
    })
  }, [])

  const closeConfirm = useCallback((ok: boolean) => {
    setConfirmState((cur) => {
      if (cur) cur.resolve(ok)
      return null
    })
  }, [])

  const handleAction = useCallback(() => {
    if (snackbar?.onAction) snackbar.onAction()
    dismissSnackbar()
  }, [snackbar, dismissSnackbar])

  const value = useMemo<NotifyApi>(() => ({ showSnackbar, confirm }), [showSnackbar, confirm])

  return (
    <NotifyContext.Provider value={value}>
      {children}
      {snackbar && (
        <Snackbar
          message={snackbar.message}
          actionLabel={snackbar.actionLabel}
          onAction={handleAction}
          onDismiss={dismissSnackbar}
        />
      )}
      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel ?? 'OK'}
          cancelLabel={confirmState.cancelLabel ?? 'Cancel'}
          variant={confirmState.variant ?? 'default'}
          onClose={closeConfirm}
        />
      )}
    </NotifyContext.Provider>
  )
}

export function useNotify(): NotifyApi {
  return useContext(NotifyContext)
}

function Snackbar({
  message, actionLabel, onAction, onDismiss,
}: {
  message: string
  actionLabel?: string
  onAction: () => void
  onDismiss: () => void
}) {
  return createPortal(
    <div className="snackbar" role="status" aria-live="polite">
      <span className="snackbar-message">{message}</span>
      {actionLabel && (
        <button type="button" className="snackbar-action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
      <button
        type="button"
        className="snackbar-close"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        &#x2715;
      </button>
    </div>,
    document.body,
  )
}

function ConfirmDialog({
  title, message, confirmLabel, cancelLabel, variant, onClose,
}: {
  title?: string
  message: string
  confirmLabel: string
  cancelLabel: string
  variant: 'default' | 'danger'
  onClose: (ok: boolean) => void
}) {
  const okRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    okRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false)
      else if (e.key === 'Enter') onClose(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="modal-backdrop" onMouseDown={() => onClose(false)}>
      <div
        className="modal-card modal-card--confirm"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && <h3 className="modal-title">{title}</h3>}
        <p className="modal-message">{message}</p>
        <div className="modal-actions">
          <span className="modal-spacer" />
          <button type="button" className="btn" onClick={() => onClose(false)}>
            {cancelLabel}
          </button>
          <button
            ref={okRef}
            type="button"
            className={variant === 'danger' ? 'btn btn-danger-solid' : 'btn btn-primary'}
            onClick={() => onClose(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
