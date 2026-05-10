import { Menu, X } from 'lucide-react'
import AvatarView from './Avatar'
import { Profile } from '../profile'
import { useLang } from '../LangContext'

interface Props {
  drawerOpen: boolean
  onToggleDrawer: () => void
  profile: Profile
  title: string
}

export default function MobileTopBar({ drawerOpen, onToggleDrawer, profile, title }: Props) {
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
        <div className="mobile-topbar-identity">
          <AvatarView avatar={profile.avatar} size={22} alt={profile.name} />
          <span className="mobile-topbar-name">{profile.name}</span>
        </div>
        <span className="mobile-topbar-current">{title}</span>
      </div>
      <span className="mobile-topbar-spacer" />
    </header>
  )
}
