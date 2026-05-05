import React, { useMemo } from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path, Circle, Polyline } from 'react-native-svg'
import { ViewMode } from '../types'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'

interface Props {
  view: ViewMode
  onChange: (v: ViewMode) => void
}

function CategoryTabIcon({ size = 22, color = '#8E8E93' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <Circle cx="7" cy="7" r="1" fill={color} />
    </Svg>
  )
}

function StatusTabIcon({ size = 22, color = '#8E8E93' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="9,11 12,14 22,4" />
      <Path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </Svg>
  )
}

export default function BottomTabBar({ view, onChange }: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => makeStyles(theme, insets.bottom), [theme, insets.bottom])

  const tabs: { key: ViewMode; Icon: typeof CategoryTabIcon }[] = [
    { key: 'category', Icon: CategoryTabIcon },
    { key: 'status', Icon: StatusTabIcon },
  ]

  return (
    <View style={styles.bar}>
      {tabs.map(({ key, Icon }) => {
        const active = view === key
        const color = active ? theme.blue : theme.label3
        return (
          <TouchableOpacity
            key={key}
            style={styles.tab}
            onPress={() => onChange(key)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t.views[key]}
          >
            <Icon size={22} color={color} />
            <Text style={[styles.label, { color }]}>{t.views[key]}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

function makeStyles(c: ThemeColors, bottomInset: number) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      backgroundColor: c.surfaceAlt,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.separator,
      paddingTop: 6,
      paddingBottom: Math.max(bottomInset, 8),
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      paddingVertical: 4,
      minHeight: 49,
    },
    label: {
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: -0.16,
    },
  })
}
