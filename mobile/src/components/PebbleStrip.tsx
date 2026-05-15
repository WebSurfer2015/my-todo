import React, { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Ellipse } from 'react-native-svg'
import { useTheme, ThemeColors } from '../theme'

/**
 * Gentle progress indicator. Each completed task adds a cream-and-teal-outline
 * pebble to a horizontal row, echoing the cairn on Mochi's shell from the
 * brand illustration.
 *
 * Calm-design rules baked in (per the pebbles spec):
 *  - Pebbles never disappear retroactively. Today resets to 0 at midnight
 *    (handled in profile.ts); never decremented by the user.
 *  - No goal/quota copy. No "X more pebbles to your daily target."
 *  - No mascot-mood signaling. Mochi doesn't get sadder with fewer pebbles.
 */

const MAX_VISIBLE = 7
// Slight size variance per slot so the row reads like real stones, not
// a row of identical dots.
const SIZE_VARIANTS = [16, 14, 17, 15, 16, 18, 15]
// Subtle vertical jitter to suggest hand-placement.
const Y_JITTER = [0, 1, -1, 0, 1, 0, -1]

interface PebbleProps {
  size: number
  fill: string
  stroke: string
  shadow: string
}

/**
 * Single outlined pebble — cream fill, teal stroke, soft drop shadow. Matches
 * the stacked-pebble cairn on Mochi's shell in the brand illustration.
 */
function Pebble({ size, fill, stroke, shadow }: PebbleProps) {
  const w = size * 1.35
  const h = size * 0.95
  const pad = 2
  const W = w + pad * 2
  const H = h + pad * 2 + 1
  return (
    <Svg width={W} height={H}>
      {/* Soft drop shadow */}
      <Ellipse
        cx={W / 2}
        cy={H / 2 + 1.5}
        rx={w / 2 - 1}
        ry={h / 2 - 1}
        fill={shadow}
        opacity={0.18}
      />
      {/* Pebble body */}
      <Ellipse
        cx={W / 2}
        cy={H / 2}
        rx={w / 2 - 1}
        ry={h / 2 - 1}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
      />
    </Svg>
  )
}

interface Props {
  count: number
}

export default function PebbleStrip({ count }: Props) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const visible = Math.min(count, MAX_VISIBLE)
  const overflow = Math.max(0, count - MAX_VISIBLE)

  if (count === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.row}>
          {/* Dashed-outline pebble — gentle invitation, no pressure */}
          <Svg width={24} height={16}>
            <Ellipse
              cx={12}
              cy={8}
              rx={10}
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

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {Array.from({ length: visible }).map((_, i) => (
          <View key={i} style={{ marginTop: Y_JITTER[i % Y_JITTER.length] }}>
            <Pebble
              size={SIZE_VARIANTS[i % SIZE_VARIANTS.length]}
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
  // Three stones, tapering top → narrow, bottom → wide.
  const stones = [
    { rx: 0.45, ry: 0.18, cy: 0.30 }, // top
    { rx: 0.55, ry: 0.20, cy: 0.55 }, // middle
    { rx: 0.70, ry: 0.22, cy: 0.82 }, // bottom
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
      paddingTop: 4,
      paddingBottom: 10,
      paddingHorizontal: 4,
      alignItems: 'flex-start',
      gap: 4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
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
      fontWeight: '600',
      marginLeft: 6,
    },
  })
}
