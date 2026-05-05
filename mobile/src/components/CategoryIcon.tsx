import React from 'react'
import { ICONS, IconKey } from '../icons'

interface Props {
  icon: IconKey | string
  size?: number
  color?: string
}

export default function CategoryIcon({ icon, size = 15, color = '#8E8E93' }: Props) {
  const Component = ICONS[icon as IconKey] ?? ICONS.tag
  return <Component size={size} color={color} />
}
