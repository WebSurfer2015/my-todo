import React from 'react'
import { Image, Text, View, StyleSheet } from 'react-native'
import { Avatar as AvatarT, findPreset } from '../core-bindings/profile'
import { useTheme } from '../app/theme'
import { darkenHex } from './backgrounds'

/**
 * Platform-resolved bundled images for presets with `imageKey`. Use the
 * transparent-background mascot rather than the app icon — the icon is full-
 * bleed (the turtle touches its edges) and gets corner-clipped by the
 * circular avatar mask.
 *
 * To replace an emoji preset with a custom illustration:
 *   1. Drop the PNG at `mobile/assets/preset-avatars/<key>.png` (transparent
 *      background, square ~256×256, subject centered with breathing room).
 *   2. Uncomment the matching `require` line below.
 * The avatar renderer checks PRESET_IMAGES[preset.imageKey] before falling
 * back to the emoji, so this is the only edit needed once the asset exists.
 */
const PRESET_IMAGES: Record<string, ReturnType<typeof require>> = {
  mochi: require('../../assets/mochi-mascot.png'),
  // cat:       require('../../assets/preset-avatars/cat.png'),
  // dog:       require('../../assets/preset-avatars/dog.png'),
  // bird:      require('../../assets/preset-avatars/bird.png'),
  // fish:      require('../../assets/preset-avatars/fish.png'),
  // flower:    require('../../assets/preset-avatars/flower.png'),
  // butterfly: require('../../assets/preset-avatars/butterfly.png'),
  // owl:       require('../../assets/preset-avatars/owl.png'),
  // elephant:  require('../../assets/preset-avatars/elephant.png'),
  // whale:     require('../../assets/preset-avatars/whale.png'),
  // squirrel:  require('../../assets/preset-avatars/squirrel.png'),
  // rabbit:    require('../../assets/preset-avatars/rabbit.png'),
}

/** Avatar ring uses ~7.5% darken — subtle, hue-matched, never overpowering. */
const RING_DARKEN = 0.075

export default function Avatar({ avatar, size = 36 }: { avatar: AvatarT; size?: number }) {
  const theme = useTheme()
  // Ring color follows the avatar's own bg — a few shades darker in the
  // same hue. For user-uploaded photos we don't know the bg, so fall back
  // to the brand teal so the circle is still visible against the cream
  // page background.
  const ringColor =
    avatar.kind === 'preset'
      ? darkenHex(findPreset(avatar.key).bg, RING_DARKEN)
      : avatar.kind === 'icon'
        ? darkenHex(avatar.color, RING_DARKEN)
        : theme.primary
  const ring = {
    borderRadius: size / 2,
    borderWidth: 1.5,
    borderColor: ringColor,
  }

  if (avatar.kind === 'image') {
    return (
      <Image
        source={{ uri: avatar.uri }}
        style={[{ width: size, height: size, overflow: 'hidden' }, ring]}
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
          { width: size, height: size, backgroundColor: preset.bg, overflow: 'hidden' },
          ring,
        ]}
      >
        <Text
          style={{
            fontSize: emojiSize,
            // lineHeight == fontSize so the glyph's line box hugs it and
            // the parent's center alignment truly centers the animal.
            lineHeight: emojiSize,
            textAlign: 'center',
            textAlignVertical: 'center',
            includeFontPadding: false,
            // Emoji glyphs sit a little high in their box — nudge down
            // so the animal reads visually centered in the circle.
            // Butterfly + fish render higher than the rest, so they get
            // a touch more.
            transform: [
              {
                translateY:
                  emojiSize *
                  (preset.key === 'butterfly' || preset.key === 'fish' ? 0.13 : 0.08),
              },
            ],
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
        { width: size, height: size, backgroundColor: avatar.color, overflow: 'hidden' },
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
