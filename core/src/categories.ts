import type { Strings } from './i18n'

export interface CategoryDef {
  id: string
  label?: string
  color: string  // hex (e.g. '#34C759')
  icon: string   // platform-resolved icon key
}

export const BUILTIN_CATEGORY_IDS = new Set(['home', 'school', 'work', 'other'])

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
  const color = COLOR_RENAMES[rawColor] ?? rawColor
  return { ...c, color, icon } as CategoryDef
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
