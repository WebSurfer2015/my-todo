/**
 * Theme-aware empty-state glyph. Renders a small stack/cluster sized
 * to sit above an EmptyStateCard's title — pebbles for Mochi (the
 * default), or whatever the user's avatar preset collects (fish for
 * cat, bones for dog, bubbles for fish, feathers for bird, etc.).
 *
 * The cluster reads as "a small pile of nothing" — subtle visual
 * cue that the surface is intentionally empty, themed to match the
 * user's collected glyph language elsewhere (PebbleStrip cairns,
 * lifetime count, mascot lines).
 *
 * Visual:
 *  - default avatar (no glyph mapping) → CairnGlyph (SVG 3-stone cairn)
 *  - mapped preset → 3 emoji arranged in a soft cairn shape, with
 *    the middle glyph slightly elevated. Opacity is dampened so the
 *    glyph supports the title rather than competing with it.
 */

import React from 'react'
import { StyleSheet, View } from 'react-native'
import { CairnGlyph } from './PebbleStrip'

interface Props {
  /** Cluster size in pt — controls the SVG cairn width. Default 40
   * reads as "small ornament", not a hero illustration. */
  size?: number
}

export default function EmptyStateGlyph({ size = 40 }: Props) {
  // Default Mochi: stone cairn matches the brand pebble vocabulary.
  return (
    <View style={[styles.wrap, { opacity: 0.6 }]}>
      <CairnGlyph size={size} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
})
