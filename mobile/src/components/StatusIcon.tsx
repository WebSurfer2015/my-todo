import React from 'react'
import Svg, { Path, Circle, Polyline } from 'react-native-svg'
import { StatusFilter } from '../types'
import type { ThemeColors } from '../theme'

export function statusColor(id: StatusFilter, theme: ThemeColors): string {
  switch (id) {
    case 'overdue': return theme.red
    case 'open':    return theme.blue
    case 'done':    return theme.green
    case 'trash':   return theme.gray
    // R1 plumbing — surfaced once Skip lands in R5.
    case 'notDo':   return theme.gray
  }
}

interface Props {
  size?: number
  color?: string
}

function OverdueIcon({ size = 16, color = '#3C3C43' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Polyline points="12,6 12,12 16,14" />
    </Svg>
  )
}

function OpenIcon({ size = 16, color = '#3C3C43' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
    </Svg>
  )
}

function DoneIcon({ size = 16, color = '#3C3C43' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Path d="M8 12l3 3 5-6" />
    </Svg>
  )
}

function TrashIcon({ size = 16, color = '#3C3C43' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 6h18" />
      <Path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <Path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    </Svg>
  )
}

function NotDoIcon({ size = 16, color = '#3C3C43' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Path d="M8 8l8 8" />
      <Path d="M16 8l-8 8" />
    </Svg>
  )
}

export default function StatusIcon({ id, size = 16, color = '#3C3C43' }: { id: StatusFilter; size?: number; color?: string }) {
  switch (id) {
    case 'overdue': return <OverdueIcon size={size} color={color} />
    case 'open':    return <OpenIcon    size={size} color={color} />
    case 'done':    return <DoneIcon    size={size} color={color} />
    case 'trash':   return <TrashIcon   size={size} color={color} />
    case 'notDo':   return <NotDoIcon   size={size} color={color} />
  }
}
