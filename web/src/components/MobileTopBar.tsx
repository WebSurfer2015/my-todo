import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { formatSavedAt } from '../utils'
import { useLang } from '../LangContext'

interface Props {
  drawerOpen: boolean
  onToggleDrawer: () => void
  title: string
  subtitle?: string
  lastSavedAt?: number | null
}

export default function MobileTopBar({ drawerOpen, onToggleDrawer, title, subtitle, lastSavedAt }: Props) {
  const { t } = useLang()
  // Tick once a minute so "just now" → "1 min ago" updates without a write.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (lastSavedAt == null) return
    const id = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [lastSavedAt])

  return (
    <header className="mobile-topbar">
      <button
        type="button"
        className="mobile-topbar-btn"
        onClick={onToggleDrawer}
        aria-label={drawerOpen ? t.cancel : t.categoriesLabel}
      >
        {drawerOpen ? <X size={22} strokeWidth={2.2} /> : <Menu size={22} strokeWidth={2.2} />}
      </button>
      <div className="mobile-topbar-title">
        <span className="mobile-topbar-current">{title}</span>
        {subtitle ? (
          <>
            <span className="mobile-topbar-sep" aria-hidden="true">·</span>
            <span className="mobile-topbar-subtitle">{subtitle}</span>
          </>
        ) : null}
        {lastSavedAt != null && (
          <>
            <span className="mobile-topbar-sep" aria-hidden="true">·</span>
            <span className="mobile-topbar-saved" aria-live="polite">
              {t.saved} · {formatSavedAt(lastSavedAt, t.locale)}
            </span>
          </>
        )}
      </div>
    </header>
  )
}
