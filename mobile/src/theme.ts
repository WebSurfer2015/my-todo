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
  // Brand
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

// Anxiety-conscious palette: low saturation, AAA contrast where possible,
// warm neutrals (#FAFAF9 / #1A1A1A) instead of pure white/black. Mirrors the
// web :root tokens in web/src/index.css so cross-device sync feels coherent.
export const LIGHT: ThemeColors = {
  bg: '#FAFAF9',
  card: '#FFFFFF',
  surface: 'rgba(255, 255, 255, 0.65)',
  surfaceAlt: 'rgba(255, 255, 255, 0.78)',
  modal: '#FFFFFF',
  label: '#1F1F1F',
  label2: '#5C5C5C',
  label3: '#8A8580',
  separator: '#E5E1DC',
  border: '#E5E1DC',
  blue: '#5B7C99',   // muted slate — primary action
  red: '#A85B5B',    // muted, only true danger
  orange: '#B89364', // warm sand
  yellow: '#C9B85F',
  green: '#6B8E66',  // sage
  purple: '#927AAE',
  pink: '#B57894',
  teal: '#6A9999',
  gray: '#7C7C7C',
  gray3: '#C8C5C0',
  statusBar: 'dark-content',
}

// Native-dark palette — warm gray surfaces, never pure black, AAA text.
export const DARK: ThemeColors = {
  bg: '#1A1A1A',
  card: '#232323',
  surface: 'rgba(35, 35, 35, 0.65)',
  surfaceAlt: 'rgba(35, 35, 35, 0.78)',
  modal: '#232323',
  label: '#ECECEC',
  label2: '#B5B5B5',
  label3: '#828282',
  separator: '#383634',
  border: '#383634',
  blue: '#8FA9BE',
  red: '#C28080',
  orange: '#C9A878',
  yellow: '#D9C97A',
  green: '#8AA985',
  purple: '#A89BC2',
  pink: '#C997AA',
  teal: '#7AAEB0',
  gray: '#9A9A9A',
  gray3: '#4A4A4A',
  statusBar: 'light-content',
}

export function useTheme(): ThemeColors {
  const scheme = useColorScheme()
  return scheme === 'dark' ? DARK : LIGHT
}
