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

// Turtle-brand palette: muted sage greens drawn from the turtle illustration.
// Warm cream backgrounds, deep forest accents, soft blush warmth.
// Stays low-saturation per the anxiety-conscious design guideline.
export const LIGHT: ThemeColors = {
  bg: '#F5F1E8',        // warm cream — slightly more saturated than before
  card: '#FFFEFB',      // near-white with a hint of warmth
  surface: 'rgba(255, 254, 251, 0.65)',
  surfaceAlt: 'rgba(255, 254, 251, 0.78)',
  modal: '#FFFEFB',
  label: '#1F2A26',     // deep teal-tinted near-black
  label2: '#4E5F58',    // sage-tinted gray
  label3: '#7A8A82',    // muted sage
  separator: '#E5E8E1', // soft mint separator
  border: '#E5E8E1',
  primary: '#3D8870',         // turtle deep sage — primary action
  primaryHover: '#2F6F5A',    // darker on press
  primarySoft: '#E2EDE6',     // pale mint background
  primaryOn: '#FFFFFF',
  blue: '#3D8870',      // primary sage (was muted blue; kept key name)
  red: '#D87878',       // soft coral, slightly warmer
  orange: '#E8A964',
  yellow: '#C9B85F',
  green: '#5A9B7E',     // brand sage (lighter than primary, used for "done")
  purple: '#927AAE',
  pink: '#D9A8AD',      // turtle blush accent
  teal: '#4A9485',
  gray: '#7A8A82',
  gray3: '#C5CCC3',     // sage-tinted neutral
  statusBar: 'dark-content',
}

// Dark mode — lifted versions of the same sage hues on a warm dark surface.
export const DARK: ThemeColors = {
  bg: '#181712',        // warm dark
  card: '#22201A',
  surface: 'rgba(34, 32, 26, 0.65)',
  surfaceAlt: 'rgba(34, 32, 26, 0.78)',
  modal: '#22201A',
  label: '#EAECE7',     // off-white with green tint
  label2: '#B8C2BB',
  label3: '#8C9A91',
  separator: '#3A3D35',
  border: '#3A3D35',
  primary: '#7AB89D',         // lifted sage for dark mode contrast
  primaryHover: '#8DC8AD',
  primarySoft: '#2A4138',
  primaryOn: '#181712',
  blue: '#7AB89D',      // primary sage in dark
  red: '#E08A8A',
  orange: '#ECB178',
  yellow: '#D9C97A',
  green: '#8AC2A2',     // slightly more saturated for "done" in dark
  purple: '#A89BC2',
  pink: '#D9B0B5',
  teal: '#7AAEB0',
  gray: '#8C9A91',
  gray3: '#4A4D45',
  statusBar: 'light-content',
}

export function useTheme(): ThemeColors {
  const scheme = useColorScheme()
  return scheme === 'dark' ? DARK : LIGHT
}
