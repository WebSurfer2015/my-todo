import React from 'react'
import { ICONS, IconKey } from './icons'
import { useTheme } from '../app/theme'

interface Props {
  icon: IconKey | string
  size?: number
  color?: string
}

export default function CategoryIcon({ icon, size = 15, color }: Props) {
  const theme = useTheme()
  const Component = ICONS[icon as IconKey] ?? ICONS.tag
  // Default to the sage tertiary label so unset icons match the palette
  // (in both light + dark) instead of the old cold iOS system gray.
  return <Component size={size} color={color ?? theme.label3} strokeWidth={2} />
}
