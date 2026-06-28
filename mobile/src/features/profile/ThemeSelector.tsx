/**
 * Theme picker — replaces the old Background picker. Shows the five color
 * themes as 3-tone pie swatches (50% brand · 25% accent · 25% accentBright);
 * tap to apply live. Sage + Sky are free; Blossom/Honey/Cream are the premium
 * pack, gated by `canUseThemes` (tapping a locked one opens the paywall).
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
import { useTheme, ThemeColors, themeSwatch } from '../../app/theme'
import { THEME_NAMES, type ThemeName } from '../../core-bindings/profile'
import { usePurchases } from '../../app/PurchasesContext'
import { canUseThemes } from '../../core-bindings/entitlements'

const FREE_THEMES: ThemeName[] = ['sage', 'sky']
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
  onChange: (next: ThemeName) => void
  onClose: () => void
}

export default function ThemeSelector({ visible, value, onChange, onClose }: Props) {
  const theme = useTheme()
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light'
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { tier, openPaywall } = usePurchases()
  const locked = !canUseThemes(tier)

  const pick = (name: ThemeName) => {
    if (!FREE_THEMES.includes(name) && locked) {
      openPaywall('Themes are a Premium feature.')
      return
    }
    onChange(name)
  }

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
          const isLocked = !FREE_THEMES.includes(name) && locked
          return (
            <TouchableOpacity
              key={name}
              style={styles.cell}
              activeOpacity={0.8}
              onPress={() => pick(name)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${LABELS[name]} theme${selected ? ', selected' : ''}${isLocked ? ', Premium' : ''}`}
            >
              <View
                style={[
                  styles.swatchRing,
                  selected && { borderColor: theme.primary, borderWidth: 3 },
                ]}
              >
                {/* 3-tone pie: left half = brand, right half split into
                    accent (top) + accentBright (bottom). */}
                <View style={styles.pie}>
                  <View style={[styles.pieHalf, { backgroundColor: sw.brand }]} />
                  <View style={styles.pieHalf}>
                    <View style={[styles.pieQuarter, { backgroundColor: sw.accent }]} />
                    <View style={[styles.pieQuarter, { backgroundColor: sw.accentBright }]} />
                  </View>
                </View>
                {selected && (
                  <View style={[styles.check, { backgroundColor: theme.primary }]}>
                    <Check size={14} color={theme.primaryOn} strokeWidth={3} />
                  </View>
                )}
                {isLocked && (
                  <View style={styles.lock}>
                    <Lock size={12} color="#FFFFFF" strokeWidth={2.5} />
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
