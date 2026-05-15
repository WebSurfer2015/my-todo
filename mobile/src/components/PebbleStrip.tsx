import React, { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Ellipse } from 'react-native-svg'
import { useTheme, ThemeColors } from '../theme'

/**
 * Gentle progress indicator: a row of small stones showing today's completed
 * tasks. Capped at MAX_VISIBLE; overflow shows as "+N". Empty state teaches
 * the brand philosophy without pressuring the user.
 *
 * Rules baked into this component:
 *  - Pebbles never disappear retroactively. Today resets to 0 at midnight
 *    (handled in profile.ts); never decremented by the user.
 *  - No goal/quota copy. No "X more pebbles to your daily target."
 *  - No mascot-mood signaling. Mochi doesn't get sadder with fewer pebbles.
 */

const MAX_VISIBLE = 7

// Slight size variance per slot so the row looks like real stones, not a
// grid of identical dots.
const SIZE_VARIANTS = [16, 14, 17, 15, 16, 18, 15]

interface PebbleProps {
  size: number
  fill: string
  shadow: string
}

function Pebble({ size, fill, shadow }: PebbleProps) {
  const w = size * 1.35
  const h = size * 0.9
  return (
    <Svg width={w} height={h + 2}>
      {/* Soft drop shadow */}
      <Ellipse cx={w / 2} cy={h / 2 + 1.5} rx={w / 2 - 1} ry={h / 2 - 1} fill={shadow} opacity={0.22} />
      <Ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 1} ry={h / 2 - 1} fill={fill} />
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
          <Svg width={22} height={16}>
            <Ellipse
              cx={11}
              cy={8}
              rx={9}
              ry={5.5}
              fill="none"
              stroke={theme.label3}
              strokeWidth={1.2}
              strokeDasharray="2,2"
              opacity={0.5}
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
          <Pebble
            key={i}
            size={SIZE_VARIANTS[i % SIZE_VARIANTS.length]}
            fill={theme.primary}
            shadow={theme.primaryHover}
          />
        ))}
        {overflow > 0 && <Text style={styles.overflow}>+{overflow}</Text>}
      </View>
      <Text style={styles.caption}>
        {count === 1 ? '1 pebble today' : `${count} pebbles today`}
      </Text>
    </View>
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
      gap: 5,
      minHeight: 18,
    },
    caption: {
      fontSize: 12,
      color: c.label3,
      fontWeight: '500',
      letterSpacing: 0.1,
    },
    overflow: {
      fontSize: 12,
      color: c.label3,
      fontWeight: '600',
      marginLeft: 4,
    },
  })
}
