import React from 'react'
import Svg, { Path } from 'react-native-svg'

/**
 * Calm brand glyph — a small two-leaf sprout with a short stem. Replaces
 * the former "cairn" (stacked stones) mark everywhere. Minimal, rounded,
 * and quiet: it signals gentle growth rather than scorekeeping.
 *
 * Props:
 *  - size  — square footprint in pt (default 28).
 *  - color — leaf + stem color (default a soft sage green).
 */
interface Props {
  size?: number
  color?: string
}

export default function SproutGlyph({ size = 28, color = '#6FAE8A' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Short stem, rounded ends. */}
      <Path
        d="M12 22 L12 12"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* Left leaf. */}
      <Path
        d="M12 13 C7 14 4 10 4.5 5 C9.5 5.5 12 9 12 13 Z"
        fill={color}
        opacity={0.9}
      />
      {/* Right leaf. */}
      <Path
        d="M12 13 C17 14 20 10 19.5 5 C14.5 5.5 12 9 12 13 Z"
        fill={color}
        opacity={0.9}
      />
    </Svg>
  )
}
