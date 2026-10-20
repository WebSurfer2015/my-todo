import React from 'react'
import { View } from 'react-native'
import type { Priority } from '../core-bindings/types'
import { useTheme } from '../app/theme'
import { priorityGlyphColor } from './priorityGlyph'

/**
 * Three-bar priority badge. High = 3 filled bars, Medium = 2, Low = 1.
 * Filled bars use priorityGlyphColor (warm amber for High, neutral
 * otherwise — never red); unfilled bars are a muted track color. Bars stack bottom-up (shortest on left, tallest on right) so
 * the visual climbs to match a "how loud" reading at a glance.
 *
 * The ONE priority glyph: the filter sheet, CategorySheet, and every row /
 * picker (via PriorityDot) render it, so High reads the same everywhere.
 */

interface Props {
  level: Priority
  /** Total badge width / height in pt. Bars scale inside. */
  size?: number
}

export default function PriorityBars({ level, size = 18 }: Props) {
  const theme = useTheme()
  const filledCount = level === 'high' ? 3 : level === 'medium' ? 2 : 1
  const fill = priorityGlyphColor(theme, level)
  // Bar widths are equal; heights climb 40% → 70% → 100% of size.
  const barW = Math.max(2, Math.round(size / 5))
  const gap = Math.max(1, Math.round(size / 9))
  const heights = [size * 0.4, size * 0.7, size * 1.0]
  return (
    <View
      style={{
        width: size,
        height: size,
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap,
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            width: barW,
            height: heights[i],
            borderRadius: 1,
            backgroundColor: i < filledCount ? fill : theme.label3,
            opacity: i < filledCount ? 1 : 0.25,
          }}
        />
      ))}
    </View>
  )
}
