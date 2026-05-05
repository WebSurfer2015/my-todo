import { Menu, X } from 'lucide-react'
import { useLang } from '../LangContext'

interface Props {
  drawerOpen: boolean
  onToggleDrawer: () => void
  title: string
  parent?: string
}

export default function MobileTopBar({ drawerOpen, onToggleDrawer, title, parent }: Props) {
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
        {parent ? <span className="mobile-topbar-parent">{parent}</span> : null}
        <span className="mobile-topbar-current">{title}</span>
      </div>
      <span className="mobile-topbar-spacer" />
    </header>
  )
}
