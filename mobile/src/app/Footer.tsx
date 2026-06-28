import React, { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useLang } from './LangContext'
import { useTheme, ThemeColors } from './theme'

interface Props {
  completedCount: number
  onClearDone: () => void
  showClear?: boolean
}

export default function Footer({ completedCount, onClearDone, showClear = false }: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  if (!showClear || completedCount === 0) return null
  return (
    <View style={styles.footer}>
      <TouchableOpacity onPress={onClearDone} hitSlop={10} style={styles.clearBtn}>
        <Text style={styles.clear}>{t.clearAllCompleted}</Text>
      </TouchableOpacity>
    </View>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    footer: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingTop: 16,
      paddingBottom: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.separator,
      marginTop: 12,
    },
    clearBtn: { paddingVertical: 8, paddingHorizontal: 8 },
    clear: {
      fontSize: 13,
      color: c.red,
      fontWeight: '500',
    },
  })
}
