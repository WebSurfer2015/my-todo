import React, { useMemo } from 'react'
import { View, Text, StyleSheet, Dimensions } from 'react-native'
import Svg, { Ellipse } from 'react-native-svg'
import { useTheme, ThemeColors } from '../theme'

/**
 * Live progress indicator. Each completed task or subtask adds one pebble.
 * Un-completing removes it (decrement is handled in the store). At local
 * midnight the counter resets to 0.
 *
 * The row fills from the left across the full available width; if the
 * count would overflow, a "+N" indicator appears at the end. The caption
 * ("N today") sits beneath the row.
 */

const PEBBLE_SIZE = 15
// Inter-pebble gap (matches the icon's spacing).
const GAP = 3
// Side padding on the strip.
const SIDE_PADDING = 4
// Width reserved on the right for the "+N" indicator — only applied when
// overflow actually exists, so small counts can use the full row.
const OVERFLOW_RESERVE = 30

// Slight size variance per slot so the row reads like real stones.
const SIZE_JITTER = [0, 1, -1, 0, 1, -1, 0, 1]
const Y_JITTER = [0, 1, -1, 0, 1, 0, -1, 1]

interface PebbleProps {
  size: number
  fill: string
  stroke: string
  shadow: string
}

function Pebble({ size, fill, stroke, shadow }: PebbleProps) {
  const w = size * 1.35
  const h = size * 0.95
  const pad = 2
  const W = w + pad * 2
  const H = h + pad * 2 + 1
  return (
    <Svg width={W} height={H}>
      <Ellipse
        cx={W / 2}
        cy={H / 2 + 1.5}
        rx={w / 2 - 1}
        ry={h / 2 - 1}
        fill={shadow}
        opacity={0.18}
      />
      <Ellipse
        cx={W / 2}
        cy={H / 2}
        rx={w / 2 - 1}
        ry={h / 2 - 1}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.4}
      />
    </Svg>
  )
}

function pebbleWidth(size: number): number {
  return size * 1.35 + 4 // body + 2px padding each side
}

interface Props {
  count: number
}

export default function PebbleStrip({ count }: Props) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  if (count === 0) {
    return (
      <View
        style={styles.container}
        accessible
        accessibilityRole="text"
        accessibilityLabel="No pebbles placed today yet. One pebble. That's it."
      >
        <View style={styles.row}>
          <Svg width={26} height={16}>
            <Ellipse
              cx={13}
              cy={8}
              rx={11}
              ry={5.5}
              fill="none"
              stroke={theme.label3}
              strokeWidth={1.3}
              strokeDasharray="2,2.5"
              opacity={0.55}
            />
          </Svg>
        </View>
        <Text style={styles.caption}>One pebble. That's it.</Text>
      </View>
    )
  }

  // Greedy fit. First try without reserving space for "+N" — if everything
  // fits, render them all. Otherwise reserve and recompute.
  const screenW = Dimensions.get('window').width
  const usable = screenW - 32 /* App horizontal padding */ - SIDE_PADDING * 2
  const slot = pebbleWidth(PEBBLE_SIZE) + GAP

  let visible = Math.min(count, Math.floor(usable / slot))
  let overflow = count - visible
  if (overflow > 0) {
    // Reserve space for the "+N" indicator and recompute.
    visible = Math.min(count, Math.floor((usable - OVERFLOW_RESERVE) / slot))
    overflow = count - visible
  }

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="text"
      accessibilityLabel={count === 1 ? '1 pebble placed today' : `${count} pebbles placed today`}
    >
      <View style={styles.row}>
        {Array.from({ length: visible }).map((_, i) => (
          <View
            key={i}
            style={{ marginTop: Y_JITTER[i % Y_JITTER.length] }}
          >
            <Pebble
              size={PEBBLE_SIZE + SIZE_JITTER[i % SIZE_JITTER.length]}
              fill={theme.card}
              stroke={theme.primary}
              shadow={theme.primaryHover}
            />
          </View>
        ))}
        {overflow > 0 && <Text style={styles.overflow}>+{overflow}</Text>}
      </View>
      <Text style={styles.caption}>
        {count === 1 ? '1 pebble today' : `${count} pebbles today`}
      </Text>
    </View>
  )
}

/**
 * Cairn glyph — 3 cream-and-teal pebbles stacked like the icon's cairn.
 * Used as a small brand anchor next to lifetime-pebbles displays.
 */
export function CairnGlyph({ size = 22 }: { size?: number }) {
  const theme = useTheme()
  const stones = [
    { rx: 0.45, ry: 0.18, cy: 0.30 },
    { rx: 0.55, ry: 0.20, cy: 0.55 },
    { rx: 0.70, ry: 0.22, cy: 0.82 },
  ]
  return (
    <Svg width={size} height={size}>
      {stones.map((s, i) => (
        <Ellipse
          key={i}
          cx={size / 2}
          cy={size * s.cy}
          rx={size * s.rx}
          ry={size * s.ry}
          fill={theme.card}
          stroke={theme.primary}
          strokeWidth={1.3}
        />
      ))}
    </Svg>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingTop: 2,
      paddingBottom: 8,
      paddingHorizontal: SIDE_PADDING,
      marginBottom: 14,
      alignItems: 'flex-start',
      gap: 4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'nowrap',
      gap: GAP,
      minHeight: 22,
    },
    caption: {
      fontSize: 12,
      color: c.label3,
      fontWeight: '500',
      letterSpacing: 0.1,
    },
    overflow: {
      fontSize: 12,
      color: c.label2,
      fontWeight: '700',
      marginLeft: 6,
    },
  })
}
