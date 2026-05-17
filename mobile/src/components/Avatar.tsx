import React from 'react'
import { Image, Text, View, StyleSheet } from 'react-native'
import { Avatar as AvatarT, findPreset } from '../profile'
import { useTheme } from '../theme'

/**
 * Platform-resolved bundled images for presets with `imageKey`. Use the
 * transparent-background mascot rather than the app icon — the icon is full-
 * bleed (the turtle touches its edges) and gets corner-clipped by the
 * circular avatar mask.
 */
const PRESET_IMAGES: Record<string, ReturnType<typeof require>> = {
  mochi: require('../../assets/mochi-mascot.png'),
}

export default function Avatar({ avatar, size = 36 }: { avatar: AvatarT; size?: number }) {
  const theme = useTheme()
  // Brand-teal hairline ring around every avatar so the circle is visible
  // even when its background tint blends into the page cream.
  const ring = {
    borderRadius: size / 2,
    borderWidth: 1.5,
    borderColor: theme.primary,
  }

  if (avatar.kind === 'image') {
    return (
      <Image
        source={{ uri: avatar.uri }}
        style={[{ width: size, height: size }, ring]}
      />
    )
  }
  if (avatar.kind === 'preset') {
    const preset = findPreset(avatar.key)
    const bundled = preset.imageKey ? PRESET_IMAGES[preset.imageKey] : undefined
    if (bundled) {
      // mochi-mascot.png is square-ish with a centered turtle on a
      // transparent background. Contain-fit at slightly less than full
      // size so the turtle's outermost details (head, tail, accent
      // bubble) sit comfortably inside the circular crop instead of
      // pressing against the ring border.
      const inset = Math.max(2, size * 0.08)
      return (
        <View
          style={[
            styles.preset,
            { width: size, height: size, backgroundColor: preset.bg, overflow: 'hidden' },
            ring,
          ]}
        >
          <Image
            source={bundled}
            style={{ width: size - inset * 2, height: size - inset * 2 }}
            resizeMode="contain"
          />
        </View>
      )
    }
    const emojiSize = size * 0.6
    return (
      <View
        style={[
          styles.preset,
          { width: size, height: size, backgroundColor: preset.bg },
          ring,
        ]}
      >
        <Text
          style={{
            fontSize: emojiSize,
            lineHeight: emojiSize * 1.1,
            textAlign: 'center',
            includeFontPadding: false,
          }}
        >
          {preset.emoji}
        </Text>
      </View>
    )
  }
  // 'icon' kind comes from the web app's lucide library — mobile doesn't render those natively.
  // Fall back to a colored circle with a generic glyph.
  return (
    <View
      style={[
        styles.preset,
        { width: size, height: size, backgroundColor: avatar.color },
        ring,
      ]}
    >
      <Text style={{ fontSize: size * 0.55, color: '#fff' }}>★</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  preset: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
