import React, { useEffect, useMemo, useState } from 'react'
import {
  Keyboard,
  KeyboardEvent,
  Platform,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
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

  // Track the keyboard height so the FAB lifts above the keyboard
  // instead of sitting behind it. This matters for the search top-sheet
  // flow — when a search returns no matches, the user needs to tap the
  // FAB to add a new item without first dismissing the keyboard. iOS
  // fires `keyboardWillShow` synchronously with the animation; Android
  // only fires `keyboardDidShow`.
  const [kbHeight, setKbHeight] = useState(0)
  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      setKbHeight(e.endCoordinates.height)
    })
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKbHeight(0)
    })
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  // With keyboard up: sit 12pt above the keyboard. Closed: sit on the
  // safe-area baseline + 4pt the design uses.
  const bottom = kbHeight > 0 ? kbHeight + 12 : 4 + insets.bottom
  const styles = useMemo(() => makeStyles(theme, bottom), [theme, bottom])

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

function makeStyles(c: ThemeColors, bottom: number) {
  return StyleSheet.create({
    fab: {
      position: 'absolute',
      right: 20,
      bottom,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 10,
      elevation: 6,
    },
  })
}
