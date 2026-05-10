import type { Strings } from './i18n'

export interface CategoryDef {
  id: string
  label?: string
  color: string  // hex (e.g. '#34C759')
  icon: string   // platform-resolved icon key
}

export const BUILTIN_CATEGORY_IDS = new Set(['home', 'school', 'work', 'other'])

/** Hard caps applied at hydration. Defensive against malicious cloud writes. */
export const MAX_CATEGORY_LABEL_LEN = 64
export const MAX_CATEGORIES_PER_USER = 200
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

/**
 * Apple system colors (iOS HIG). Hex form so the same value works in DOM
 * inline styles and React Native StyleSheet, and so cross-platform sync
 * doesn't choke on CSS-variable tokens.
 */
export const COLOR_PALETTE: string[] = [
  '#FF3B30', // red
  '#FF9500', // orange
  '#FFCC00', // yellow
  '#34C759', // green
  '#30B0C7', // teal
  '#007AFF', // blue
  '#AF52DE', // purple
  '#FF2D92', // pink
]

export const SEED_CATEGORIES: CategoryDef[] = [
  { id: 'home',   color: '#34C759', icon: 'home' },
  { id: 'school', color: '#AF52DE', icon: 'graduation-cap' },
  { id: 'work',   color: '#007AFF', icon: 'briefcase' },
  { id: 'other',  color: '#FF9500', icon: 'more-horizontal' },
]

const ICON_RENAMES: Record<string, string> = {
  work: 'briefcase',
  dots: 'more-horizontal',
  school: 'graduation-cap', // mobile's old key
}

/** Legacy CSS-variable colors (web's original palette) → hex. */
const COLOR_RENAMES: Record<string, string> = {
  'var(--red)':    '#FF3B30',
  'var(--orange)': '#FF9500',
  'var(--yellow)': '#FFCC00',
  'var(--green)':  '#34C759',
  'var(--teal)':   '#30B0C7',
  'var(--blue)':   '#007AFF',
  'var(--purple)': '#AF52DE',
  'var(--pink)':   '#FF2D92',
}

const LEGACY_ICON_FOR_BUILTIN: Record<string, string> = {
  home:   'home',
  school: 'graduation-cap',
  work:   'briefcase',
  other:  'more-horizontal',
}

export function migrateCategory(c: Partial<CategoryDef> & { id: string }): CategoryDef {
  const rawIcon = c.icon ?? LEGACY_ICON_FOR_BUILTIN[c.id] ?? 'tag'
  const icon = ICON_RENAMES[rawIcon] ?? rawIcon
  const rawColor = c.color ?? '#8E8E93'
  let color = COLOR_RENAMES[rawColor] ?? rawColor
  // Reject malformed colors (anything not a 6-digit hex) — fall back to gray.
  if (!HEX_COLOR_RE.test(color)) color = '#8E8E93'
  const label =
    typeof c.label === 'string' && c.label.length > 0
      ? c.label.slice(0, MAX_CATEGORY_LABEL_LEN)
      : undefined
  return { ...c, label, color, icon } as CategoryDef
}

/**
 * Sanitize a freshly-loaded categories array. Rejects non-objects, missing
 * ids, malformed entries; caps array length and per-field sizes.
 */
export function migrateCategories(raw: unknown): CategoryDef[] {
  if (!Array.isArray(raw)) return []
  const out: CategoryDef[] = []
  const seen = new Set<string>()
  for (const c of raw.slice(0, MAX_CATEGORIES_PER_USER)) {
    if (typeof c !== 'object' || c === null) continue
    const item = c as Partial<CategoryDef>
    if (typeof item.id !== 'string' || item.id.length === 0) continue
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(migrateCategory(item as Partial<CategoryDef> & { id: string }))
  }
  return out
}

export function newCategoryId(): string {
  return 'cat_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36)
}

export function categoryLabel(c: CategoryDef, t: Strings): string {
  if (c.label) return c.label
  if (BUILTIN_CATEGORY_IDS.has(c.id)) {
    return t.categories[c.id as 'home' | 'school' | 'work' | 'other']
  }
  return c.id
}
