import React, { useMemo } from 'react'
import { TouchableOpacity, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Line } from 'react-native-svg'
import { useTheme, ThemeColors } from '../theme'

interface Props {
  onPress: () => void
  accessibilityLabel?: string
}

export default function Fab({ onPress, accessibilityLabel }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => makeStyles(theme, insets.bottom), [theme, insets.bottom])
  return (
    <TouchableOpacity
      style={styles.fab}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round">
        <Line x1="12" y1="5" x2="12" y2="19" />
        <Line x1="5" y1="12" x2="19" y2="12" />
      </Svg>
    </TouchableOpacity>
  )
}

function makeStyles(c: ThemeColors, bottomInset: number) {
  return StyleSheet.create({
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 16 + bottomInset,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.20,
      shadowRadius: 10,
      elevation: 6,
    },
  })
}
