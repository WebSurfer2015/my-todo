/**
 * Pair + pattern data for the user-selectable app background.
 *
 * - PAIRS — named color pairs (`light` = dominant bg tone, `deep` = accent for
 *   gradients/blobs/scatter). Each pair carries a per-mode variant so a user's
 *   choice stays usable in both light and dark mode.
 * - PATTERNS — the rendering styles offered in the picker.
 * - DEFAULT_BACKGROUND — chosen so an existing user with no `profile.background`
 *   sees zero visual change (cream solid == today's `theme.bg`).
 *
 * Renderers consume these via `<AppBackground />` (full-screen) and
 * `<BackgroundPicker />` (tile-sized). Both read the pair/pattern lookups here.
 */

export type PatternKey =
  | 'solid'
  | 'gradient'
  | 'blob'
  | 'wave'
  | 'scatter'
  | 'layered-waves'
  | 'stacked-peaks'
  | 'low-poly-grid'
  | 'circle-scatter'
  | 'scattered-waves'

export interface PatternMeta {
  key: PatternKey
  label: string
}

export const PATTERNS: PatternMeta[] = [
  { key: 'solid',           label: 'Solid color' },
  { key: 'gradient',        label: 'Gradient' },
  { key: 'blob',            label: 'Blob' },
  { key: 'wave',            label: 'Wave' },
  { key: 'scatter',         label: 'Scatter' },
  { key: 'layered-waves',   label: 'Layered waves' },
  { key: 'stacked-peaks',   label: 'Stacked peaks' },
  { key: 'low-poly-grid',   label: 'Low-poly grid' },
  { key: 'circle-scatter',  label: 'Circle scatter' },
  { key: 'scattered-waves', label: 'Scattered waves' },
]

export interface PairTones {
  /** Dominant background tone — what a Solid pattern uses verbatim. */
  light: string
  /** Accent tone — used for blobs, gradient end, scatter dots, etc. */
  deep: string
}

export interface Pair {
  key: string
  label: string
  light: PairTones
  dark: PairTones
}

/**
 * Sea-glass is the current default (see DEFAULT_BACKGROUND below). Cream
 * is kept as the first entry as the neutral "no-decoration" choice — its
 * `light.light` matches today's `theme.bg` (`#F5F0E2`) and its `dark.light`
 * matches the dark `theme.bg` (`#1A1814`), so picking Cream returns the
 * app to its pre-background-feature look.
 *
 * Dark-mode tones are intentionally low-chroma: a Mochi-shell dark bg is just
 * a faintly-tinted dark cream, not a bright mint glow.
 */
export const PAIRS: Pair[] = [
  {
    key: 'cream', label: 'Cream',
    light: { light: '#F5F0E2', deep: '#D8CDA8' },
    dark:  { light: '#1A1814', deep: '#3A3328' },
  },
  {
    key: 'mochi-shell', label: 'Mochi shell',
    light: { light: '#EAF1E2', deep: '#A8C9B4' },
    dark:  { light: '#1E2520', deep: '#26312B' },
  },
  {
    key: 'cream-sunrise', label: 'Cream sunrise',
    light: { light: '#F7F0E0', deep: '#EFC9B0' },
    dark:  { light: '#231F1A', deep: '#3E2D22' },
  },
  {
    key: 'sage-dusk', label: 'Sage dusk',
    light: { light: '#E6EBE3', deep: '#9DB0A3' },
    dark:  { light: '#1E211D', deep: '#2A312A' },
  },
  {
    key: 'misty-rose', label: 'Misty rose',
    light: { light: '#F4ECE7', deep: '#E0B8B4' },
    dark:  { light: '#221E1D', deep: '#3A2826' },
  },
  {
    key: 'lavender-breath', label: 'Lavender breath',
    light: { light: '#ECEAEF', deep: '#BFB4D0' },
    dark:  { light: '#1E1C22', deep: '#26222F' },
  },
  {
    key: 'sea-glass', label: 'Sea-glass',
    light: { light: '#E3ECEC', deep: '#A4C0BE' },
    dark:  { light: '#1B201F', deep: '#28342F' },
  },
  {
    key: 'honey-paper', label: 'Honey paper',
    light: { light: '#F5EFDC', deep: '#D9C28A' },
    dark:  { light: '#221F18', deep: '#3A2F1F' },
  },
]

export const DEFAULT_BACKGROUND = {
  pattern: 'solid' as PatternKey,
  pairKey: 'sea-glass',
}

export function lookupPair(key: string | undefined): Pair {
  if (!key) return PAIRS[0]
  return PAIRS.find((p) => p.key === key) ?? PAIRS[0]
}

export function lookupPattern(key: string | undefined): PatternMeta {
  if (!key) return PATTERNS[0]
  return PATTERNS.find((p) => p.key === key) ?? PATTERNS[0]
}

export function tonesFor(pair: Pair, scheme: 'light' | 'dark'): PairTones {
  return scheme === 'dark' ? pair.dark : pair.light
}
