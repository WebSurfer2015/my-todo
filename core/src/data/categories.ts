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
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

/**
 * Apple system colors (iOS HIG). Hex form so the same value works in DOM
 * inline styles and React Native StyleSheet.
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

/** Default icon for a built-in category whose stored row lacks one. */
const BUILTIN_ICON: Record<string, string> = Object.fromEntries(
  SEED_CATEGORIES.map((c) => [c.id, c.icon]),
)

export function migrateCategory(c: Partial<CategoryDef> & { id: string }): CategoryDef {
  const icon = c.icon ?? BUILTIN_ICON[c.id] ?? 'tag'
  // Reject malformed colors (anything not a 6-digit hex) — fall back to gray.
  const color = typeof c.color === 'string' && HEX_COLOR_RE.test(c.color) ? c.color : '#8E8E93'
  const label =
    typeof c.label === 'string' && c.label.length > 0
      ? c.label.slice(0, MAX_CATEGORY_LABEL_LEN)
      : undefined
  return { ...c, label, color, icon } as CategoryDef
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
