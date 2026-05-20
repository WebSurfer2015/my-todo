import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { View, Text, StyleSheet, Dimensions } from 'react-native'
import Svg, { Ellipse } from 'react-native-svg'
import { useTheme, ThemeColors } from '../theme'
import { useRegisterCairn } from './PebbleFlight'

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
// Width reserved on the right for the inline "+N" indicator — only applied
// when overflow actually exists, so small counts use the full row.
const OVERFLOW_RESERVE = 32

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
  /** When false, the strip still renders but doesn't claim the
   * pebble-flight cairn target. Used by Home/Todos to coordinate
   * single-target ownership via useIsFocused on each screen. */
  active?: boolean
}

export default function PebbleStrip({ count, active = true }: Props) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  // Register a LIVE resolver with the PebbleFlight overlay so flying
  // Mochis land exactly where the new pebble materializes. Measuring at
  // trigger time (instead of caching a published point) keeps the
  // target correct even when the strip's screen-space position shifts
  // — e.g., the search top-sheet opens above and pushes the strip
  // downward without firing onLayout on this container.
  const registerCairn = useRegisterCairn()
  const cairnRef = useRef<View>(null)
  // Snapshot count + the layout-aware offset inside refs so the
  // resolver closure stays stable but still reflects current state.
  const countRef = useRef(count)
  useEffect(() => {
    countRef.current = count
  }, [count])

  useEffect(() => {
    if (!active) return
    const resolver = (cb: (p: { x: number; y: number } | null) => void) => {
      const node = cairnRef.current
      if (!node) {
        cb(null)
        return
      }
      node.measureInWindow((x, y, w, h) => {
        if (
          typeof x !== 'number' ||
          typeof y !== 'number' ||
          !(w > 0) ||
          !(h > 0)
        ) {
          cb(null)
          return
        }
        const slot = pebbleWidth(PEBBLE_SIZE) + GAP
        const maxVisibleSlots = Math.max(
          0,
          Math.floor((w - SIDE_PADDING * 2 - OVERFLOW_RESERVE) / slot),
        )
        const targetIdx = Math.min(countRef.current, maxVisibleSlots)
        const offsetX =
          SIDE_PADDING + targetIdx * slot + pebbleWidth(PEBBLE_SIZE) / 2
        cb({ x: x + offsetX, y: y + h / 2 })
      })
    }
    registerCairn(resolver)
    return () => registerCairn(null)
  }, [registerCairn, active])

  if (count === 0) {
    return (
      <View
        ref={cairnRef}
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
  // fits, render them all. Otherwise reserve and recompute so the inline
  // overflow indicator has room on the same line as the pebble row.
  const screenW = Dimensions.get('window').width
  const usable = screenW - 32 /* App horizontal padding */ - SIDE_PADDING * 2
  const slot = pebbleWidth(PEBBLE_SIZE) + GAP

  let visible = Math.min(count, Math.floor(usable / slot))
  let overflow = count - visible
  if (overflow > 0) {
    visible = Math.min(count, Math.floor((usable - OVERFLOW_RESERVE) / slot))
    overflow = count - visible
  }

  return (
    <View
      ref={cairnRef}
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
    </View>
  )
}

/**
 * Cairn glyph — 3 cream-and-teal pebbles stacked like the icon's cairn.
 * Used as a small brand anchor next to lifetime-pebbles displays.
 */
export function CairnGlyph({ size = 22 }: { size?: number }) {
  const theme = useTheme()
  // SVG box is padded vertically so the bottom stone's stroke can't clip
  // the floor edge even at small sizes.
  const pad = 2
  const stones = [
    { rx: 0.42, ry: 0.16, cy: 0.22 },
    { rx: 0.52, ry: 0.18, cy: 0.48 },
    { rx: 0.65, ry: 0.20, cy: 0.74 },
  ]
  return (
    <Svg width={size} height={size + pad * 2}>
      {stones.map((s, i) => (
        <Ellipse
          key={i}
          cx={size / 2}
          cy={size * s.cy + pad}
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
      fontVariant: ['tabular-nums'],
    },
  })
}
