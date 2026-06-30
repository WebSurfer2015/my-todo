/**
 * Theme picker — replaces the old Background picker. Shows the six color
 * themes as 3-tone pie swatches (50% brand · 25% accent · 25% accentBright);
 * tap to apply live. Sage + Sky are free; Blossom/Honey/Cream/Lilac are the
 * Premium pack. When `allThemesUnlocked` is false the premium ones render
 * locked and tapping one calls `onUpgrade` (closes + opens the paywall).
 */

import React, { useMemo } from 'react'
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native'
import { Check, Lock } from 'lucide-react-native'
import SheetShell from '../../ui/SheetShell'
import { useTheme, ThemeColors, themeSwatch, isFreeTheme } from '../../app/theme'
import { THEME_NAMES, type ThemeName } from '../../core-bindings/profile'

const LABELS: Record<ThemeName, string> = {
  sage: 'Sage',
  sky: 'Sky',
  lilac: 'Lilac',
  blossom: 'Blossom',
  honey: 'Honey',
  cream: 'Cream',
}

interface Props {
  visible: boolean
  value: ThemeName
  /** True when the user may use every theme (paid). When false, only the free
   * themes (Sage + Sky) are selectable; the rest are locked behind the paywall. */
  allThemesUnlocked: boolean
  onChange: (next: ThemeName) => void
  /** Tapping a locked theme routes here (close + open paywall). */
  onUpgrade: () => void
  onClose: () => void
}

export default function ThemeSelector({
  visible,
  value,
  allThemesUnlocked,
  onChange,
  onUpgrade,
  onClose,
}: Props) {
  const theme = useTheme()
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light'
  const styles = useMemo(() => makeStyles(theme), [theme])

  // Sage + Sky are free; the rest are the Premium pack. A locked tap opens the
  // paywall instead of applying.
  const isLocked = (name: ThemeName) => !allThemesUnlocked && !isFreeTheme(name)
  const pick = (name: ThemeName) => (isLocked(name) ? onUpgrade() : onChange(name))

  return (
    <SheetShell
      visible={visible}
      onClose={onClose}
      title="Theme"
      subtitle="Set the app's color"
      primary={{ label: 'Done', onPress: onClose }}
    >
      <View style={styles.grid}>
        {THEME_NAMES.map((name) => {
          const sw = themeSwatch(name, scheme)
          const selected = value === name
          const locked = isLocked(name)
          return (
            <TouchableOpacity
              key={name}
              style={styles.cell}
              activeOpacity={0.8}
              onPress={() => pick(name)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${LABELS[name]} theme${selected ? ', selected' : ''}${locked ? ', Premium — tap to upgrade' : ''}`}
            >
              <View
                style={[
                  styles.swatchRing,
                  selected && { borderColor: theme.primary, borderWidth: 3 },
                ]}
              >
                {/* 3-tone pie: left half = brand, right half split into
                    accent (top) + accentBright (bottom). Locked themes dim. */}
                <View style={[styles.pie, locked && styles.pieLocked]}>
                  <View style={[styles.pieHalf, { backgroundColor: sw.brand }]} />
                  <View style={styles.pieHalf}>
                    <View style={[styles.pieQuarter, { backgroundColor: sw.accent }]} />
                    <View style={[styles.pieQuarter, { backgroundColor: sw.accentBright }]} />
                  </View>
                </View>
                {selected && !locked && (
                  <View style={[styles.check, { backgroundColor: theme.primary }]}>
                    <Check size={14} color={theme.primaryOn} strokeWidth={3} />
                  </View>
                )}
                {locked && (
                  <View style={styles.lock}>
                    <Lock size={11} color="#FFFFFF" strokeWidth={2.5} />
                  </View>
                )}
              </View>
              <Text
                style={[
                  styles.label,
                  { color: selected ? theme.primary : theme.label2 },
                  selected && { fontWeight: '700' },
                ]}
              >
                {LABELS[name]}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </SheetShell>
  )
}

const SWATCH = 64

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 20,
      paddingVertical: 8,
    },
    cell: {
      width: '30%',
      alignItems: 'center',
      gap: 8,
    },
    swatchRing: {
      width: SWATCH + 6,
      height: SWATCH + 6,
      borderRadius: (SWATCH + 6) / 2,
      borderWidth: 1.5,
      borderColor: c.separator,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pie: {
      width: SWATCH,
      height: SWATCH,
      borderRadius: SWATCH / 2,
      overflow: 'hidden',
      flexDirection: 'row',
    },
    pieLocked: { opacity: 0.45 },
    pieHalf: { flex: 1 },
    pieQuarter: { flex: 1 },
    check: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: c.card,
    },
    lock: {
      position: 'absolute',
      top: -2,
      right: -2,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: { fontSize: 13, fontWeight: '500' },
  })
}
