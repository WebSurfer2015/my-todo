import { CATEGORY_VALUES, CATEGORY_COLORS, Category, Filter } from '../types'
import CategoryIcon from './CategoryIcon'
import { useLang } from '../LangContext'

interface Props {
  filter: Filter
  onFilter: (f: Filter) => void
  counts: Record<Filter, number>
  greetingKey: 'morning' | 'afternoon' | 'evening'
}

function AllIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 13l-3.5 7a1 1 0 01-.9.5H6.4a1 1 0 01-.9-.5L2 13" />
      <path d="M5 13V5a2 2 0 012-2h10a2 2 0 012 2v8" />
      <path d="M9 13h6" />
    </svg>
  )
}

function DoneIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  )
}

interface ItemProps {
  active: boolean
  color: string
  icon: React.ReactNode
  label: string
  count: number
  onClick: () => void
}

function SidebarItem({ active, color, icon, label, count, onClick }: ItemProps) {
  return (
    <button
      className={`sidebar-item${active ? ' active' : ''}`}
      onClick={onClick}
      style={active ? { ['--accent' as string]: color } : undefined}
    >
      <span className="sidebar-item-icon" style={{ color }}>{icon}</span>
      <span className="sidebar-item-label">{label}</span>
      {count > 0 && <span className="sidebar-item-count">{count}</span>}
    </button>
  )
}

export default function Sidebar({ filter, onFilter, counts, greetingKey }: Props) {
  const { t, lang, toggle: toggleLang } = useLang()
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img src="/avatar.jpg" alt="Ying" className="sidebar-avatar" />
        <div className="sidebar-identity">
          <div className="sidebar-name">Ying</div>
          <div className="sidebar-greeting">{t.greeting[greetingKey]}</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <SidebarItem
          active={filter === 'all'}
          color="var(--blue)"
          icon={<AllIcon />}
          label={t.filters.all}
          count={counts.all}
          onClick={() => onFilter('all')}
        />
        <div className="sidebar-section-title">{t.categoriesLabel}</div>
        {CATEGORY_VALUES.map((cat) => (
          <SidebarItem
            key={cat}
            active={filter === cat}
            color={CATEGORY_COLORS[cat]}
            icon={<CategoryIcon category={cat as Category} size={17} />}
            label={t.categories[cat]}
            count={counts[cat as Filter]}
            onClick={() => onFilter(cat as Filter)}
          />
        ))}
        <div className="sidebar-section-title">{t.statusLabel}</div>
        <SidebarItem
          active={filter === 'done'}
          color="var(--gray)"
          icon={<DoneIcon />}
          label={t.filters.done}
          count={counts.done}
          onClick={() => onFilter('done')}
        />
      </nav>

      <div className="sidebar-footer">
        <button
          className={`sidebar-lang${lang === 'en' ? ' active' : ''}`}
          onClick={() => lang !== 'en' && toggleLang()}
        >EN</button>
        <span className="sidebar-lang-sep">·</span>
        <button
          className={`sidebar-lang${lang === 'zh' ? ' active' : ''}`}
          onClick={() => lang !== 'zh' && toggleLang()}
        >中文</button>
      </div>
    </aside>
  )
}
