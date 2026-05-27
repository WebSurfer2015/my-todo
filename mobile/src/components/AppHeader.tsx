/**
 * Shared screen header rendered at the top of each tab (Home / Todos /
 * Groceries). Avatar on the left opens ProfileSheet, gear on the right
 * opens SettingsSheet — both via the cross-screen SheetContext so they
 * work the same way no matter which tab the user is on.
 *
 * The greeting + identity line come from useStore() so they stay
 * consistent across tabs. Each screen can pass its own `subtitle`
 * override when the identity line doesn't fit (e.g. a static screen
 * title like "Groceries").
 */

import React, { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Settings as SettingsIcon, Search as SearchIcon, Filter as FilterIcon } from 'lucide-react-native'
import { useStore } from '../StoreContext'
import { useSheets } from '../SheetContext'
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'
import Avatar from './Avatar'

interface Props {
  /** Static screen title (Todos / Groceries). When provided, the
   * greeting + identity line are replaced with just this title — the
   * tab IS the context, so the rotating greeting would be noise.
   * Home leaves it undefined to keep the warm greeting + quote. */
  title?: string
  /** When provided, the right-side gear icon is swapped for a
   * search icon and tapping it invokes this callback. Used by Todos
   * + Groceries (settings is reached from the Home tab instead, so
   * we don't lose access entirely). */
  onSearchPress?: () => void
  /** When provided, a filter (funnel) icon renders to the left of the
   * search/gear icon. Used by Todos to surface the Configure /
   * category-picker sheet from the header instead of the in-list
   * FilterBar pill. */
  onFilterPress?: () => void
  /** Tap handler for the gear icon. When omitted, gear isn't rendered
   * — Settings now lives inside ProfileSheet, so a screen that has no
   * tab-specific manage action just shows search (if any) and nothing
   * else on the right. */
  onGearPress?: () => void
}

export default function AppHeader({ title, onSearchPress, onFilterPress, onGearPress }: Props) {
  const store = useStore()
  const sheets = useSheets()
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.avatarTouch}
        onPress={sheets.openProfile}
        activeOpacity={0.7}
        accessibilityLabel={t.editProfile}
        accessibilityRole="button"
      >
        <Avatar avatar={store.profile.avatar} size={44} />
        <View style={styles.textWrap}>
          {title ? (
            <Text style={styles.screenTitle} numberOfLines={1}>
              {title}
            </Text>
          ) : (
            <>
              <Text style={styles.greeting} numberOfLines={1}>
                {store.headerLine}
              </Text>
              {store.identityLine ? (
                <Text
                  style={[
                    styles.identity,
                    store.identityLineIsQuote && styles.identityQuote,
                  ]}
                  numberOfLines={2}
                >
                  {store.identityLine}
                </Text>
              ) : null}
            </>
          )}
        </View>
      </TouchableOpacity>
      {onFilterPress && (
        <TouchableOpacity
          onPress={onFilterPress}
          style={styles.headerRightIcon}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Filter"
        >
          <FilterIcon size={22} color={theme.label3} strokeWidth={1.8} />
        </TouchableOpacity>
      )}
      {onSearchPress && (
        <TouchableOpacity
          onPress={onSearchPress}
          style={styles.headerRightIcon}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          <SearchIcon size={22} color={theme.label3} strokeWidth={1.8} />
        </TouchableOpacity>
      )}
      {onGearPress && (
        <TouchableOpacity
          onPress={onGearPress}
          style={styles.gearTouch}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Manage"
        >
          <SettingsIcon size={22} color={theme.label3} strokeWidth={1.8} />
        </TouchableOpacity>
      )}
    </View>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 12,
      // Same primarySoft tint that PebbleStrip uses, so the two
      // visually merge into one continuous header chrome region
      // instead of two stacked tinted bands. Theme-aware (avatar
      // theme retints both surfaces together) + dark-mode safe.
      backgroundColor: c.primarySoft,
    },
    avatarTouch: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    textWrap: { flex: 1, minWidth: 0 },
    screenTitle: {
      fontSize: 24,
      color: c.label,
      fontWeight: '700',
      letterSpacing: -0.3,
      lineHeight: 28,
    },
    greeting: {
      fontSize: 17,
      color: c.label,
      fontWeight: '700',
      letterSpacing: -0.2,
      lineHeight: 21,
    },
    identity: {
      fontSize: 13,
      color: c.label2,
      fontWeight: '500',
      marginTop: 2,
      lineHeight: 18,
    },
    identityQuote: {
      fontStyle: 'italic',
      color: c.label3,
    },
    gearTouch: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
    },
    headerRightIcon: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
    },
  })
}
