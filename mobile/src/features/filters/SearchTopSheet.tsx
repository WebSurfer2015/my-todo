/**
 * Top-anchored search panel that replaces the full-screen overlay.
 * Sits between the app header and the filter pills; while open, the
 * list below restricts live as the user types. Two explicit actions:
 *
 *   - Cancel (left)   — abandon the search, list reverts to unfiltered.
 *   - Search (right)  — commit; sheet dismisses but the query persists
 *                       as a removable pill (rendered by the parent
 *                       so it can join the existing filter pill row).
 *
 * Tapping the keyboard's "search" return-key also commits.
 *
 * Sizing is calibrated to iOS HIG (36 pt input, 17 pt input font,
 * 15 pt side buttons). Auto-focuses on open so the keyboard rises
 * immediately. Light haptic on clear to match iOS feel.
 */

import React, { useEffect, useMemo, useRef } from 'react'
import {
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Search as SearchIcon, X } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useLang } from '../../app/LangContext'
import { useTheme, ThemeColors } from '../../app/theme'

interface Props {
  visible: boolean
  placeholder: string
  query: string
  onQueryChange: (next: string) => void
  /** Abandon: clear + close. */
  onCancel: () => void
  /** Commit: keep the query, close the sheet. The parent then renders
   * the persistent pill (see SearchPill) and continues to filter the
   * list by `query`. */
  onSubmit: () => void
}

export default function SearchTopSheet({
  visible,
  placeholder,
  query,
  onQueryChange,
  onCancel,
  onSubmit,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const inputRef = useRef<TextInput>(null)

  useEffect(() => {
    if (!visible) return
    const handle = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(handle)
  }, [visible])

  if (!visible) return null

  const canSubmit = query.trim().length > 0

  return (
    <View style={styles.sheet}>
      <TouchableOpacity
        onPress={() => {
          Keyboard.dismiss()
          onCancel()
        }}
        hitSlop={10}
        style={styles.sideBtn}
        accessibilityRole="button"
        accessibilityLabel="Cancel search"
      >
        <Text style={styles.sideText}>{t.cancel}</Text>
      </TouchableOpacity>

      <View style={styles.inputWrap}>
        <SearchIcon size={15} color={theme.label3} strokeWidth={2} />
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={query}
          onChangeText={onQueryChange}
          placeholder={placeholder}
          placeholderTextColor={theme.label3}
          returnKeyType="search"
          onSubmitEditing={() => {
            if (canSubmit) onSubmit()
          }}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="never"
          selectionColor={theme.primary}
          maxLength={120}
          accessibilityLabel="Search"
        />
        {query.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              onQueryChange('')
              Haptics.selectionAsync().catch(() => {})
              inputRef.current?.focus()
            }}
            hitSlop={12}
            style={styles.clearBtn}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <View style={styles.clearGlyph}>
              <X size={12} color={theme.bg} strokeWidth={2.5} />
            </View>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        onPress={() => {
          Keyboard.dismiss()
          onSubmit()
        }}
        disabled={!canSubmit}
        hitSlop={10}
        style={styles.sideBtn}
        accessibilityRole="button"
        accessibilityLabel="Apply search"
      >
        <Text
          style={[
            styles.sideTextPrimary,
            !canSubmit && styles.sideTextDisabled,
          ]}
        >
          Search
        </Text>
      </TouchableOpacity>
    </View>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    sheet: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 8,
      backgroundColor: c.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    sideBtn: { paddingHorizontal: 2, paddingVertical: 6 },
    sideText: { fontSize: 15, color: c.primary, fontWeight: '500' },
    sideTextPrimary: { fontSize: 15, color: c.primary, fontWeight: '700' },
    sideTextDisabled: { color: c.gray3 },
    inputWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      height: 36,
      borderRadius: 10,
      backgroundColor: c.card,
    },
    input: {
      flex: 1,
      fontSize: 17,
      lineHeight: 22,
      color: c.label,
      paddingVertical: 0,
    },
    clearBtn: { paddingHorizontal: 2 },
    clearGlyph: {
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.label3,
    },
  })
}
