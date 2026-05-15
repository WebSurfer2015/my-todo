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

// Dark mode — lifted pastel mint on a warm dark surface, matching the
// Sagely / Mochi palette but tuned for legibility against deep cream-dark.
export const DARK: ThemeColors = {
  bg: '#1A1814',        // warm dark, slightly more cream-tinted
  card: '#24211B',
  surface: 'rgba(36, 33, 27, 0.65)',
  surfaceAlt: 'rgba(36, 33, 27, 0.78)',
  modal: '#24211B',
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

export function useTheme(): ThemeColors {
  const scheme = useColorScheme()
  return scheme === 'dark' ? DARK : LIGHT
}
