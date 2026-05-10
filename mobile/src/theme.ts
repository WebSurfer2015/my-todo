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

export const LIGHT: ThemeColors = {
  bg: '#F2F2F7',
  card: '#FFFFFF',
  surface: 'rgba(255, 255, 255, 0.55)',
  surfaceAlt: 'rgba(255, 255, 255, 0.6)',
  modal: '#FFFFFF',
  label: '#000000',
  label2: '#3C3C43',
  label3: '#8E8E93',
  separator: '#E5E5EA',
  border: '#E5E5EA',
  blue: '#007AFF',
  red: '#FF3B30',
  orange: '#FF9500',
  yellow: '#FFCC00',
  green: '#34C759',
  purple: '#AF52DE',
  pink: '#FF2D92',
  teal: '#30B0C7',
  gray: '#8E8E93',
  gray3: '#C7C7CC',
  statusBar: 'dark-content',
}

export const DARK: ThemeColors = {
  bg: '#000000',
  card: '#1C1C1E',
  surface: 'rgba(28, 28, 30, 0.55)',
  surfaceAlt: 'rgba(28, 28, 30, 0.7)',
  modal: '#1C1C1E',
  label: '#FFFFFF',
  label2: 'rgba(235, 235, 245, 0.78)',
  label3: '#8E8E93',
  separator: 'rgba(84, 84, 88, 0.6)',
  border: 'rgba(84, 84, 88, 0.65)',
  blue: '#0A84FF',
  red: '#FF453A',
  orange: '#FF9F0A',
  yellow: '#FFD60A',
  green: '#30D158',
  purple: '#BF5AF2',
  pink: '#FF375F',
  teal: '#40C8E0',
  gray: '#8E8E93',
  gray3: '#48484A',
  statusBar: 'light-content',
}

export function useTheme(): ThemeColors {
  const scheme = useColorScheme()
  return scheme === 'dark' ? DARK : LIGHT
}
