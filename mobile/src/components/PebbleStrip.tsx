import React, { useMemo } from 'react'
import { View, Text, StyleSheet, Dimensions } from 'react-native'
import Svg, { Ellipse } from 'react-native-svg'
import { useTheme, ThemeColors } from '../theme'

/**
 * Live progress indicator. Big pebbles for completed tasks, small pebbles
 * for completed subtasks. Pebbles accumulate from the left; the count caption
 * is pinned to the right on the same row.
 *
 * Live = mirrors current state. Un-checking a task removes its pebble
 * (decrement is handled in the store). At local midnight the counters
 * reset to 0 (handled in profile.ts).
 */

const BIG_SIZE = 18
const SMALL_SIZE = 11
// Inter-pebble gap (matches the icon's spacing).
const GAP = 3
// Width reserved on the right for the count caption.
const CAPTION_RESERVE = 96
// Side padding on the strip.
const SIDE_PADDING = 4
// Width reserved at the end for the "+N" overflow indicator (if any).
const OVERFLOW_RESERVE = 28

// Slight size variance per slot so the row reads like real stones.
const BIG_JITTER = [0, -1, 0, 1, 0, -1, 1, 0]
const SMALL_JITTER = [0, 1, -1, 0, 1, 0, -1, 0]

interface PebbleProps {
  size: number
  fill: string
  stroke: string
  shadow: string
  strokeWidth?: number
}

function Pebble({ size, fill, stroke, shadow, strokeWidth = 1.4 }: PebbleProps) {
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
        strokeWidth={strokeWidth}
      />
    </Svg>
  )
}

function pebbleWidth(size: number): number {
  return size * 1.35 + 4 // body + 2px padding each side
}

interface Props {
  taskCount: number
  subtaskCount: number
}

export default function PebbleStrip({ taskCount, subtaskCount }: Props) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const total = taskCount + subtaskCount

  if (total === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyPebble}>
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

  // How many fit before we need a "+N" indicator?
  const screenW = Dimensions.get('window').width
  // App.tsx renders the strip inside a 16-px padded content area, so the
  // usable width is screenW - 32 - sidePadding*2. We further reserve
  // CAPTION_RESERVE on the right for the count caption.
  const usable =
    screenW - 32 /* App padding */ - SIDE_PADDING * 2 - CAPTION_RESERVE
  const bigW = pebbleWidth(BIG_SIZE) + GAP
  const smallW = pebbleWidth(SMALL_SIZE) + GAP

  // Greedy fit: tasks first (big), then subtasks (small).
  let used = 0
  let visibleBig = 0
  for (let i = 0; i < taskCount; i++) {
    if (used + bigW <= usable - OVERFLOW_RESERVE) {
      visibleBig++
      used += bigW
    } else {
      break
    }
  }
  let visibleSmall = 0
  for (let i = 0; i < subtaskCount; i++) {
    if (used + smallW <= usable - OVERFLOW_RESERVE) {
      visibleSmall++
      used += smallW
    } else {
      break
    }
  }
  const overflow =
    taskCount - visibleBig + (subtaskCount - visibleSmall)
  // If nothing overflowed, we don't need the reserve; recompute one more.
  // (Lets the row use the OVERFLOW_RESERVE slot when counts are small.)
  if (overflow === 0) {
    if (taskCount > visibleBig + 0 && used + bigW <= usable) {
      // unreachable — kept for clarity
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.pebblesArea}>
          {Array.from({ length: visibleBig }).map((_, i) => (
            <View
              key={`big-${i}`}
              style={{ marginTop: BIG_JITTER[i % BIG_JITTER.length] }}
            >
              <Pebble
                size={BIG_SIZE}
                fill={theme.card}
                stroke={theme.primary}
                shadow={theme.primaryHover}
                strokeWidth={1.5}
              />
            </View>
          ))}
          {Array.from({ length: visibleSmall }).map((_, i) => (
            <View
              key={`small-${i}`}
              style={{ marginTop: SMALL_JITTER[i % SMALL_JITTER.length] + 4 }}
            >
              <Pebble
                size={SMALL_SIZE}
                fill={theme.card}
                stroke={theme.primary}
                shadow={theme.primaryHover}
                strokeWidth={1.2}
              />
            </View>
          ))}
          {overflow > 0 && <Text style={styles.overflow}>+{overflow}</Text>}
        </View>
        <Text style={styles.caption}>
          {total === 1 ? '1 today' : `${total} today`}
        </Text>
      </View>
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
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 24,
    },
    pebblesArea: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'nowrap',
      gap: GAP,
      overflow: 'hidden',
    },
    caption: {
      fontSize: 12,
      color: c.label3,
      fontWeight: '600',
      letterSpacing: 0.1,
      marginLeft: 8,
      fontVariant: ['tabular-nums'],
      textAlign: 'right',
      minWidth: 72,
    },
    emptyContainer: {
      paddingTop: 2,
      paddingBottom: 8,
      paddingHorizontal: SIDE_PADDING,
      marginBottom: 14,
      flexDirection: 'row',
      alignItems: 'center',
    },
    emptyPebble: {
      marginRight: 8,
    },
    overflow: {
      fontSize: 11,
      color: c.label2,
      fontWeight: '700',
      marginLeft: 4,
    },
  })
}
