/**
 * Full-screen background renderer driven by `profile.background`. Mounted
 * once in `App.tsx` underneath the main content (positioned absolutely so it
 * fills the root view without affecting layout). Missing or unknown background
 * → falls back to `DEFAULT_BACKGROUND` (cream solid), which renders the same
 * `theme.bg` color the app shipped with before this feature, so existing
 * users see zero diff.
 *
 * Re-renders only when (pattern, pairKey, scheme, width, height) change. The
 * canvas measures its own size via `onLayout` so we don't depend on
 * `Dimensions.get('window')` (which is wrong on iPad multitasking, foldables,
 * etc.).
 */

import React, { useMemo, useState } from 'react'
import { StyleSheet, View, useColorScheme } from 'react-native'
import {
  DEFAULT_BACKGROUND,
  lookupPair,
  lookupPattern,
  tonesFor,
  type Pair,
  type PatternMeta,
} from '../backgrounds'
import { renderPattern } from './backgroundPatterns'
import type { BackgroundChoice } from '../profile'

interface Props {
  /** Raw choice from `profile.background`. Undefined = default cream solid. */
  choice: BackgroundChoice | undefined
  /** Optional override that bypasses `choice` entirely. Used by
   * the "Theme from avatar" path so the background renders from
   * the avatar's color regardless of the saved background pick. */
  override?: { pair: Pair; pattern: PatternMeta }
}

export default function AppBackground({ choice, override }: Props) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light'
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)

  const { pair, pattern } = useMemo(
    () => override ?? resolve(choice),
    [choice, override],
  )

  const content = useMemo(() => {
    if (!size) return null
    const tones = tonesFor(pair, scheme)
    return renderPattern(pattern.key, { tones, width: size.w, height: size.h })
  }, [pair, pattern.key, scheme, size])

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout
        if (width > 0 && height > 0 && (!size || size.w !== width || size.h !== height)) {
          setSize({ w: width, h: height })
        }
      }}
    >
      {content}
    </View>
  )
}

function resolve(choice: BackgroundChoice | undefined): { pair: Pair; pattern: PatternMeta } {
  const c = choice ?? DEFAULT_BACKGROUND
  return {
    pair: lookupPair(c.pairKey),
    pattern: lookupPattern(c.pattern),
  }
}
