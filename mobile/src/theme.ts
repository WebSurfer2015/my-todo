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
  // Headspace primary action color (warm sunset orange)
  primary: string
  primaryHover: string
  primarySoft: string
  primaryOn: string
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
  bg: '#FAF6EE',     // warm cream (Headspace)
  card: '#FFFEFC',   // warm white
  surface: 'rgba(255, 254, 252, 0.65)',
  surfaceAlt: 'rgba(255, 254, 252, 0.78)',
  modal: '#FFFEFC',
  label: '#1F1F1F',
  label2: '#4F4F4F',
  label3: '#6B6862',
  separator: '#ECE5D7',
  border: '#ECE5D7',
  primary: '#6E94A8',       // muted slate-teal — calm primary action
  primaryHover: '#5C8294',
  primarySoft: '#DDE6EC',
  primaryOn: '#FFFFFF',
  blue: '#7AA4D4',
  red: '#E07878',
  orange: '#E8A964',
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
  bg: '#1A1815',     // warm dark
  card: '#232017',
  surface: 'rgba(35, 32, 23, 0.65)',
  surfaceAlt: 'rgba(35, 32, 23, 0.78)',
  modal: '#232017',
  label: '#ECECEC',
  label2: '#C4C4C4',
  label3: '#969696',
  separator: '#3A3530',
  border: '#3A3530',
  primary: '#8DA9BD',
  primaryHover: '#A2BCCC',
  primarySoft: '#2E4252',
  primaryOn: '#1A1815',
  blue: '#8AB4DD',
  red: '#E58888',
  orange: '#ECB178',
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
