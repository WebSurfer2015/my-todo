import React, { createContext, useContext, useMemo } from 'react'
import { useColorScheme } from 'react-native'

export interface ThemeColors {
  // Backgrounds
  bg: string
  card: string
  surface: string
  surfaceAlt: string
  modal: string
  /** Title-bar / header chrome band. A calm warm neutral that recedes
   * behind the (avatar-derived) primary actions so the two don't
   * compete. Deliberately NOT part of the avatar override. */
  headerBg: string
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
  card: '#FFFFFF',      // pure white so todo + stat cards stand out on cream
  surface: 'rgba(252, 250, 243, 0.65)',
  surfaceAlt: 'rgba(252, 250, 243, 0.78)',
  modal: '#FCFAF3',
  headerBg: '#E9E4D7',  // neutral fallback (turtle avatar supplies the teal; others their own tint)
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

// Dark mode — lifted pastel mint on a warm dark surface, matching the
// Sagely / Mochi palette but tuned for legibility against deep cream-dark.
export const DARK: ThemeColors = {
  bg: '#1A1814',        // warm dark, slightly more cream-tinted
  card: '#24211B',
  surface: 'rgba(36, 33, 27, 0.65)',
  surfaceAlt: 'rgba(36, 33, 27, 0.78)',
  modal: '#24211B',
  headerBg: '#262420',  // neutral fallback (turtle avatar supplies the teal; others their own tint)
  label: '#ECEEE6',     // off-white with mint tint
  label2: '#B8C4BA',
  label3: '#8FA095',
  separator: '#3D3F37',
  border: '#3D3F37',
  primary: '#86C5A8',         // lifted mint for dark-mode contrast
  primaryHover: '#9AD3B8',
  primarySoft: '#2E4639',
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
type PrimaryOverride =
  | (Pick<ThemeColors, 'primary' | 'primaryHover' | 'primarySoft' | 'primaryOn' | 'blue' | 'teal'> & {
      // Optional: most overrides leave the header to the base palette;
      // per-avatar logic (e.g. the turtle) may set it explicitly.
      headerBg?: ThemeColors['headerBg']
    })
  | null

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

/**
 * Derive a primary-token override from a soft pastel background
 * color (typically preset.bg from AVATAR_PRESET_LIBRARY). Returns
 * null when the input doesn't parse.
 *
 * Strategy: preset bg is already a calm pastel. We use it directly
 * as `primarySoft`, then saturate + darken it to make a usable
 * `primary` for the FAB / pill accents. `primaryOn` picks white
 * vs near-black based on the derived primary's lightness.
 */
export function deriveThemeFromAvatarBg(bg: string, scheme: 'light' | 'dark'): PrimaryOverride {
  const hsl = hexToHSL(bg)
  if (!hsl) return null
  // Accent = a DEEP but FAITHFUL tint of the avatar color. Only a small
  // saturation nudge so it tracks the avatar's actual tone (the turtle's
  // muted teal-green) instead of over-saturating into a vivid pure green.
  // Low lightness keeps it confidently deep for the FAB + labels/counts.
  const targetSat = Math.min(46, hsl.s + 12)
  const targetLightLight = 30
  const targetLightDark = 62
  const primary = hslToHex(
    hsl.h,
    targetSat,
    scheme === 'dark' ? targetLightDark : targetLightLight,
  )
  const primaryHover = hslToHex(
    hsl.h,
    targetSat,
    scheme === 'dark' ? targetLightDark + 8 : targetLightLight - 8,
  )
  // Soft chips: a defined soft tint at the accent's hue.
  const primarySoft =
    scheme === 'dark'
      ? hslToHex(hsl.h, Math.min(35, hsl.s + 5), 25)
      : hslToHex(hsl.h, Math.min(26, hsl.s + 8), 91)
  // Contrast for foreground text on primary.
  const primaryOn = scheme === 'dark' ? '#1A1814' : '#FFFFFF'
  // Avatar-themed header tint — a few shades DEEPER than primarySoft so
  // the title bar reads as defined chrome rather than a near-white wash.
  const headerBg =
    scheme === 'dark'
      ? hslToHex(hsl.h, Math.min(34, hsl.s + 6), 26)
      : hslToHex(hsl.h, Math.min(32, hsl.s + 14), 82)
  return {
    primary,
    primaryHover,
    primarySoft,
    primaryOn,
    blue: primary, // legacy alias
    teal: primary,
    headerBg,
  }
}
