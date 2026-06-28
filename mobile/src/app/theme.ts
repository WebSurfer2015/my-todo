import React, { createContext, useContext, useMemo } from 'react'
import { useColorScheme } from 'react-native'
import { ThemeName } from '../core-bindings/profile'

export interface ThemeColors {
  // Backgrounds
  bg: string
  card: string
  surface: string
  surfaceAlt: string
  modal: string
  /** Title-bar / header chrome band — the theme's weighted brand color. */
  headerBg: string
  // Text
  label: string
  label2: string
  label3: string
  // Lines
  separator: string
  border: string
  // Primary action (theme accent)
  primary: string
  primaryHover: string
  primarySoft: string
  primaryOn: string
  // Brand semantic slots — `blue` is the long-standing key for primary actions
  // throughout the codebase. Semantically it's "the primary accent" — kept as
  // `blue` to avoid a codebase-wide rename. New code may use `primary`.
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

// --- Theme palettes (from the Sagely theme handoff) ----------------------
//
// Each named theme is one brand + one accent + a neutral system. The handoff
// defines 13 semantic roles per theme; we map them onto this app's ThemeColors
// token set below. Status / category colors (orange/green/yellow/…) stay
// CONSTANT across themes — per the handoff, a status must mean the same thing
// in every theme.

interface HandoffPalette {
  brand: string
  accent: string
  accentBright: string
  background: string
  surface: string
  textPrimary: string
  textSecondary: string
  divider: string
  completedBg: string
  completedText: string
  completedDot: string
  danger: string
}

const HANDOFF: Record<ThemeName, { light: HandoffPalette; dark: HandoffPalette }> = {
  sage: {
    light: { brand: '#6FAE8A', accent: '#5C9A7A', accentBright: '#6FB890', background: '#F6FBF7', surface: '#FFFFFF', textPrimary: '#26352C', textSecondary: '#7E9488', divider: '#EAF2EC', completedBg: '#EEF8F1', completedText: '#9DB3A6', completedDot: '#CDE3D6', danger: '#E0976A' },
    dark: { brand: '#3E6B55', accent: '#7FC4A0', accentBright: '#8AD0AC', background: '#171E1A', surface: '#212A25', textPrimary: '#E8F0EA', textSecondary: '#9DB3A6', divider: '#2C382F', completedBg: '#1C2620', completedText: '#6E847A', completedDot: '#3A4A40', danger: '#E0A07A' },
  },
  sky: {
    light: { brand: '#5E9BCE', accent: '#5089BC', accentBright: '#5FA0D4', background: '#F5F9FD', surface: '#FFFFFF', textPrimary: '#243038', textSecondary: '#76889A', divider: '#E8EFF5', completedBg: '#EDF4FA', completedText: '#9BAEBE', completedDot: '#CFE0EE', danger: '#E0976A' },
    dark: { brand: '#2F5C7E', accent: '#74B4E4', accentBright: '#82C0F0', background: '#161B20', surface: '#1F2630', textPrimary: '#E6EEF5', textSecondary: '#9BAEBE', divider: '#2A333D', completedBg: '#1A222B', completedText: '#6E808E', completedDot: '#384450', danger: '#E0A07A' },
  },
  blossom: {
    light: { brand: '#D488A0', accent: '#C77890', accentBright: '#DA8AA2', background: '#FDF5F8', surface: '#FFFFFF', textPrimary: '#352630', textSecondary: '#9A8089', divider: '#F4E8ED', completedBg: '#FBEFF3', completedText: '#BCA4AD', completedDot: '#EED4DE', danger: '#E08F62' },
    dark: { brand: '#7A4F5E', accent: '#E29CB2', accentBright: '#EAA8BE', background: '#1F171B', surface: '#2A2026', textPrimary: '#F2E6EB', textSecondary: '#B49BA4', divider: '#382A30', completedBg: '#251D22', completedText: '#86727B', completedDot: '#4A3A42', danger: '#E0A07A' },
  },
  honey: {
    light: { brand: '#D2A748', accent: '#BC8E30', accentBright: '#D6A848', background: '#FCF8ED', surface: '#FFFFFF', textPrimary: '#322B18', textSecondary: '#928258', divider: '#F2EAD6', completedBg: '#FBF5E6', completedText: '#B6A884', completedDot: '#E8DCBC', danger: '#DD8B5A' },
    dark: { brand: '#6E5520', accent: '#E0BC64', accentBright: '#EAC878', background: '#1E1B12', surface: '#28241A', textPrimary: '#F0EAD8', textSecondary: '#A89E80', divider: '#363020', completedBg: '#231F16', completedText: '#84785C', completedDot: '#463E2A', danger: '#E0A07A' },
  },
  cream: {
    light: { brand: '#B0A37C', accent: '#9A8C68', accentBright: '#B0A27E', background: '#FBF9F2', surface: '#FFFFFF', textPrimary: '#2E2A20', textSecondary: '#8A8270', divider: '#F0EBDE', completedBg: '#FAF7EF', completedText: '#B2AA96', completedDot: '#E2DAC6', danger: '#DD8B5A' },
    dark: { brand: '#5E5640', accent: '#BEB08A', accentBright: '#CCBE98', background: '#1C1A14', surface: '#262318', textPrimary: '#EEEAE0', textSecondary: '#A8A290', divider: '#34301F', completedBg: '#211E15', completedText: '#827A68', completedDot: '#443E2C', danger: '#E0A07A' },
  },
  // Lilac — soft lavender, airy and calm. A cool, delightful counterpart to
  // the warm cream/blossom; the one cool-purple hue not covered above.
  lilac: {
    light: { brand: '#9A8AC6', accent: '#8676B8', accentBright: '#9E8FCC', background: '#F8F6FD', surface: '#FFFFFF', textPrimary: '#2E2A38', textSecondary: '#847C95', divider: '#EEEAF6', completedBg: '#F3EFFB', completedText: '#ABA2BE', completedDot: '#DDD4ED', danger: '#E0976A' },
    dark: { brand: '#574B77', accent: '#B9A9E0', accentBright: '#C6B8EA', background: '#1A1720', surface: '#251F30', textPrimary: '#ECE8F2', textSecondary: '#B0A6C2', divider: '#322B40', completedBg: '#221C2B', completedText: '#80768E', completedDot: '#423A52', danger: '#E0A07A' },
  },
}

// Status / category colors — constant across every theme.
const CONST_LIGHT = { orange: '#E8A964', yellow: '#C9B85F', green: '#7FB59E', purple: '#927AAE', pink: '#EFB8AE', gray: '#8A998F', gray3: '#CDD4C9' }
const CONST_DARK = { orange: '#ECB178', yellow: '#D9C97A', green: '#94C9AC', purple: '#A89BC2', pink: '#E8B6AE', gray: '#8FA095', gray3: '#4D4F47' }

function buildTheme(h: HandoffPalette, scheme: 'light' | 'dark'): ThemeColors {
  const k = scheme === 'dark' ? CONST_DARK : CONST_LIGHT
  return {
    bg: h.background,
    card: h.surface,
    surface: h.completedBg,
    surfaceAlt: h.divider,
    modal: h.surface,
    headerBg: h.brand,
    label: h.textPrimary,
    label2: h.textSecondary,
    label3: h.completedText,
    separator: h.divider,
    border: h.divider,
    primary: h.accent,
    primaryHover: h.accentBright,
    primarySoft: h.completedBg,
    primaryOn: scheme === 'dark' ? h.background : '#FFFFFF',
    blue: h.accent,
    red: h.danger,
    teal: h.accent,
    ...k,
    statusBar: scheme === 'dark' ? 'light-content' : 'dark-content',
  }
}

/** Full light+dark palette for every theme name. */
export const THEMES: Record<ThemeName, { light: ThemeColors; dark: ThemeColors }> = {
  sage: { light: buildTheme(HANDOFF.sage.light, 'light'), dark: buildTheme(HANDOFF.sage.dark, 'dark') },
  sky: { light: buildTheme(HANDOFF.sky.light, 'light'), dark: buildTheme(HANDOFF.sky.dark, 'dark') },
  blossom: { light: buildTheme(HANDOFF.blossom.light, 'light'), dark: buildTheme(HANDOFF.blossom.dark, 'dark') },
  honey: { light: buildTheme(HANDOFF.honey.light, 'light'), dark: buildTheme(HANDOFF.honey.dark, 'dark') },
  cream: { light: buildTheme(HANDOFF.cream.light, 'light'), dark: buildTheme(HANDOFF.cream.dark, 'dark') },
  lilac: { light: buildTheme(HANDOFF.lilac.light, 'light'), dark: buildTheme(HANDOFF.lilac.dark, 'dark') },
}

export const DEFAULT_THEME: ThemeName = 'sage'

/** The two signature swatch tones for a theme's pie-chart swatch. */
export function themeSwatch(name: ThemeName, scheme: 'light' | 'dark') {
  const h = HANDOFF[name][scheme]
  return { brand: h.brand, accent: h.accent, accentBright: h.accentBright }
}

// Legacy aliases — a few modules historically imported LIGHT/DARK directly.
// They now resolve to the default (sage) theme.
export const LIGHT = THEMES.sage.light
export const DARK = THEMES.sage.dark

// --- Selected-theme context ----------------------------------------------

const ThemeNameContext = createContext<ThemeName>(DEFAULT_THEME)

interface ProviderProps {
  /** The user's selected theme. */
  name: ThemeName
  children: React.ReactNode
}

export function ThemeOverrideProvider({ name, children }: ProviderProps) {
  return React.createElement(ThemeNameContext.Provider, { value: name }, children)
}

export function useTheme(): ThemeColors {
  const scheme = useColorScheme()
  const name = useContext(ThemeNameContext)
  return useMemo(() => THEMES[name][scheme === 'dark' ? 'dark' : 'light'], [name, scheme])
}
