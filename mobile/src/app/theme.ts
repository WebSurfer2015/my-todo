import React, { createContext, useContext, useMemo } from 'react'
import { useColorScheme } from 'react-native'

export interface ThemeColors {
  // Backgrounds
  bg: string
  card: string
  surface: string
  surfaceAlt: string
  modal: string
  // Text
  label: string
  label2: string
  label3: string
  // Lines
  separator: string
  border: string
  // Primary action (sage/forest from turtle brand)
  primary: string
  primaryHover: string
  primarySoft: string
  primaryOn: string
  // Brand semantic slots — `blue` is the long-standing key for primary actions
  // throughout the codebase. After the turtle rebrand it holds a sage value;
  // semantically it's "the primary accent" — kept as `blue` to avoid a
  // codebase-wide rename. New code may use `primary` instead.
  blue: string
  red: string
  orange: string
  yellow: string
  green: string
  purple: string
  pink: string
  teal: string
  gray: string
  gray3: string
  // Status bar
  statusBar: 'light-content' | 'dark-content'
}

// Sagely palette — drawn from the Mochi turtle illustration. Pale mint
// pastels on a warm cream backdrop, with a teal outline color that doubles
// as the primary action. Lower saturation than the original sage palette
// per the anxiety-conscious design guideline.
export const LIGHT: ThemeColors = {
  bg: '#F5F0E2',        // icon cream — warmer, slightly more yellow
  card: '#FCFAF3',      // near-white with warm cast
  surface: 'rgba(252, 250, 243, 0.65)',
  surfaceAlt: 'rgba(252, 250, 243, 0.78)',
  modal: '#FCFAF3',
  label: '#2A3530',     // deep teal-tinted near-black
  label2: '#5A6B62',    // sage-tinted gray
  label3: '#8A998F',    // muted sage
  separator: '#E5EAE0', // soft mint separator
  border: '#E5EAE0',
  primary: '#4F8A75',         // Mochi outline teal — primary action
  primaryHover: '#3F7460',    // darker on press
  primarySoft: '#E8F0E5',     // pale mint surface (matches icon body)
  primaryOn: '#FFFFFF',
  blue: '#4F8A75',      // alias of primary — kept for legacy key compat
  red: '#D87878',       // soft coral
  orange: '#E8A964',
  yellow: '#C9B85F',
  green: '#7FB59E',     // softer mint (matches Mochi shell)
  purple: '#927AAE',
  pink: '#EFB8AE',      // Mochi cheek peach
  teal: '#4F8A75',      // aligned with primary
  gray: '#8A998F',
  gray3: '#CDD4C9',     // mint-tinted neutral
  statusBar: 'dark-content',
}

// Dark mode — "soft sage dim": a lifted sage-slate base (not near-black)
// with clearly raised cards, so it reads dimmed-and-warm rather than
// lights-off-and-flat. Keeps the Mochi mint accent. Tuned to stay calm
// (low contrast steps) while giving cards real elevation off the bg.
export const DARK: ThemeColors = {
  bg: '#21251F',        // lifted sage-slate (was near-black #1A1814)
  card: '#2C312A',      // clear lift off bg so cards read as raised
  surface: 'rgba(44, 49, 42, 0.65)',
  surfaceAlt: 'rgba(44, 49, 42, 0.78)',
  modal: '#2C312A',
  label: '#ECEEE6',     // off-white with mint tint
  label2: '#B8C4BA',
  label3: '#8FA095',
  separator: '#3C443A', // cooler, more visible against the lifted bg
  border: '#3C443A',
  primary: '#86C5A8',         // lifted mint for dark-mode contrast
  primaryHover: '#9AD3B8',
  primarySoft: '#335041',     // lifted to sit above the new card tone
  primaryOn: '#1A1814',
  blue: '#86C5A8',      // alias of primary
  red: '#E08A8A',
  orange: '#ECB178',
  yellow: '#D9C97A',
  green: '#94C9AC',     // shell mint (slightly more saturated)
  purple: '#A89BC2',
  pink: '#E8B6AE',      // cheek peach lifted
  teal: '#86C5A8',      // aligned with primary
  gray: '#8FA095',
  gray3: '#4D4F47',
  statusBar: 'light-content',
}

/**
 * Optional per-render override of the primary token group. When a
 * provider supplies this (typically from profile.themeFromAvatar +
 * preset.bg), `useTheme()` overlays it on top of the base palette.
 * Other token groups (labels, separators, status colors) stay
 * untouched — the avatar only retints the accent surfaces.
 */
type PrimaryOverride = Partial<Pick<ThemeColors, 'primary' | 'primaryHover' | 'primarySoft' | 'primaryOn' | 'blue' | 'teal'>> | null

const ThemeOverrideContext = createContext<PrimaryOverride>(null)

interface ProviderProps {
  /** When undefined → no override, base palette wins. */
  override: PrimaryOverride
  children: React.ReactNode
}

export function ThemeOverrideProvider({ override, children }: ProviderProps) {
  return React.createElement(ThemeOverrideContext.Provider, { value: override }, children)
}

export function useTheme(): ThemeColors {
  const scheme = useColorScheme()
  const base = scheme === 'dark' ? DARK : LIGHT
  const override = useContext(ThemeOverrideContext)
  return useMemo(() => (override ? { ...base, ...override } : base), [base, override])
}

// --- Avatar-derived theme helpers ----------------------------------------

interface HSL { h: number; s: number; l: number }

function hexToHSL(hex: string): HSL | null {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i)
  if (!m) return null
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 0xff) / 255
  const g = ((n >> 8) & 0xff) / 255
  const b = (n & 0xff) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h *= 60
  }
  return { h, s: s * 100, l: l * 100 }
}

function hslToHex(h: number, s: number, l: number): string {
  s = Math.max(0, Math.min(100, s)) / 100
  l = Math.max(0, Math.min(100, l)) / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = ((h % 360) + 360) % 360 / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0, g = 0, b = 0
  if (hp < 1) { r = c; g = x }
  else if (hp < 2) { r = x; g = c }
  else if (hp < 3) { g = c; b = x }
  else if (hp < 4) { g = x; b = c }
  else if (hp < 5) { r = x; b = c }
  else { r = c; b = x }
  const m = l - c / 2
  const toHex = (v: number) => {
    const n = Math.round((v + m) * 255)
    return n.toString(16).padStart(2, '0')
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** Linear RGB blend of two #rrggbb colors; t=0 → a, t=1 → b. */
function mixHex(a: string, b: string, t: number): string {
  const pa = a.match(/^#?([0-9a-f]{6})$/i)
  const pb = b.match(/^#?([0-9a-f]{6})$/i)
  if (!pa || !pb) return a
  const na = parseInt(pa[1], 16)
  const nb = parseInt(pb[1], 16)
  const mix = (sh: number) => {
    const ca = (na >> sh) & 0xff
    const cb = (nb >> sh) & 0xff
    return Math.round(ca + (cb - ca) * t)
  }
  const toHex = (v: number) => v.toString(16).padStart(2, '0')
  return `#${toHex(mix(16))}${toHex(mix(8))}${toHex(mix(0))}`
}

/**
 * Avatar-personalization, "lead with sage" model. The brand keeps ONE
 * calm identity: every strong accent (FAB, active pills, counts, tabs —
 * which read `primary`/`blue`) stays brand sage regardless of avatar, so
 * the app never takes on a muddy avatar hue. The avatar only SUBTLY
 * tints the soft surfaces (header band + pill backgrounds, which read
 * `primarySoft`), blended mostly toward the brand soft so it's a hint of
 * personality rather than a full recolor. Returns null when bg doesn't
 * parse. (Pre-2026-06 this overrode the whole primary group from the
 * avatar, which made the UI go brown/etc. for warm-toned avatars.)
 */
export function deriveThemeFromAvatarBg(bg: string, scheme: 'light' | 'dark'): PrimaryOverride {
  const hsl = hexToHSL(bg)
  if (!hsl) return null
  const brandSoft = (scheme === 'dark' ? DARK : LIGHT).primarySoft
  // A calm tint at the avatar's hue: pale in light, darkened in dark.
  const avatarSoft =
    scheme === 'dark'
      ? hslToHex(hsl.h, Math.min(30, hsl.s + 5), 27)
      : hslToHex(hsl.h, Math.min(28, hsl.s), 90)
  // Mostly brand (70%) with a 30% personal hue shift — subtle, not loud.
  return { primarySoft: mixHex(brandSoft, avatarSoft, 0.3) }
}
