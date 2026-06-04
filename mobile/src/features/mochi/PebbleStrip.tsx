import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { View, Text, StyleSheet, Dimensions } from 'react-native'
import Svg, { Ellipse } from 'react-native-svg'
import { useTheme, ThemeColors } from '../../app/theme'
import { useRegisterCairn } from './PebbleFlight'
import { useStore } from '../../app/StoreContext'
import { useLang } from '../../app/LangContext'
import { collectedGlyphFor, collectedNounKeyFor } from '../../core-bindings/profile'
import { darkenHex } from '../../ui/backgrounds'

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
// Pebble fill palette — the `deep` accents from backgrounds.ts so the
// cairn reads as a curated riverbed instead of one flat color. Cycles
// by position; index 0 is leftmost (oldest pebble of the day).
const PEBBLE_PALETTE = [
  '#D8CDA8', // cream (warm beige)
  '#A8C9B4', // mochi shell (sage)
  '#EFC9B0', // cream sunrise (peach)
  '#9DB0A3', // sage dusk
  '#E0B8B4', // misty rose
  '#BFB4D0', // lavender breath
  '#A4C0BE', // sea-glass
  '#D9C28A', // honey paper
]
// Pebbles align on a single baseline now — the previous per-index
// Y-jitter (~±1 px) read as misalignment instead of organic
// variation. Keep the array for back-compat with any imports but
// fix every offset to 0.
const Y_JITTER = [0, 0, 0, 0, 0, 0, 0, 0]

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
  const { t } = useLang()
  const profile = useStore().profile
  // Themed collectable for the current preset avatar — fish for
  // the cat, bone for the dog, etc. null means render the default
  // SVG pebble. Read at render so changes to the avatar (Edit
  // profile → Save) re-render the strip with the new glyph.
  const collectedGlyph = collectedGlyphFor(profile.avatar)
  // Themed caption noun. Only when the user has opted into theme-from-
  // avatar AND the preset has a noun mapping — otherwise the caption
  // keeps the default "One pebble. That's it." brand copy.
  const captionNounKey =
    profile.themeFromAvatar === true ? collectedNounKeyFor(profile.avatar) : null

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
        accessibilityLabel={`Nothing today yet. ${t.oneItemCaption(captionNounKey)}`}
      >
        <View style={styles.row}>
          {collectedGlyph ? (
            // Themed avatar: ghost-render the themed glyph itself so the
            // empty-state outline matches the noun in the caption ("One
            // star. That's it." → faded ⭐). Default Mochi falls back to
            // the dashed pebble ellipse below.
            <Text style={styles.emptyGlyph}>{collectedGlyph}</Text>
          ) : (
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
          )}
          {/* Inline label — icon + caption on a single row instead of
              stacked. Reads as a single calm bit of chrome rather than
              a two-line block. */}
          <Text style={styles.caption}>{t.oneItemCaption(captionNounKey)}</Text>
        </View>
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
        {Array.from({ length: visible }).map((_, i) => {
          // Avatar-themed glyph (fish for cat, bone for dog, etc.)
          // wins when the current preset maps to one. Otherwise the
          // curated cycling-palette SVG pebble is the default.
          if (collectedGlyph) {
            return (
              <Text
                key={i}
                style={[styles.collectedGlyph, { marginTop: Y_JITTER[i % Y_JITTER.length] }]}
              >
                {collectedGlyph}
              </Text>
            )
          }
          const fill = PEBBLE_PALETTE[i % PEBBLE_PALETTE.length]
          const stroke = darkenHex(fill, 0.18)
          return (
            <View
              key={i}
              style={{ marginTop: Y_JITTER[i % Y_JITTER.length] }}
            >
              <Pebble
                size={PEBBLE_SIZE + SIZE_JITTER[i % SIZE_JITTER.length]}
                fill={fill}
                stroke={stroke}
                shadow={theme.primaryHover}
              />
            </View>
          )
        })}
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
  // SVG box is padded so neither the bottom stone's stroke nor its
  // edges can clip. The bottom stone's rx is 0.65*size, so its full
  // width is 1.30*size — without horizontal padding it would extend
  // 15% past the SVG bounds on each side and get cropped.
  const stones = [
    { rx: 0.42, ry: 0.16, cy: 0.22 },
    { rx: 0.52, ry: 0.18, cy: 0.48 },
    { rx: 0.65, ry: 0.20, cy: 0.74 },
  ]
  const maxRx = Math.max(...stones.map((s) => s.rx))
  // Add the half-overhang plus a small stroke buffer (~2px).
  const padX = Math.max(2, size * (maxRx - 0.5) + 2)
  const padY = 2
  const w = size + padX * 2
  const h = size + padY * 2
  return (
    <Svg width={w} height={h}>
      {stones.map((s, i) => (
        <Ellipse
          key={i}
          cx={w / 2}
          cy={size * s.cy + padY}
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
      // Vertical padding bumped from 4 → 8 now that the strip is a
      // tinted band — extra breathing room so the background doesn't
      // pinch the pebble row. Horizontal padding bumped from 4 → 16
      // so content aligns with the app's 16px gutters.
      paddingVertical: 8,
      paddingHorizontal: 16,
      alignItems: 'flex-start',
      justifyContent: 'center',
      gap: 4,
      // Pale theme-tinted surface so the strip reads as chrome
      // (between AppHeader and content) rather than blending into
      // the canvas. primarySoft adapts to avatar theme + dark mode
      // so it stays subtle across every palette.
      backgroundColor: c.primarySoft,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'nowrap',
      gap: GAP,
      // Min-height generous enough to fit pebble pills without
      // clipping. Down from 32 → 24 since the empty-state row only
      // hosts a small icon + caption now (the populated state still
      // fits comfortably — pebbles are ~16px tall).
      minHeight: 24,
    },
    caption: {
      fontSize: 12,
      color: c.label3,
      fontWeight: '500',
      letterSpacing: 0.1,
    },
    emptyGlyph: {
      // Shrunk to match the caption's visual weight on a single row
      // — 18pt looked oversized next to 12pt italic text.
      fontSize: 14,
      lineHeight: 18,
      opacity: 0.45,
    },
    overflow: {
      fontSize: 12,
      color: c.label2,
      fontWeight: '700',
      marginLeft: 6,
      fontVariant: ['tabular-nums'],
    },
    // Avatar-themed collectable. Sized to roughly match the SVG
    // pebble footprint so layout doesn't jump when the avatar changes.
    // Emoji render bigger than their declared font size on iOS, so we
    // size BELOW PEBBLE_SIZE rather than above. lineHeight is bumped
    // above fontSize so tall emoji like 🌰 / 🥕 don't clip at the
    // bottom of the row.
    collectedGlyph: {
      fontSize: PEBBLE_SIZE - 2,
      lineHeight: PEBBLE_SIZE + 8,
      marginHorizontal: 1,
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
  })
}
