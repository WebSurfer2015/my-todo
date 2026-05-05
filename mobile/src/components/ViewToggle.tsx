import React, { useMemo } from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { ViewMode } from '../types'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'

interface Props {
  view: ViewMode
  onChange: (v: ViewMode) => void
}

export default function ViewToggle({ view, onChange }: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  return (
    <View style={styles.wrap}>
      <View style={styles.segmented}>
        {(['category', 'status'] as ViewMode[]).map((v) => {
          const active = view === v
          return (
            <TouchableOpacity
              key={v}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => onChange(v)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {t.views[v]}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

function makeStyles(c: ThemeColors) {
  const isDark = c.statusBar === 'light-content'
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 8,
    },
    segmented: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(118, 118, 128, 0.30)' : 'rgba(120, 120, 128, 0.16)',
      borderRadius: 9,
      padding: 2,
      gap: 2,
      width: '100%',
    },
    segment: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 7,
      borderRadius: 7,
      minHeight: 32,
    },
    segmentActive: {
      backgroundColor: isDark ? 'rgba(118, 118, 128, 0.55)' : '#fff',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0 : 0.10,
      shadowRadius: 2,
      elevation: isDark ? 0 : 2,
    },
    segmentText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.label2,
      letterSpacing: -0.16,
    },
    segmentTextActive: {
      color: c.label,
      fontWeight: '700',
    },
  })
}
