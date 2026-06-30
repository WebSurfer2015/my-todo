/**
 * Empty-state glyph — a small, calm sprout sized to sit above an
 * EmptyStateCard's title. Renders the shared SproutGlyph (the brand's
 * leaf mark) at a dampened opacity so it supports the title rather than
 * competing with it — a subtle cue that the surface is intentionally empty.
 */

import React from 'react'
import { StyleSheet, View } from 'react-native'
import SproutGlyph from '../../ui/SproutGlyph'

interface Props {
  /** Glyph size in pt. Default 40 reads as "small ornament", not a hero
   * illustration. */
  size?: number
}

export default function EmptyStateGlyph({ size = 40 }: Props) {
  return (
    <View style={[styles.wrap, { opacity: 0.6 }]}>
      <SproutGlyph size={size} />
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
