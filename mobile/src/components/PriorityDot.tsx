import React from 'react'
import { View } from 'react-native'
import { Priority, PRIORITY_COLORS } from '../types'

export default function PriorityDot({ level, size = 10 }: { level: Priority; size?: number }) {
  return (
    <View style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: PRIORITY_COLORS[level],
    }} />
  )
}
