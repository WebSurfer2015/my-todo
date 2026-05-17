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
}

export default function PebbleStrip({ count }: Props) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  // Publish the position of the NEXT pebble slot to the PebbleFlight
  // overlay so flying Mochis land exactly where the new pebble materializes.
  // Layout is deterministic (computed below), so we just remember the
  // container's screen origin and offset by `count * slot + slot/2`. Re-
  // measure on every layout pass + republish when count changes.
  const registerCairn = useRegisterCairn()
  const cairnRef = useRef<View>(null)
  const rectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  const publishTarget = useCallback(
    (rect: { x: number; y: number; w: number; h: number }, c: number) => {
      const slot = pebbleWidth(PEBBLE_SIZE) + GAP
      // Cap the target index at the last fully-visible slot so Mochi
      // never lands offscreen when the strip is overflowing. Past the
      // cap, the new pebble is collapsed into the "+N" indicator anyway,
      // so landing near the right edge of the strip is the most
      // visually-honest target available.
      const maxVisibleSlots = Math.max(
        0,
        Math.floor((rect.w - SIDE_PADDING * 2 - OVERFLOW_RESERVE) / slot),
      )
      const targetIdx = Math.min(c, maxVisibleSlots)
      // Center of the slot — the position where the new pebble will
      // render after the store's deferred increment fires. The first
      // real pebble lands at the left even when count was 0 (and the
      // dashed placeholder was centered), so we always target the slot
      // position, not the placeholder's center.
      const offsetX =
        SIDE_PADDING + targetIdx * slot + pebbleWidth(PEBBLE_SIZE) / 2
      registerCairn({ x: rect.x + offsetX, y: rect.y + rect.h / 2 })
    },
    [registerCairn],
  )

  const onCairnLayout = useCallback(() => {
    cairnRef.current?.measureInWindow((x, y, w, h) => {
      rectRef.current = { x, y, w, h }
      publishTarget(rectRef.current, count)
    })
  }, [count, publishTarget])

  // Republish when the count changes — handles the case where layout fires
  // once on mount and the row content reflows internally without retriggering
  // onLayout on the container.
  useEffect(() => {
    if (rectRef.current) publishTarget(rectRef.current, count)
  }, [count, publishTarget])

  if (count === 0) {
    return (
      <View
        ref={cairnRef}
        onLayout={onCairnLayout}
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
      onLayout={onCairnLayout}
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
