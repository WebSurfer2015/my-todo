import React from 'react'
import { StyleSheet, View } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'

/**
 * Bottom-tab icon with a small indicator bar above it on the active tab.
 * The inactive tint has to stay ≥4.5:1 on the chrome band (in light themes
 * that leaves it near-white, like the active one), so "which tab am I on"
 * is carried by this bar + a heavier icon stroke, not by tint alone.
 */
export function TabBarIcon({
  Icon,
  color,
  size,
  focused,
}: {
  Icon: LucideIcon
  color: string
  size?: number
  focused: boolean
}) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.bar, { backgroundColor: focused ? color : 'transparent' }]} />
      <Icon size={size ?? 22} color={color} strokeWidth={focused ? 2.4 : 1.8} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  bar: { width: 18, height: 3, borderRadius: 1.5, marginBottom: 3, marginTop: -6 },
})
