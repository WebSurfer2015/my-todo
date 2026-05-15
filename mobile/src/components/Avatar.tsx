import React from 'react'
import { Image, Text, View, StyleSheet } from 'react-native'
import { Avatar as AvatarT, findPreset } from '../profile'

export default function Avatar({ avatar, size = 36 }: { avatar: AvatarT; size?: number }) {
  if (avatar.kind === 'image') {
    return (
      <Image
        source={{ uri: avatar.uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    )
  }
  if (avatar.kind === 'preset') {
    const preset = findPreset(avatar.key)
    const emojiSize = size * 0.6
    return (
      <View
        style={[
          styles.preset,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: preset.bg },
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
        { width: size, height: size, borderRadius: size / 2, backgroundColor: avatar.color },
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
