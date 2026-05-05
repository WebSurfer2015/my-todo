import React, { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'

interface Props {
  remaining: number
  completedCount: number
  onClearDone: () => void
}

export default function Footer({ remaining, completedCount, onClearDone }: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  if (remaining === 0 && completedCount === 0) return null
  return (
    <View style={styles.footer}>
      {remaining > 0
        ? <Text style={styles.text}>{t.remaining(remaining)}</Text>
        : <View />}
      {completedCount > 0 && (
        <TouchableOpacity onPress={onClearDone} hitSlop={10}>
          <Text style={styles.clear}>{t.clearAllCompleted}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 16,
      paddingBottom: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.separator,
      marginTop: 12,
    },
    text: {
      fontSize: 13,
      color: c.label3,
    },
    clear: {
      fontSize: 13,
      color: c.red,
      fontWeight: '500',
    },
  })
}
