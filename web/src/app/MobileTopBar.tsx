import { Menu, X } from 'lucide-react'
import { useLang } from './LangContext'

interface Props {
  drawerOpen: boolean
  onToggleDrawer: () => void
  title: string
  subtitle?: string
}

export default function MobileTopBar({ drawerOpen, onToggleDrawer, title, subtitle }: Props) {
  const { t } = useLang()
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
      </div>
    </header>
  )
}
