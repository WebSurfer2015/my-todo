import { useState, DragEvent } from "react";
import {
  Filter,
  categoryFilter,
  isCategoryFilter,
  categoryIdFromFilter,
} from "../types";
import { CategoryDef, categoryLabel } from "../categories";
import { Profile } from "../profile";
import CategoryIcon from "./CategoryIcon";
import CategoryPopover from "./CategoryPopover";
import ProfilePopover from "./ProfilePopover";
import AvatarView from "./Avatar";
import { useLang } from "../LangContext";
import { useAuth } from "../AuthContext";

interface SidebarCounts {
  all: number;
  overdue: number;
  open: number;
  done: number;
  trash: number;
  byCategory: Record<string, { open: number; total: number }>;
}

interface Props {
  filter: Filter;
  onFilter: (f: Filter) => void;
  counts: SidebarCounts;
  greetingKey: "morning" | "afternoon" | "evening";
  categories: CategoryDef[];
  todoCounts: Record<string, { open: number; total: number }>;
  onAddCategory: (data: { label: string; color: string; icon: string }) => void;
  onEditCategory: (
    id: string,
    data: { label: string; color: string; icon: string },
  ) => void;
  onDeleteCategory: (id: string) => void;
  onReorderCategories: (from: number, to: number) => void;
  profile: Profile;
  onSaveProfile: (p: Profile) => void;
}

function AllIcon({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 13l-3.5 7a1 1 0 01-.9.5H6.4a1 1 0 01-.9-.5L2 13" />
      <path d="M5 13V5a2 2 0 012-2h10a2 2 0 012 2v8" />
      <path d="M9 13h6" />
    </svg>
  );
}

function OverdueIcon({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function OpenIcon({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function DoneIcon({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  );
}

function TrashIcon({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    </svg>
  );
}

function PlusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function MoreIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

function GripVertical({
  size = 14,
  strokeWidth = 2,
}: {
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="18" r="1" />
    </svg>
  );
}

interface ItemProps {
  active: boolean;
  color: string;
  icon: React.ReactNode;
  label: string;
  count: number;
  onClick: () => void;
}

function SidebarItem({
  active,
  color,
  icon,
  label,
  count,
  onClick,
}: ItemProps) {
  return (
    <button
      className={`sidebar-item${active ? " active" : ""}`}
      onClick={onClick}
      style={active ? { ["--accent" as string]: "var(--blue)" } : undefined}
    >
      <span className="sidebar-item-icon" style={{ color }}>
        {icon}
      </span>
      <span className="sidebar-item-label">{label}</span>
      <span className="sidebar-item-count">{count}</span>
    </button>
  );
}

interface CategoryRowProps {
  category: CategoryDef;
  index: number;
  active: boolean;
  open: number;
  total: number;
  label: string;
  editLabel: string;
  isDragging: boolean;
  isDragOver: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

function CategoryRow({
  category,
  active,
  open,
  total,
  label,
  editLabel,
  isDragging,
  isDragOver,
  onSelect,
  onEdit,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: CategoryRowProps) {
  return (
    <div
      className={`sidebar-row${isDragging ? " dragging" : ""}${isDragOver ? " drag-over" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <span className="sidebar-row-grip" aria-hidden="true">
        <GripVertical size={14} strokeWidth={2} />
      </span>
      <button
        className={`sidebar-item${active ? " active" : ""}`}
        onClick={onSelect}
        style={active ? { ["--accent" as string]: "var(--blue)" } : undefined}
      >
        <span className="sidebar-item-icon" style={{ color: category.color }}>
          <CategoryIcon icon={category.icon} size={17} />
        </span>
        <span className="sidebar-item-label">{label}</span>
        <span className="sidebar-item-count">
          {open}/{total}
        </span>
      </button>
      <button
        type="button"
        className="sidebar-row-edit"
        onClick={onEdit}
        draggable={false}
        onDragStart={(e) => e.stopPropagation()}
        aria-label={editLabel}
        title={editLabel}
      >
        <MoreIcon />
      </button>
    </div>
  );
}

export default function Sidebar({
  filter,
  onFilter,
  counts,
  greetingKey,
  categories,
  todoCounts,
  onAddCategory,
  onEditCategory,
  onDeleteCategory,
  onReorderCategories,
  profile,
  onSaveProfile,
}: Props) {
  const { t, lang, toggle: toggleLang } = useLang();
  const { signOut } = useAuth();
  const [popover, setPopover] = useState<
    { mode: "add" } | { mode: "edit"; id: string } | null
  >(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const activeCategoryId = isCategoryFilter(filter)
    ? categoryIdFromFilter(filter)
    : null;
  const editing =
    popover?.mode === "edit"
      ? categories.find((c) => c.id === popover.id)
      : undefined;

  function startDrag(e: DragEvent<HTMLDivElement>, index: number) {
    e.dataTransfer.setData("text/plain", String(index));
    e.dataTransfer.effectAllowed = "move";
    setDragIndex(index);
  }

  function overDrag(e: DragEvent<HTMLDivElement>, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIndex !== null && index !== dragIndex) setDragOverIndex(index);
  }

  function dropDrag(e: DragEvent<HTMLDivElement>, index: number) {
    e.preventDefault();
    const fromIdx = Number(e.dataTransfer.getData("text/plain"));
    if (Number.isFinite(fromIdx) && fromIdx !== index)
      onReorderCategories(fromIdx, index);
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function endDrag() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  return (
    <aside className="sidebar">
      <button
        type="button"
        className="sidebar-header"
        onClick={() => setProfileOpen(true)}
        aria-label={t.editProfile}
        title={t.editProfile}
      >
        <AvatarView avatar={profile.avatar} size={38} alt={profile.name} />
        <div className="sidebar-identity">
          <div className="sidebar-name">{profile.name}</div>
          <div className="sidebar-greeting">
            {profile.quote || t.greeting[greetingKey]}
          </div>
        </div>
      </button>

      <nav className="sidebar-nav">
        <SidebarItem
          active={filter === "all"}
          color="var(--blue)"
          icon={<AllIcon />}
          label={t.filters.all}
          count={counts.all}
          onClick={() => onFilter("all")}
        />

        <div className="sidebar-section-title">
          <span>{t.categoriesLabel}</span>
          <button
            type="button"
            className="sidebar-add-btn"
            onClick={() => setPopover({ mode: "add" })}
            aria-label={t.addCategory}
            title={t.addCategory}
          >
            <PlusIcon />
          </button>
        </div>

        {categories.map((cat, idx) => (
          <CategoryRow
            key={cat.id}
            category={cat}
            index={idx}
            active={activeCategoryId === cat.id}
            open={todoCounts[cat.id]?.open ?? 0}
            total={todoCounts[cat.id]?.total ?? 0}
            label={categoryLabel(cat, t)}
            editLabel={t.editCategory}
            isDragging={dragIndex === idx}
            isDragOver={dragOverIndex === idx}
            onSelect={() => onFilter(categoryFilter(cat.id))}
            onEdit={() => setPopover({ mode: "edit", id: cat.id })}
            onDragStart={(e) => startDrag(e, idx)}
            onDragOver={(e) => overDrag(e, idx)}
            onDragLeave={() => setDragOverIndex(null)}
            onDrop={(e) => dropDrag(e, idx)}
            onDragEnd={endDrag}
          />
        ))}

        <div className="sidebar-section-title">{t.statusLabel}</div>
        <SidebarItem
          active={filter === "overdue"}
          color="var(--red)"
          icon={<OverdueIcon />}
          label={t.filters.overdue}
          count={counts.overdue}
          onClick={() => onFilter("overdue")}
        />
        <SidebarItem
          active={filter === "open"}
          color="var(--blue)"
          icon={<OpenIcon />}
          label={t.filters.open}
          count={counts.open}
          onClick={() => onFilter("open")}
        />
        <SidebarItem
          active={filter === "done"}
          color="var(--gray)"
          icon={<DoneIcon />}
          label={t.filters.done}
          count={counts.done}
          onClick={() => onFilter("done")}
        />
        <SidebarItem
          active={filter === "trash"}
          color="var(--gray)"
          icon={<TrashIcon />}
          label={t.filters.trash}
          count={counts.trash}
          onClick={() => onFilter("trash")}
        />
      </nav>

      <div className="sidebar-footer">
        <button
          className={`sidebar-lang${lang === "en" ? " active" : ""}`}
          onClick={() => lang !== "en" && toggleLang()}
        >
          EN
        </button>
        <span className="sidebar-lang-sep">·</span>
        <button
          className={`sidebar-lang${lang === "zh" ? " active" : ""}`}
          onClick={() => lang !== "zh" && toggleLang()}
        >
          中文
        </button>
      </div>
      <div className="signout-row">
        <button type="button" onClick={() => signOut()}>
          Sign out
        </button>
      </div>

      {popover?.mode === "add" && (
        <CategoryPopover
          taskCount={0}
          reassignTarget={null}
          canDelete={false}
          onSave={(data) => {
            onAddCategory(data);
            setPopover(null);
          }}
          onClose={() => setPopover(null)}
        />
      )}
      {popover?.mode === "edit" && editing && (
        <CategoryPopover
          category={editing}
          taskCount={todoCounts[editing.id]?.total ?? 0}
          reassignTarget={categories.find((c) => c.id !== editing.id) ?? null}
          canDelete={categories.length > 1}
          onSave={(data) => {
            onEditCategory(editing.id, data);
            setPopover(null);
          }}
          onDelete={() => {
            onDeleteCategory(editing.id);
            setPopover(null);
          }}
          onClose={() => setPopover(null)}
        />
      )}
      {profileOpen && (
        <ProfilePopover
          profile={profile}
          onSave={(p) => {
            onSaveProfile(p);
            setProfileOpen(false);
          }}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </aside>
  );
}
